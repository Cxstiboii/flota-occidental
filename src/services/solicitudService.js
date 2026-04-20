const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { safeSend, safeDeferReply, safeEditReply } = require('../utils/discordResponses');
const { esTaxista } = require('../utils/permisos');
const { getSolicitudMessageId, setSolicitudMessageId } = require('./solicitudState');
const Solicitud = require('../storage/models/Solicitud');
const Blacklist = require('../storage/models/Blacklist');
const {
  buildSolicitudPanelEmbed,
  buildSolicitudPanelRow,
  buildSolicitudEmbed,
  buildStaffActionRow,
  buildStaffNotifEmbed,
  buildCitaEmbed,
  buildDMAprobado,
  buildDMRechazado,
  buildDMCita,
  buildDMBlacklist,
} = require('../ui/solicitudView');

// ── Helpers de permisos ──────────────────────────────────────────────────────

function esStaffSolicitudes(member) {
  const { roleSupervisorIds, roleSupervisor, roleDuenoIds, roleDueno, rolDireccionId } = config;
  const cache = member.roles.cache;
  return (
    roleSupervisorIds.some(id => id && cache.has(id))   ||
    cache.some(r => roleSupervisor.includes(r.name))    ||
    roleDuenoIds.some(id => id && cache.has(id))        ||
    cache.some(r => roleDueno.includes(r.name))         ||
    Boolean(rolDireccionId && cache.has(rolDireccionId))
  );
}

function esDireccionODueno(member) {
  const { roleDuenoIds, roleDueno, rolDireccionId } = config;
  const cache = member.roles.cache;
  return (
    roleDuenoIds.some(id => id && cache.has(id))        ||
    cache.some(r => roleDueno.includes(r.name))         ||
    Boolean(rolDireccionId && cache.has(rolDireccionId))
  );
}

// ── Verificación de elegibilidad ─────────────────────────────────────────────

async function verificarElegibilidad(userId, guildId, member) {
  // 1. Solicitud pendiente activa
  const pending = await Solicitud.findOne({ userId, guildId, estado: 'pendiente' });
  if (pending) {
    return { ok: false, razon: 'Ya tienes una solicitud en proceso. Revisa tu ticket activo.' };
  }

  // 2. Ya es miembro de la flota
  if (member && esTaxista(member)) {
    return { ok: false, razon: 'Ya eres miembro de Flota Occidental.' };
  }

  // 3. En blacklist
  const blacklisted = await Blacklist.findOne({ userId, guildId });
  if (blacklisted) {
    return {
      ok: false,
      razon: 'Tu solicitud no puede ser procesada. Contacta al staff si crees que es un error.',
    };
  }

  // 4. Rechazo reciente (7 días)
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recentRejection = await Solicitud.findOne({
    userId, guildId,
    estado: 'rechazado',
    fechaRechazo: { $gte: cutoff },
  });
  if (recentRejection) {
    const nextDate = new Date(recentRejection.fechaRechazo.getTime() + 3 * 24 * 60 * 60 * 1000);
    const ts = Math.floor(nextDate.getTime() / 1000);
    return {
      ok: false,
      razon: `Tu solicitud fue rechazada recientemente. Podrás volver a aplicar el <t:${ts}:F>.`,
    };
  }

  return { ok: true };
}

// ── Creación del canal de ticket ─────────────────────────────────────────────

async function crearTicketChannel(guild, applicantMember, nombrePersonaje) {
  const slug = nombrePersonaje
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  const channelName = `solicitud-${slug}-${suffix}`;

  const overwrites = [
    {
      id:   guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id:    applicantMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id:    guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  const staffRoleIds = [
    ...config.roleSupervisorIds,
    ...config.roleDuenoIds,
    config.rolDireccionId,
  ].filter(Boolean);

  for (const roleId of staffRoleIds) {
    overwrites.push({
      id:    roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  return guild.channels.create({
    name:                channelName,
    type:                ChannelType.GuildText,
    parent:              config.solicitudesCategoryId || undefined,
    permissionOverwrites: overwrites,
  });
}

// ── Helper: editar embed del ticket tras una acción ──────────────────────────

async function editarEmbedTicket(solicitud, client) {
  if (!solicitud.ticketChannelId || !solicitud.embedMessageId) return;
  try {
    const channel = await client.channels.fetch(solicitud.ticketChannelId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(solicitud.embedMessageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [buildSolicitudEmbed(solicitud)] });
  } catch (err) {
    logger.warn(`No se pudo editar embed del ticket ${solicitud.solicitudId}: ${err.message}`);
  }
}

// ── Helper: eliminar canal con cuenta regresiva ──────────────────────────────

async function eliminarCanalConCuenta(ticketChannel) {
  await safeSend(ticketChannel, '🗑️ Este canal se eliminará en **10 segundos**...');
  setTimeout(async () => {
    try {
      await ticketChannel.delete();
    } catch (err) {
      logger.warn(`No se pudo eliminar canal ticket ${ticketChannel.id}: ${err.message}`);
    }
  }, 10_000);
}

// ── Helper: buscar solicitud y validar que no esté cerrada ───────────────────

async function obtenerSolicitudActiva(solicitudId) {
  const solicitud = await Solicitud.findOne({ solicitudId });
  if (!solicitud) return { ok: false, msg: 'Solicitud no encontrada.' };
  if (['aprobado', 'rechazado'].includes(solicitud.estado)) {
    return { ok: false, msg: 'Esta solicitud ya fue procesada.' };
  }
  return { ok: true, solicitud };
}

// ── Flujo principal: procesar nueva solicitud ────────────────────────────────

async function procesarNuevaSolicitud(interaction) {
  await safeDeferReply(interaction, { ephemeral: true }, 'procesarNuevaSolicitud');

  const { guild, member, user } = interaction;

  const nombrePersonaje = interaction.fields.getTextInputValue('nombre_personaje');
  const nombreServidor  = interaction.fields.getTextInputValue('nombre_servidor');
  const tiempoCiudad    = interaction.fields.getTextInputValue('tiempo_ciudad');
  const conducta        = interaction.fields.getTextInputValue('conducta');
  const motivacion      = interaction.fields.getTextInputValue('motivacion');

  const { ok, razon } = await verificarElegibilidad(user.id, guild.id, member);
  if (!ok) {
    return safeEditReply(interaction, { content: razon }, 'eligibilidad');
  }

  const solicitudId = `sol_${user.id}_${Date.now()}`;

  let ticketChannel;
  try {
    ticketChannel = await crearTicketChannel(guild, member, nombrePersonaje);
  } catch (err) {
    logger.error(`No se pudo crear canal ticket: ${err.message}`);
    return safeEditReply(
      interaction,
      { content: 'No se pudo crear el canal de ticket. Contacta a un administrador.' },
      'crearCanal',
    );
  }

  const solicitud = await Solicitud.create({
    solicitudId,
    userId:          user.id,
    guildId:         guild.id,
    nombrePersonaje,
    nombreServidor,
    tiempoCiudad,
    conducta,
    motivacion,
    ticketChannelId: ticketChannel.id,
    fechaSolicitud:  new Date(),
  });

  // Embed + botones de staff en el canal ticket
  const embedMsg = await safeSend(
    ticketChannel,
    { embeds: [buildSolicitudEmbed(solicitud)], components: [buildStaffActionRow(solicitudId)] },
    `ticket-embed solicitudId=${solicitudId}`,
  );
  if (embedMsg) {
    await Solicitud.updateOne({ solicitudId }, { embedMessageId: embedMsg.id });
  }

  // Solicitud de fotos
  await safeSend(
    ticketChannel,
    `📸 **${nombrePersonaje}**, si tienes fotos de reportes abiertos, envíalas en este canal ahora. Si no tienes, escribe \`sin reportes\`.`,
    `ticket-foto solicitudId=${solicitudId}`,
  );

  // Notificación al canal de staff
  if (config.solicitudesStaffChannelId) {
    const staffCh = await guild.channels.fetch(config.solicitudesStaffChannelId).catch(() => null);
    if (staffCh) {
      await safeSend(
        staffCh,
        { embeds: [buildStaffNotifEmbed(solicitud, ticketChannel)] },
        `staff-notif solicitudId=${solicitudId}`,
      );
    }
  }

  await safeEditReply(
    interaction,
    { content: `✅ Tu solicitud ha sido enviada. Revisa tu canal: ${ticketChannel}` },
    'solicitudEnviada',
  );
}

// ── Acción: aprobar ──────────────────────────────────────────────────────────

async function aprobarSolicitud(interaction, solicitudId) {
  await safeDeferReply(interaction, { ephemeral: true }, 'aprobarSolicitud');

  if (!esStaffSolicitudes(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const { ok, msg, solicitud } = await obtenerSolicitudActiva(solicitudId);
  if (!ok) return safeEditReply(interaction, { content: msg });

  const applicantMember = await interaction.guild.members.fetch(solicitud.userId).catch(() => null);

  await Solicitud.updateOne({ solicitudId }, {
    estado:          'aprobado',
    fechaAprobacion: new Date(),
    procesadoPor:    interaction.user.id,
  });

  // Asignar rol de período de prueba
  if (applicantMember && config.rolPeriodoPruebaId) {
    await applicantMember.roles.add(config.rolPeriodoPruebaId).catch(err =>
      logger.warn(`No se pudo asignar rol de período de prueba a ${solicitud.userId}: ${err.message}`),
    );
  }

  // Establecer nickname igual al nombre GTA
  if (applicantMember && solicitud.nombreServidor) {
    await applicantMember.setNickname(solicitud.nombreServidor).catch(err =>
      logger.warn(`No se pudo cambiar nickname de ${solicitud.userId}: ${err.message}`),
    );
  }

  // Editar embed del ticket
  await editarEmbedTicket({ ...solicitud.toObject(), estado: 'aprobado' }, interaction.client);

  // Mensaje en el canal ticket
  const ticketCh = await interaction.guild.channels.fetch(solicitud.ticketChannelId).catch(() => null);
  if (ticketCh) {
    await safeSend(
      ticketCh,
      `✅ Solicitud aprobada por ${interaction.user}. <@${solicitud.userId}> bienvenido al proceso de incorporación.\n` +
      `Dirígete a #verificacion cuando hayas completado el período de prueba.`,
      `aprobacion ticketCh=${solicitud.ticketChannelId}`,
    );
  }

  // DM al aplicante
  if (applicantMember) {
    try {
      await applicantMember.send({ embeds: [buildDMAprobado()] });
    } catch (err) {
      logger.warn(`No se pudo enviar DM de aprobación a ${solicitud.userId}: ${err.message}`);
    }
  }

  await safeEditReply(
    interaction,
    { content: `✅ Solicitud de **${solicitud.nombrePersonaje}** aprobada correctamente.` },
  );
}

// ── Acción: rechazar (llamada desde modal submit) ────────────────────────────

async function rechazarSolicitud(interaction, solicitudId, motivo) {
  await safeDeferReply(interaction, { ephemeral: true }, 'rechazarSolicitud');

  if (!esStaffSolicitudes(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const { ok, msg, solicitud } = await obtenerSolicitudActiva(solicitudId);
  if (!ok) return safeEditReply(interaction, { content: msg });

  await Solicitud.updateOne({ solicitudId }, {
    estado:        'rechazado',
    fechaRechazo:  new Date(),
    motivoRechazo: motivo,
    procesadoPor:  interaction.user.id,
  });

  // Editar embed del ticket
  await editarEmbedTicket({ ...solicitud.toObject(), estado: 'rechazado' }, interaction.client);

  // DM al aplicante
  try {
    const applicantMember = await interaction.guild.members.fetch(solicitud.userId).catch(() => null);
    if (applicantMember) await applicantMember.send({ embeds: [buildDMRechazado(motivo)] });
  } catch (err) {
    logger.warn(`No se pudo enviar DM de rechazo a ${solicitud.userId}: ${err.message}`);
  }

  // Eliminar canal con cuenta regresiva
  const ticketCh = await interaction.guild.channels.fetch(solicitud.ticketChannelId).catch(() => null);
  if (ticketCh) await eliminarCanalConCuenta(ticketCh);

  await safeEditReply(
    interaction,
    { content: `❌ Solicitud de **${solicitud.nombrePersonaje}** rechazada.` },
  );
}

// ── Acción: agendar cita (llamada desde modal submit) ────────────────────────

async function agendarCita(interaction, solicitudId, citaData) {
  await safeDeferReply(interaction, { ephemeral: true }, 'agendarCita');

  if (!esStaffSolicitudes(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const { ok, msg, solicitud } = await obtenerSolicitudActiva(solicitudId);
  if (!ok) return safeEditReply(interaction, { content: msg });

  const agendadoPor = interaction.member.displayName;

  await Solicitud.updateOne({ solicitudId }, {
    estado:       'cita_agendada',
    cita:         { ...citaData, agendadoPor },
    procesadoPor: interaction.user.id,
  });

  // Editar embed del ticket
  await editarEmbedTicket({ ...solicitud.toObject(), estado: 'cita_agendada' }, interaction.client);

  // Publicar embed de cita en el ticket
  const ticketCh = await interaction.guild.channels.fetch(solicitud.ticketChannelId).catch(() => null);
  if (ticketCh) {
    await safeSend(
      ticketCh,
      { embeds: [buildCitaEmbed(citaData, agendadoPor)] },
      `cita ticketCh=${solicitud.ticketChannelId}`,
    );
  }

  // DM al aplicante
  try {
    const applicantMember = await interaction.guild.members.fetch(solicitud.userId).catch(() => null);
    if (applicantMember) await applicantMember.send({ embeds: [buildDMCita(citaData)] });
  } catch (err) {
    logger.warn(`No se pudo enviar DM de cita a ${solicitud.userId}: ${err.message}`);
  }

  await safeEditReply(
    interaction,
    { content: `📅 Cita agendada para **${solicitud.nombrePersonaje}**.` },
  );
}

// ── Acción: blacklist (llamada desde modal submit) ───────────────────────────

async function blacklistUser(interaction, solicitudId, motivo) {
  await safeDeferReply(interaction, { ephemeral: true }, 'blacklistUser');

  if (!esDireccionODueno(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const solicitud = await Solicitud.findOne({ solicitudId });
  if (!solicitud) return safeEditReply(interaction, { content: 'Solicitud no encontrada.' });

  // Agregar a blacklist (upsert para evitar duplicados)
  await Blacklist.findOneAndUpdate(
    { userId: solicitud.userId, guildId: interaction.guild.id },
    { motivo, agregadoPor: interaction.user.id, fechaAgregado: new Date() },
    { upsert: true },
  );

  // Rechazar la solicitud
  await Solicitud.updateOne({ solicitudId }, {
    estado:        'rechazado',
    fechaRechazo:  new Date(),
    motivoRechazo: `[BLACKLIST] ${motivo}`,
    procesadoPor:  interaction.user.id,
  });

  // Editar embed del ticket
  await editarEmbedTicket({ ...solicitud.toObject(), estado: 'rechazado' }, interaction.client);

  // DM al aplicante
  try {
    const applicantMember = await interaction.guild.members.fetch(solicitud.userId).catch(() => null);
    if (applicantMember) await applicantMember.send({ embeds: [buildDMBlacklist()] });
  } catch (err) {
    logger.warn(`No se pudo enviar DM de blacklist a ${solicitud.userId}: ${err.message}`);
  }

  // Eliminar canal con cuenta regresiva
  const ticketCh = await interaction.guild.channels.fetch(solicitud.ticketChannelId).catch(() => null);
  if (ticketCh) await eliminarCanalConCuenta(ticketCh);

  await safeEditReply(
    interaction,
    { content: `🚫 **${solicitud.nombrePersonaje}** añadido a la blacklist y solicitud rechazada.` },
  );
}

// ── Publicar panel de solicitudes en startup ─────────────────────────────────

async function publishSolicitudPanelOnStartup(client) {
  const channelId = config.solicitudChannelId;
  if (!channelId) {
    logger.warn('SOLICITUD_CHANNEL_ID no configurado — panel de solicitudes desactivado.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logger.warn(`Canal de solicitudes ${channelId} no encontrado.`);
      return;
    }

    const payload = {
      embeds:     [buildSolicitudPanelEmbed()],
      components: [buildSolicitudPanelRow()],
    };

    const existingId = getSolicitudMessageId();
    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit(payload);
        logger.info(`[Solicitudes] Panel editado en startup (messageId=${existingId})`);
        return;
      } catch {
        logger.warn(`[Solicitudes] Mensaje ${existingId} no encontrado, publicando uno nuevo.`);
        setSolicitudMessageId(null);
      }
    }

    const msg = await safeSend(channel, payload, `startup-solicitudes channelId=${channelId}`);
    if (msg) {
      setSolicitudMessageId(msg.id);
      logger.info(
        `[Solicitudes] Panel publicado en startup (messageId=${msg.id}) — actualiza SOLICITUD_MESSAGE_ID=${msg.id} en .env`,
      );
    }
  } catch (error) {
    logger.error(`Error publicando panel de solicitudes en startup: ${error.message}`);
  }
}

module.exports = {
  publishSolicitudPanelOnStartup,
  verificarElegibilidad,
  procesarNuevaSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
  agendarCita,
  blacklistUser,
  esStaffSolicitudes,
  esDireccionODueno,
};
