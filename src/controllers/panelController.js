const { ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
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
} = require('../services/auditoriaService');
const logger = require('../utils/logger');

async function handleButton(interaction) {
  switch (interaction.customId) {
    case 'shift:start':
      return startShiftFlow(interaction);
    case 'shift:end':
      return endShiftFlow(interaction);
    case 'shift:status':
      return showShiftStatusFlow(interaction);
    case 'ride:new':
      return handleNewRideButton(interaction);
    default:
      return false;
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'ride:create') return false;

  if (!esTaxista(interaction.member)) {
    await interaction.reply({
      embeds: [embedError('No tienes permisos para registrar carreras.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const origin = interaction.fields.getTextInputValue('origin').trim();
  const destination = interaction.fields.getTextInputValue('destination').trim();
  const rawFare = interaction.fields.getTextInputValue('fare').trim();

  if (!origin || !destination) {
    await interaction.reply({
      embeds: [embedError('Origen y destino son obligatorios.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (!/^\d+$/.test(rawFare)) {
    await interaction.reply({
      embeds: [embedError('El valor debe contener solo numeros enteros.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const result = await registrarCarrera(interaction.user.id, {
    origin,
    destination,
    valor: Number(rawFare),
    channelId: interaction.channelId,
  });

  if (!result.ok) {
    await interaction.reply({ embeds: [embedError(result.msg)], flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.reply({
    embeds: [embedOk(
      'Carrera registrada',
      'Ahora envia la screenshot en este canal y quedara asociada automaticamente a esta carrera.',
      [
        { name: 'Origen', value: origin, inline: true },
        { name: 'Destino', value: destination, inline: true },
        { name: 'Valor', value: `$${Number(rawFare).toLocaleString()}`, inline: true },
      ],
    )],
  });

  await auditRideCreated(interaction, result.ride, {
    carreras: result.carreras,
    dineroTotal: result.dineroTotal,
  });

  return true;
}

async function handleMessage(message) {
  if (message.author.bot || !message.guild || message.attachments.size === 0) return false;

  const progress = await getProgreso(message.author.id);
  if (!progress.turnoActivo || !progress.pendingRide) return false;
  if (progress.activeShift?.channelId && progress.activeShift.channelId !== message.channelId) return false;

  const attachment = message.attachments.find(file => file.contentType?.startsWith('image/')) ?? message.attachments.first();
  if (!attachment) return false;

  const result = await adjuntarScreenshot(message.author.id, {
    url: attachment.url,
    filename: attachment.name,
    messageId: message.id,
  });

  if (!result.ok) {
    await message.reply({ embeds: [embedError(result.msg)] });
    return true;
  }

  await message.reply({
    embeds: [embedInfo(
      'Screenshot vinculada',
      'La evidencia quedo enlazada a tu ultima carrera.',
      [
        { name: 'Origen', value: result.ride.origin, inline: true },
        { name: 'Destino', value: result.ride.destination, inline: true },
        { name: 'Valor', value: `$${result.ride.valor.toLocaleString()}`, inline: true },
      ],
    )],
  });

  await auditScreenshotAttached(message, result.ride);

  return true;
}

async function publishPanel(interaction) {
  await interaction.reply({
    embeds: [buildTaxiPanelEmbed()],
    components: buildTaxiPanelRows(),
  });
}

async function startShiftFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({
      embeds: [embedError('No tienes el rol necesario para usar este panel.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = await getProgreso(interaction.user.id);
  if (existing.turnoActivo) {
    const channelText = existing.activeShift?.channelId
      ? `<#${existing.activeShift.channelId}>`
      : 'tu canal actual';
    await interaction.editReply({
      embeds: [embedError(`Ya tienes un turno activo. Continúa en ${channelText}.`)],
    });
    return true;
  }

  // Crear canal ANTES de tocar el storage
  let shiftChannel;
  try {
    shiftChannel = await createShiftChannel(interaction);
  } catch (error) {
    logger.error(`Error creando canal de turno para ${interaction.user.id}: ${error.message}`);
    await interaction.editReply({
      embeds: [embedError('No se pudo crear tu canal de turno. Verifica que el bot tenga permisos de gestionar canales.')],
    });
    return true;
  }

  const result = await iniciarTurno(interaction.user.id, {
    displayName: interaction.member.displayName,
    channelId: shiftChannel.id,
  });

  if (!result.ok) {
    // Si el storage falla, eliminar el canal creado para no dejar basura
    try { await shiftChannel.delete('Turno no pudo iniciarse en storage'); } catch { /* ignorar */ }
    await interaction.editReply({ embeds: [embedError(result.msg)] });
    return true;
  }

  try {
    await shiftChannel.send({
      content: `${interaction.user}`,
      embeds: [buildShiftChannelEmbed(interaction.member.displayName, result.taxista)],
      components: buildShiftChannelRows(),
    });
  } catch (error) {
    logger.error(`No se pudo publicar el panel del turno en ${shiftChannel.id}: ${error.message}`);

    await interaction.editReply({
      embeds: [embedError('Se creó el canal, pero el bot no pudo escribir en él. Revisa permisos del bot y la categoría configurada.')],
    });
    return true;
  }

  await interaction.editReply({
    embeds: [embedOk(
      'Turno iniciado',
      `Tu canal privado de trabajo está listo en ${shiftChannel}.`,
      [{ name: 'Siguiente paso', value: 'Usa el botón "Registrar carrera" dentro del canal.', inline: false }],
    )],
  });

  await auditShiftStarted(interaction, shiftChannel, result.taxista);

  return true;
}

async function endShiftFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({ embeds: [embedError('No tienes el rol necesario para usar este panel.')], flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const progress = await getProgreso(interaction.user.id);
  const result = await finalizarTurno(interaction.user.id);

  if (!result.ok) {
    await interaction.editReply({ embeds: [embedError(result.msg)] });
    return true;
  }

  if (progress.activeShift?.channelId) {
    try {
      const shiftChannel = await interaction.guild.channels.fetch(progress.activeShift.channelId);

      if (shiftChannel) {
        await shiftChannel.delete(`Canal de turno cerrado por ${interaction.user.tag}`);
      }
    } catch (error) {
      logger.warn(`No se pudo cerrar el canal ${progress.activeShift.channelId}: ${error.message}`);
    }
  }

  await interaction.editReply({
    embeds: [buildShiftSummaryEmbed(interaction.member.displayName, result.resumen)],
  });

  await auditShiftEnded(interaction, result.resumen, progress.activeShift?.channelId ?? null);

  return true;
}

async function showShiftStatusFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({
      embeds: [embedError('No tienes el rol necesario para usar este panel.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const progress = await getProgreso(interaction.user.id);
  const estado = progress.turnoActivo ? 'Activo' : 'Sin turno';
  const startedAt = progress.inicioTurno
    ? `<t:${Math.floor(new Date(progress.inicioTurno).getTime() / 1000)}:R>`
    : 'N/D';

  await interaction.reply({
    embeds: [embedInfo(
      `Estado de turno - ${interaction.member.displayName}`,
      'Resumen rapido de tu jornada actual.',
      [
        { name: 'Estado', value: estado, inline: true },
        { name: 'Inicio', value: startedAt, inline: true },
        { name: 'Carreras', value: `${progress.carreras}`, inline: true },
        { name: 'Dinero', value: `$${Number(progress.dineroTotal).toLocaleString()}`, inline: true },
        { name: 'Canal', value: progress.activeShift?.channelId ? `<#${progress.activeShift.channelId}>` : 'N/D', inline: true },
        { name: 'Pendiente screenshot', value: progress.pendingRide ? 'Si' : 'No', inline: true },
      ],
    )],
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

async function handleNewRideButton(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({
      embeds: [embedError('No tienes permisos para registrar carreras.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const progress = await getProgreso(interaction.user.id);
  if (!progress.turnoActivo) {
    await interaction.reply({
      embeds: [embedError('Debes iniciar un turno antes de registrar carreras.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (progress.activeShift?.channelId && progress.activeShift.channelId !== interaction.channelId) {
    await interaction.reply({
      embeds: [embedError(`Registra tus carreras solo dentro de <#${progress.activeShift.channelId}>.`)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (progress.pendingRide) {
    await interaction.reply({
      embeds: [embedError('Tienes una carrera pendiente de screenshot. Adjunta la imagen antes de registrar otra.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.showModal(buildRideModal());
  return true;
}

async function createShiftChannel(interaction) {
  const guild = interaction.guild;
  const botMember = guild.members.me;
  const roleOverwrites = getSupervisorRoles(guild).map(role => ({
    id: role.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
    ],
  }));

  // Últimos 4 dígitos del userId para evitar colisiones de nombre
  const uniqueSuffix = interaction.user.id.slice(-4);
  const channelName = `${config.shiftChannelPrefix}-${sanitizeChannelName(interaction.member.displayName)}-${uniqueSuffix}`.slice(0, 100);

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.taxiCategoryId ?? undefined,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
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
    topic: `Canal de turno — ${interaction.user.tag} (${interaction.user.id})`,
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
