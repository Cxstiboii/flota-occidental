const { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const storage = require('../storage');
const {
  iniciarTurno,
  finalizarTurno,
  registrarCarrera,
  adjuntarScreenshot,
  getProgreso,
} = require('../services/turnoService');
const { buildRideModal } = require('../ui/modals');
const {
  buildShiftChannelEmbed,
  buildShiftChannelRows,
  buildShiftSummaryEmbed,
  buildTaxiPanelEmbed,
  buildTaxiPanelRows,
} = require('../ui/panelView');
const { embedError, embedInfo, embedOk } = require('../utils/embeds');
const { esTaxista, getSupervisorRoles } = require('../utils/permisos');
const {
  auditRideCreated,
  auditScreenshotAttached,
  auditShiftEnded,
  auditShiftStarted,
  alertShiftEndedPendientes,
  alertCarreraFueraDeRango,
  alertMaxCarrerasAlcanzado,
} = require('../services/auditoriaService');
const { verificarYAscender } = require('../services/rangosService');
const { limpiarAlertaTurno } = require('../services/turnoMonitor');
const { getPanelMessageId, setPanelMessageId } = require('../services/panelState');
const { triggerDashboardUpdate, notifyNewRide } = require('../services/dashboardService');
const logger = require('../utils/logger');
const { safeReply, safeDeferReply, safeEditReply, safeShowModal, safeSend } = require('../utils/discordResponses');

async function handleButton(interaction) {
  switch (interaction.customId) {
    case 'shift:start':  return startShiftFlow(interaction);
    case 'shift:end':    return endShiftFlow(interaction);
    case 'shift:status': return showShiftStatusFlow(interaction);
    case 'ride:new':     return handleNewRideButton(interaction);
    default:             return false;
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'ride:create') return false;

  if (!esTaxista(interaction.member)) {
    await safeReply(interaction, {
      embeds: [embedError('No tienes permisos para registrar carreras.')],
      flags: MessageFlags.Ephemeral,
    }, 'modal=ride:create no-role');
    return true;
  }

  const origin    = interaction.fields.getTextInputValue('origin').trim();
  const destination = interaction.fields.getTextInputValue('destination').trim();
  const rawFare   = interaction.fields.getTextInputValue('fare').trim();

  if (!origin || !destination) {
    await safeReply(interaction, {
      embeds: [embedError('Origen y destino son obligatorios.')],
      flags: MessageFlags.Ephemeral,
    }, 'modal=ride:create invalid-route');
    return true;
  }

  if (!/^\d+$/.test(rawFare)) {
    await safeReply(interaction, {
      embeds: [embedError('El valor debe contener solo numeros enteros.')],
      flags: MessageFlags.Ephemeral,
    }, 'modal=ride:create invalid-fare');
    return true;
  }

  const result = await registrarCarrera(interaction.user.id, {
    origin,
    destination,
    valor: Number(rawFare),
    channelId: interaction.channelId,
  });

  if (!result.ok) {
    // Enviar alerta a supervisores si aplica, sin bloquear la respuesta al taxista
    if (result.code === 'VALOR_MAX') {
      alertCarreraFueraDeRango(interaction.client, interaction.guild, interaction.member, result).catch(() => {});
    } else if (result.code === 'MAX_CARRERAS') {
      alertMaxCarrerasAlcanzado(interaction.client, interaction.guild, interaction.member, result).catch(() => {});
    }
    await safeReply(interaction, { embeds: [embedError(result.msg)], flags: MessageFlags.Ephemeral }, 'modal=ride:create service-error');
    return true;
  }

  await safeReply(interaction, {
    embeds: [embedOk(
      'Carrera registrada',
      'Ahora envia la screenshot en este canal y quedara asociada automaticamente a esta carrera.',
      [
        { name: 'Origen',  value: origin,                                       inline: true },
        { name: 'Destino', value: destination,                                  inline: true },
        { name: 'Valor',   value: `$${Number(rawFare).toLocaleString()}`,       inline: true },
      ],
    )],
  }, 'modal=ride:create success');

  await auditRideCreated(interaction, result.ride, {
    carreras: result.carreras,
    dineroTotal: result.dineroTotal,
  });
  notifyNewRide();

  return true;
}

async function handleMessage(message) {
  if (message.author.bot || !message.guild || message.attachments.size === 0) return false;

  const progress = await getProgreso(message.author.id);
  if (!progress.turnoActivo || !progress.pendingRide) return false;
  if (progress.activeShift?.channelId && progress.activeShift.channelId !== message.channelId) return false;

  const attachment = message.attachments.find(f => f.contentType?.startsWith('image/')) ?? message.attachments.first();
  if (!attachment) return false;

  const result = await adjuntarScreenshot(message.author.id, {
    url: attachment.url,
    filename: attachment.name,
    messageId: message.id,
  });

  if (!result.ok) {
    await safeSend(message.channel, {
      content: `<@${message.author.id}>`,
      embeds: [embedError(result.msg)],
    }, `message=${message.id} screenshot-error`);
    return true;
  }

  await safeSend(message.channel, {
    content: `<@${message.author.id}>`,
    embeds: [embedInfo(
      'Screenshot vinculada',
      'La evidencia quedo enlazada a tu ultima carrera.',
      [
        { name: 'Origen',  value: result.ride.origin,                             inline: true },
        { name: 'Destino', value: result.ride.destination,                        inline: true },
        { name: 'Valor',   value: `$${result.ride.valor.toLocaleString()}`,       inline: true },
      ],
    )],
  }, `message=${message.id} screenshot-success`);

  // Auditoría y eventos post-screenshot en paralelo (no bloquean la respuesta)
  Promise.allSettled([
    auditScreenshotAttached(message, result.ride),
    publicarEnHistorial(message.client, result.ride, message.member, progress.carreras),
    verificarYAscender(message.member, progress.totalCarreras, message.client),
  ]).catch(() => {});

  return true;
}

async function publishPanel(interaction) {
  const allData      = await storage.getAll();
  const activosCount = Object.values(allData).filter(d => d.turnoActivo).length;

  const panelPayload = {
    embeds: [buildTaxiPanelEmbed(activosCount)],
    components: buildTaxiPanelRows(),
  };

  const existingId = getPanelMessageId();
  if (existingId) {
    try {
      const msg = await interaction.channel.messages.fetch(existingId);
      await msg.edit(panelPayload);
      await safeReply(interaction, {
        embeds: [embedOk('Panel actualizado', 'El embed del panel fue editado en su lugar.')],
        flags: MessageFlags.Ephemeral,
      }, 'publish-panel-edit');
      return;
    } catch {
      logger.warn(`Mensaje de panel ${existingId} no encontrado, creando uno nuevo.`);
      setPanelMessageId(null);
    }
  }

  const msg = await safeSend(interaction.channel, panelPayload, 'publish-panel');
  if (msg) {
    setPanelMessageId(msg.id);
    logger.info(`[Panel] Nuevo mensaje creado (id=${msg.id}) — actualiza TAXI_PANEL_MESSAGE_ID=${msg.id} en .env`);
  }

  await safeReply(interaction, {
    embeds: [embedOk('Panel publicado', 'El panel de turno fue enviado a este canal.')],
    flags: MessageFlags.Ephemeral,
  }, 'publish-panel-confirm');
}

async function startShiftFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await safeReply(interaction, {
      embeds: [embedError('No tienes el rol necesario para usar este panel.')],
      flags: MessageFlags.Ephemeral,
    }, 'shift:start no-role');
    return true;
  }

  await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral }, 'shift:start');

  const existing = await getProgreso(interaction.user.id);
  if (existing.turnoActivo) {
    const channelText = existing.activeShift?.channelId
      ? `<#${existing.activeShift.channelId}>`
      : 'tu canal actual';
    await safeEditReply(interaction, {
      embeds: [embedError(`Ya tienes un turno activo. Continúa en ${channelText}.`)],
    }, 'shift:start already-active');
    return true;
  }

  let shiftChannel;
  try {
    shiftChannel = await createShiftChannel(interaction);
  } catch (error) {
    logger.error(`Error creando canal de turno para ${interaction.user.id}: ${error.message}`);
    await safeEditReply(interaction, {
      embeds: [embedError('No se pudo crear tu canal de turno. Verifica que el bot tenga permisos de gestionar canales.')],
    }, 'shift:start create-channel-failed');
    return true;
  }

  const result = await iniciarTurno(interaction.user.id, {
    displayName: interaction.member.displayName,
    channelId: shiftChannel.id,
  });

  if (!result.ok) {
    try { await shiftChannel.delete('Turno no pudo iniciarse en storage'); } catch { /* ignorar */ }
    await safeEditReply(interaction, { embeds: [embedError(result.msg)] }, 'shift:start storage-error');
    return true;
  }

  // Asignar rol "En turno" sin interrumpir el flujo si falla
  if (config.rolEnTurnoId) {
    interaction.member.roles.add(config.rolEnTurnoId).catch(err =>
      logger.warn(`[RolTurno] No se pudo asignar rol en turno a ${interaction.user.id}: ${err.message}`)
    );
  }

  try {
    await safeSend(shiftChannel, {
      content: `${interaction.user}`,
      embeds: [buildShiftChannelEmbed(interaction.member.displayName, result.taxista)],
      components: buildShiftChannelRows(),
    }, `shift-channel=${shiftChannel.id}`);
  } catch (error) {
    logger.error(`No se pudo publicar el panel del turno en ${shiftChannel.id}: ${error.message}`);
    await safeEditReply(interaction, {
      embeds: [embedError('Se creó el canal, pero el bot no pudo escribir en él. Revisa permisos del bot y la categoría configurada.')],
    }, 'shift:start channel-send-failed');
    return true;
  }

  await safeEditReply(interaction, {
    embeds: [embedOk(
      'Turno iniciado',
      `Tu canal privado de trabajo está listo en <#${shiftChannel.id}>.`,
      [{ name: 'Siguiente paso', value: 'Usa el botón "Registrar carrera" dentro del canal.', inline: false }],
    )],
  }, 'shift:start success');

  await auditShiftStarted(interaction, shiftChannel, result.taxista);
  triggerDashboardUpdate();

  return true;
}

async function endShiftFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await safeReply(interaction, { embeds: [embedError('No tienes el rol necesario para usar este panel.')], flags: MessageFlags.Ephemeral }, 'shift:end no-role');
    return true;
  }

  await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral }, 'shift:end');

  const result = await finalizarTurno(interaction.user.id);

  if (!result.ok) {
    await safeEditReply(interaction, { embeds: [embedError(result.msg)] }, 'shift:end service-error');
    return true;
  }

  // Retirar rol "En turno" sin interrumpir el flujo si falla
  if (config.rolEnTurnoId) {
    interaction.member.roles.remove(config.rolEnTurnoId).catch(err =>
      logger.warn(`[RolTurno] No se pudo retirar rol en turno de ${interaction.user.id}: ${err.message}`)
    );
  }

  // Limpiar alerta de turno extendido para este usuario
  limpiarAlertaTurno(interaction.user.id);

  const channelId = result.resumen.channelId;
  if (channelId) {
    try {
      const shiftChannel = await interaction.guild.channels.fetch(channelId);
      if (shiftChannel) await shiftChannel.delete(`Canal de turno cerrado por ${interaction.user.username}`);
    } catch (error) {
      logger.warn(`No se pudo cerrar el canal ${channelId}: ${error.message}`);
    }
  }

  await safeEditReply(interaction, {
    embeds: [buildShiftSummaryEmbed(interaction.member.displayName, result.resumen)],
  }, 'shift:end success');

  // Eventos post-finalización en paralelo
  const pendientes = Number(result.resumen.pendientesCaptura ?? 0);
  Promise.allSettled([
    auditShiftEnded(interaction, result.resumen, channelId ?? null),
    pendientes > 0
      ? alertShiftEndedPendientes(interaction.client, result.resumen, interaction.member)
      : Promise.resolve(),
    verificarYAscender(interaction.member, result.taxista.totalCarreras, interaction.client),
  ]).catch(() => {});
  triggerDashboardUpdate();

  return true;
}

async function showShiftStatusFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await safeReply(interaction, {
      embeds: [embedError('No tienes el rol necesario para usar este panel.')],
      flags: MessageFlags.Ephemeral,
    }, 'shift:status no-role');
    return true;
  }

  const progress   = await getProgreso(interaction.user.id);
  const estado     = progress.turnoActivo ? 'Activo' : 'Sin turno';
  const startedAt  = progress.inicioTurno
    ? `<t:${Math.floor(new Date(progress.inicioTurno).getTime() / 1000)}:R>`
    : 'N/D';

  await safeReply(interaction, {
    embeds: [embedInfo(
      `Estado de turno - ${interaction.member.displayName}`,
      'Resumen rapido de tu jornada actual.',
      [
        { name: 'Estado',              value: estado,                                                                          inline: true },
        { name: 'Inicio',              value: startedAt,                                                                       inline: true },
        { name: 'Carreras',            value: `${progress.carreras}`,                                                          inline: true },
        { name: 'Dinero',              value: `$${Number(progress.dineroTotal).toLocaleString()}`,                             inline: true },
        { name: 'Canal',               value: progress.activeShift?.channelId ? `<#${progress.activeShift.channelId}>` : 'N/D', inline: true },
        { name: 'Pendiente screenshot', value: progress.pendingRide ? 'Si' : 'No',                                            inline: true },
      ],
    )],
    flags: MessageFlags.Ephemeral,
  }, 'shift:status');
  return true;
}

async function handleNewRideButton(interaction) {
  if (!esTaxista(interaction.member)) {
    await safeReply(interaction, {
      embeds: [embedError('No tienes permisos para registrar carreras.')],
      flags: MessageFlags.Ephemeral,
    }, 'ride:new no-role');
    return true;
  }

  const progress = await getProgreso(interaction.user.id);
  if (!progress.turnoActivo) {
    await safeReply(interaction, {
      embeds: [embedError('Debes iniciar un turno antes de registrar carreras.')],
      flags: MessageFlags.Ephemeral,
    }, 'ride:new no-shift');
    return true;
  }

  if (progress.activeShift?.channelId && progress.activeShift.channelId !== interaction.channelId) {
    await safeReply(interaction, {
      embeds: [embedError(`Registra tus carreras solo dentro de <#${progress.activeShift.channelId}>.`)],
      flags: MessageFlags.Ephemeral,
    }, 'ride:new wrong-channel');
    return true;
  }

  if (progress.pendingRide) {
    await safeReply(interaction, {
      embeds: [embedError('Tienes una carrera pendiente de screenshot. Adjunta la imagen antes de registrar otra.')],
      flags: MessageFlags.Ephemeral,
    }, 'ride:new pending-screenshot');
    return true;
  }

  await safeShowModal(interaction, buildRideModal(), 'ride:new show-modal');
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function publicarEnHistorial(client, ride, member, carrerasEnTurno) {
  if (!config.historialChannelId) return;

  try {
    const channel = await client.channels.fetch(config.historialChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x2ED573)
      .setTitle('🏁 Carrera Completada')
      .addFields(
        { name: 'Taxista',          value: member?.displayName ?? 'Desconocido',           inline: true },
        { name: 'Origen',           value: ride.origin,                                     inline: true },
        { name: 'Destino',          value: ride.destination,                                inline: true },
        { name: 'Valor',            value: `$${Number(ride.valor).toLocaleString()}`,       inline: true },
        { name: 'Hora',             value: `<t:${Math.floor(new Date(ride.createdAt).getTime() / 1000)}:F>`, inline: true },
        { name: 'Carrera del turno', value: `#${carrerasEnTurno}`,                         inline: true },
      )
      .setImage(ride.screenshotUrl)
      .setFooter({ text: 'Flota Occidental' })
      .setTimestamp();

    await safeSend(channel, { embeds: [embed] }, `historial-carrera rideId=${ride.id}`);
  } catch (error) {
    logger.warn(`[Historial] No se pudo publicar carrera en historial: ${error.message}`);
  }
}

async function createShiftChannel(interaction) {
  const guild      = interaction.guild;
  const botMember  = guild.members.me;
  const roleOverwrites = getSupervisorRoles(guild).map(role => ({
    id: role.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
    ],
  }));

  const uniqueSuffix = interaction.user.id.slice(-4);
  const channelName  = `${config.shiftChannelPrefix}-${sanitizeChannelName(interaction.member.displayName)}-${uniqueSuffix}`.slice(0, 100);

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.taxiCategoryId ?? undefined,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageRoles,
        ],
      },
      ...roleOverwrites,
    ],
    topic: `Canal de turno — ${interaction.user.username} (${interaction.user.id})`,
  });
}

function sanitizeChannelName(input) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'taxista';
}

module.exports = {
  handleButton,
  handleModalSubmit,
  handleMessage,
  publishPanel,
  startShiftFlow,
  endShiftFlow,
  showShiftStatusFlow,
};
