const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config  = require('../config');
const logger  = require('../utils/logger');
const { safeSend, safeDeferReply, safeEditReply } = require('../utils/discordResponses');
const { getTicketPanelMessageId, setTicketPanelMessageId } = require('./ticketState');
const { sendAuditEmbed } = require('./auditoriaService');
const Ticket    = require('../storage/models/Ticket');
const Blacklist = require('../storage/models/Blacklist');
const Taxista   = require('../storage/models/Taxista');
const {
  CATEGORIA_INFO,
  buildTicketPanelEmbed,
  buildTicketPanelSelectMenu,
  buildTicketEmbed,
  buildTicketActionRow,
  buildStaffNotifEmbed,
  buildDMResuelto,
  buildDMCerrado,
  buildDMBlacklist,
} = require('../ui/ticketView');

// ── Campo IDs por categoría (deben coincidir con los customIds de los modales) ─

const CAMPO_IDS = {
  error_carrera:    ['descripcion_carrera', 'error_descripcion', 'screenshot'],
  problema_bot:     ['comando_fallido', 'mensaje_error', 'cuando_ocurrio'],
  conflicto:        ['con_quien', 'que_ocurrio', 'evidencia'],
  revision_sancion: ['tipo_sancion', 'por_que_injusta', 'evidencia'],
  consulta:         ['sobre_que', 'descripcion_consulta'],
};

// ── Helpers de permisos ──────────────────────────────────────────────────────

function esStaffTickets(member) {
  const { roleSupervisorIds, roleSupervisor, roleDuenoIds, roleDueno, rolDireccionId } = config;
  const cache = member.roles.cache;
  return (
    roleSupervisorIds.some(id => id && cache.has(id))  ||
    cache.some(r => roleSupervisor.includes(r.name))   ||
    roleDuenoIds.some(id => id && cache.has(id))       ||
    cache.some(r => roleDueno.includes(r.name))        ||
    Boolean(rolDireccionId && cache.has(rolDireccionId))
  );
}

function esDireccionODueno(member) {
  const { roleDuenoIds, roleDueno, rolDireccionId } = config;
  const cache = member.roles.cache;
  return (
    roleDuenoIds.some(id => id && cache.has(id))       ||
    cache.some(r => roleDueno.includes(r.name))        ||
    Boolean(rolDireccionId && cache.has(rolDireccionId))
  );
}

// ── Helper: perfil del taxista desde MongoDB ─────────────────────────────────

async function obtenerPerfilTaxista(userId) {
  try {
    const taxista = await Taxista.findOne({ userId });
    if (!taxista) return null;

    const RANGOS = [
      { nombre: 'Taxista Elite',    min: 500 },
      { nombre: 'Taxista Veterano', min: 200 },
      { nombre: 'Taxista Estable',  min: 75  },
      { nombre: 'Taxista Activo',   min: 20  },
      { nombre: 'Taxista Junior',   min: 1   },
    ];
    const rango = RANGOS.find(r => taxista.totalCarreras >= r.min)?.nombre ?? null;

    const ultimoTurno = taxista.historial?.length > 0
      ? taxista.historial[taxista.historial.length - 1]
      : null;

    return {
      rango,
      totalCarreras:  taxista.totalCarreras,
      ultimoTurnoFin: ultimoTurno?.fin ?? null,
      turnoActivo:    taxista.turnoActivo,
    };
  } catch {
    return null;
  }
}

// ── Helper: extraer campos del modal ────────────────────────────────────────

function extraerCampos(interaction, categoria) {
  const ids    = CAMPO_IDS[categoria] ?? [];
  const campos = {};
  for (const id of ids) {
    try {
      campos[id] = interaction.fields.getTextInputValue(id);
    } catch {
      campos[id] = '';
    }
  }
  return campos;
}

// ── Helper: editar embed del ticket tras una acción ──────────────────────────

async function editarEmbedTicket(ticket, client) {
  if (!ticket.channelId || !ticket.embedMessageId) return;
  try {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(ticket.embedMessageId).catch(() => null);
    if (!msg) return;
    const taxistaData = await obtenerPerfilTaxista(ticket.userId);
    await msg.edit({ embeds: [buildTicketEmbed(ticket, taxistaData)] });
  } catch (err) {
    logger.warn(`No se pudo editar embed del ticket ${ticket.ticketId}: ${err.message}`);
  }
}

// ── Helper: eliminar canal con countdown (60s para resolución) ───────────────

async function eliminarCanalConCuenta60s(channel) {
  await safeSend(channel, '⏳ Este canal se eliminará en **60 segundos**...');
  setTimeout(() => safeSend(channel, '⏳ Este canal se eliminará en **40 segundos**...'), 20_000);
  setTimeout(() => safeSend(channel, '⏳ Este canal se eliminará en **20 segundos**...'), 40_000);
  setTimeout(async () => {
    try { await channel.delete(); } catch (err) {
      logger.warn(`No se pudo eliminar canal de ticket ${channel.id}: ${err.message}`);
    }
  }, 60_000);
}

// ── Helper: eliminar canal con countdown (10s para cierre) ──────────────────

async function eliminarCanalConCuenta10s(channel) {
  await safeSend(channel, '🗑️ Este canal se eliminará en **10 segundos**...');
  setTimeout(async () => {
    try { await channel.delete(); } catch (err) {
      logger.warn(`No se pudo eliminar canal de ticket ${channel.id}: ${err.message}`);
    }
  }, 10_000);
}

// ── Helper: embed de auditoría para acciones de ticket ───────────────────────

function buildAuditTicketEmbed({ title, color, ticket, staff, detalle }) {
  const info  = CATEGORIA_INFO[ticket.categoria] ?? { nombre: ticket.categoria };
  const embed = new EmbedBuilder()
    .setColor(color ?? 0x9B59B6)
    .setTitle(`Auditoria | ${title}`)
    .setDescription(`${staff} procesó el ticket.`)
    .addFields(
      { name: 'Usuario',   value: `<@${ticket.userId}>`, inline: true  },
      { name: 'Categoría', value: info.nombre,           inline: true  },
      { name: 'Ticket ID', value: ticket.ticketId,       inline: false },
      { name: 'Detalle',   value: detalle || 'N/D',      inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Flota Occidental • Auditoría' })
    .setAuthor({
      name:    staff.displayName,
      iconURL: staff.displayAvatarURL?.() || staff.user?.displayAvatarURL?.(),
    });
  return embed;
}

// ── Helper: crear canal de ticket ────────────────────────────────────────────

async function crearCanalTicket(guild, member, categoria) {
  const info     = CATEGORIA_INFO[categoria] ?? { corto: 'ticket' };
  const username = member.user.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20) || 'usuario';
  const suffix   = String(Math.floor(1000 + Math.random() * 9000));
  const name     = `ticket-${info.corto}-${username}-${suffix}`;

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id:    member.id,
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
    name,
    type:                ChannelType.GuildText,
    parent:              config.ticketsCategoryId || undefined,
    permissionOverwrites: overwrites,
  });
}

// ── Verificación de elegibilidad ─────────────────────────────────────────────

async function verificarElegibilidadTicket(userId, guildId) {
  const activeTicket = await Ticket.findOne({
    userId,
    guildId,
    estado: { $in: ['abierto', 'escalado'] },
  });
  if (activeTicket) {
    return {
      ok: false,
      razon: `Ya tienes un ticket abierto en <#${activeTicket.channelId}>. Espera a que sea resuelto antes de abrir otro.`,
    };
  }

  const lastClosed = await Ticket.findOne({
    userId,
    guildId,
    estado:              { $in: ['cerrado', 'resuelto'] },
    ultimoTicketCerrado: { $ne: null },
  }).sort({ ultimoTicketCerrado: -1 });

  if (lastClosed?.ultimoTicketCerrado) {
    const COOLDOWN_MS = 10 * 60 * 1000;
    const elapsed     = Date.now() - new Date(lastClosed.ultimoTicketCerrado).getTime();
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60_000);
      return {
        ok: false,
        razon: `Debes esperar **${remaining}** minuto(s) antes de abrir otro ticket.`,
      };
    }
  }

  return { ok: true };
}

// ── Publicar panel de tickets en startup ─────────────────────────────────────

async function publishTicketPanelOnStartup(client) {
  const channelId = config.ticketChannelId;
  if (!channelId) {
    logger.warn('TICKET_CHANNEL_ID no configurado — panel de tickets desactivado.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logger.warn(`Canal de tickets ${channelId} no encontrado.`);
      return;
    }

    const payload = {
      embeds:     [buildTicketPanelEmbed()],
      components: [buildTicketPanelSelectMenu()],
    };

    const existingId = getTicketPanelMessageId();
    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit(payload);
        logger.info(`[Tickets] Panel editado en startup (messageId=${existingId})`);
        return;
      } catch {
        logger.warn(`[Tickets] Mensaje ${existingId} no encontrado, publicando uno nuevo.`);
        setTicketPanelMessageId(null);
      }
    }

    const msg = await safeSend(channel, payload, `startup-tickets channelId=${channelId}`);
    if (msg) {
      setTicketPanelMessageId(msg.id);
      logger.info(
        `[Tickets] Panel publicado en startup (messageId=${msg.id}) — actualiza TICKET_PANEL_MESSAGE_ID=${msg.id} en .env`,
      );
    }
  } catch (error) {
    logger.error(`Error publicando panel de tickets en startup: ${error.message}`);
  }
}

// ── Flujo principal: procesar nuevo ticket ───────────────────────────────────

async function procesarNuevoTicket(interaction, categoria) {
  await safeDeferReply(interaction, { ephemeral: true }, 'procesarNuevoTicket');

  const { guild, member, user } = interaction;

  const { ok, razon } = await verificarElegibilidadTicket(user.id, guild.id);
  if (!ok) return safeEditReply(interaction, { content: razon }, 'elegibilidad');

  const ticketId = `ticket_${user.id}_${Date.now()}`;
  const campos   = extraerCampos(interaction, categoria);

  let ticketChannel;
  try {
    ticketChannel = await crearCanalTicket(guild, member, categoria);
  } catch (err) {
    logger.error(`No se pudo crear canal de ticket: ${err.message}`);
    return safeEditReply(
      interaction,
      { content: 'No se pudo crear el canal de ticket. Contacta a un administrador.' },
      'crearCanal',
    );
  }

  const ticket = await Ticket.create({
    ticketId,
    userId:      user.id,
    guildId:     guild.id,
    categoria,
    campos,
    estado:      'abierto',
    channelId:   ticketChannel.id,
    abiertoPor:  user.id,
    fechaAbierto: new Date(),
  });

  const taxistaData = await obtenerPerfilTaxista(user.id);

  const embedMsg = await safeSend(
    ticketChannel,
    {
      embeds:     [buildTicketEmbed(ticket, taxistaData)],
      components: [buildTicketActionRow(ticketId)],
    },
    `ticket-embed ticketId=${ticketId}`,
  );
  if (embedMsg) {
    await Ticket.updateOne({ ticketId }, { embedMessageId: embedMsg.id });
    ticket.embedMessageId = embedMsg.id;
  }

  await safeSend(
    ticketChannel,
    '📎 Si tienes capturas de pantalla como evidencia, súbelas en este canal.',
    `ticket-foto ticketId=${ticketId}`,
  );

  if (config.ticketsStaffChannelId) {
    const staffCh = await guild.channels.fetch(config.ticketsStaffChannelId).catch(() => null);
    if (staffCh) {
      await safeSend(
        staffCh,
        { embeds: [buildStaffNotifEmbed(ticket, ticketChannel)] },
        `staff-notif ticketId=${ticketId}`,
      );
    }
  }

  await safeEditReply(
    interaction,
    { content: `✅ Tu ticket ha sido abierto. Revisa: ${ticketChannel}` },
    'ticketAbierto',
  );
}

// ── Acción: marcar resuelto ───────────────────────────────────────────────────

async function resolverTicket(interaction, ticketId, resolucion) {
  await safeDeferReply(interaction, { ephemeral: true }, 'resolverTicket');

  if (!esStaffTickets(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const ticket = await Ticket.findOne({ ticketId });
  if (!ticket) return safeEditReply(interaction, { content: 'Ticket no encontrado.' });
  if (!['abierto', 'escalado'].includes(ticket.estado)) {
    return safeEditReply(interaction, { content: 'Este ticket ya fue procesado.' });
  }

  const now = new Date();
  await Ticket.updateOne({ ticketId }, {
    estado:              'resuelto',
    resolucion,
    cerradoPor:          interaction.user.id,
    fechaCerrado:        now,
    ultimoTicketCerrado: now,
  });

  const updatedTicket = { ...ticket.toObject(), estado: 'resuelto', resolucion };

  await editarEmbedTicket(updatedTicket, interaction.client);

  const ticketCh = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  if (ticketCh) {
    await safeSend(
      ticketCh,
      `✅ Ticket marcado como resuelto por ${interaction.user}.\n**Resolución:** ${resolucion}\nEl canal se cerrará en 60 segundos.`,
      `resolver ticketCh=${ticket.channelId}`,
    );
  }

  try {
    const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    if (member) await member.send({ embeds: [buildDMResuelto(interaction.member.displayName, resolucion)] });
  } catch (err) {
    logger.warn(`No se pudo enviar DM de resolución a ${ticket.userId}: ${err.message}`);
  }

  await sendAuditEmbed(interaction.guild, {
    embeds: [buildAuditTicketEmbed({
      title:  'Ticket resuelto',
      color:  0x9B59B6,
      ticket: updatedTicket,
      staff:  interaction.member,
      detalle: resolucion,
    })],
  });

  await safeEditReply(interaction, { content: `✅ Ticket **${ticketId}** marcado como resuelto.` });

  if (ticketCh) await eliminarCanalConCuenta60s(ticketCh);
}

// ── Acción: cerrar ticket (sin resolver) ─────────────────────────────────────

async function cerrarTicket(interaction, ticketId, motivo) {
  await safeDeferReply(interaction, { ephemeral: true }, 'cerrarTicket');

  if (!esStaffTickets(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const ticket = await Ticket.findOne({ ticketId });
  if (!ticket) return safeEditReply(interaction, { content: 'Ticket no encontrado.' });
  if (!['abierto', 'escalado'].includes(ticket.estado)) {
    return safeEditReply(interaction, { content: 'Este ticket ya fue procesado.' });
  }

  const now = new Date();
  await Ticket.updateOne({ ticketId }, {
    estado:              'cerrado',
    motivoCierre:        motivo,
    cerradoPor:          interaction.user.id,
    fechaCerrado:        now,
    ultimoTicketCerrado: now,
  });

  const updatedTicket = { ...ticket.toObject(), estado: 'cerrado', motivoCierre: motivo };

  await editarEmbedTicket(updatedTicket, interaction.client);

  try {
    const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    if (member) await member.send({ embeds: [buildDMCerrado(interaction.member.displayName, motivo)] });
  } catch (err) {
    logger.warn(`No se pudo enviar DM de cierre a ${ticket.userId}: ${err.message}`);
  }

  await sendAuditEmbed(interaction.guild, {
    embeds: [buildAuditTicketEmbed({
      title:  'Ticket cerrado',
      color:  0x9B59B6,
      ticket: updatedTicket,
      staff:  interaction.member,
      detalle: motivo,
    })],
  });

  const ticketCh = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  if (ticketCh) await eliminarCanalConCuenta10s(ticketCh);

  await safeEditReply(interaction, { content: `🔒 Ticket **${ticketId}** cerrado.` });
}

// ── Acción: escalar ──────────────────────────────────────────────────────────

async function escalarTicket(interaction, ticketId, motivo) {
  await safeDeferReply(interaction, { ephemeral: true }, 'escalarTicket');

  if (!esStaffTickets(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const ticket = await Ticket.findOne({ ticketId });
  if (!ticket) return safeEditReply(interaction, { content: 'Ticket no encontrado.' });
  if (ticket.estado !== 'abierto') {
    return safeEditReply(interaction, { content: 'Solo se puede escalar un ticket abierto.' });
  }

  await Ticket.updateOne({ ticketId }, { estado: 'escalado' });

  const updatedTicket = { ...ticket.toObject(), estado: 'escalado' };

  await editarEmbedTicket(updatedTicket, interaction.client);

  const ticketCh = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  if (ticketCh) {
    const idsAgregar = [...config.roleDuenoIds, config.rolDireccionId].filter(Boolean);
    for (const roleId of idsAgregar) {
      await ticketCh.permissionOverwrites.edit(roleId, {
        ViewChannel:    true,
        SendMessages:   true,
        ManageMessages: true,
      }).catch(err => logger.warn(`No se pudo editar permisos para ${roleId}: ${err.message}`));
    }

    const pings = idsAgregar.map(id => `<@&${id}>`).join(' ');
    await safeSend(
      ticketCh,
      `${pings} — Ticket escalado por ${interaction.user}.\n**Motivo:** ${motivo}`,
      `escalar ticketCh=${ticket.channelId}`,
    );
  }

  await sendAuditEmbed(interaction.guild, {
    embeds: [buildAuditTicketEmbed({
      title:  'Ticket escalado',
      color:  0x5865F2,
      ticket: updatedTicket,
      staff:  interaction.member,
      detalle: motivo,
    })],
  });

  await safeEditReply(interaction, { content: `⬆️ Ticket **${ticketId}** escalado.` });
}

// ── Acción: blacklist desde ticket ───────────────────────────────────────────

async function blacklistDesdeTicket(interaction, ticketId, motivo) {
  await safeDeferReply(interaction, { ephemeral: true }, 'blacklistDesdeTicket');

  if (!esDireccionODueno(interaction.member)) {
    return safeEditReply(interaction, { content: 'No tienes permisos para esta acción.' });
  }

  const ticket = await Ticket.findOne({ ticketId });
  if (!ticket) return safeEditReply(interaction, { content: 'Ticket no encontrado.' });

  await Blacklist.findOneAndUpdate(
    { userId: ticket.userId, guildId: interaction.guild.id },
    { motivo, agregadoPor: interaction.user.id, fechaAgregado: new Date() },
    { upsert: true },
  );

  const now = new Date();
  await Ticket.updateOne({ ticketId }, {
    estado:              'cerrado',
    motivoCierre:        `[BLACKLIST] ${motivo}`,
    cerradoPor:          interaction.user.id,
    fechaCerrado:        now,
    ultimoTicketCerrado: now,
  });

  const updatedTicket = { ...ticket.toObject(), estado: 'cerrado' };

  await editarEmbedTicket(updatedTicket, interaction.client);

  try {
    const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    if (member) await member.send({ embeds: [buildDMBlacklist()] });
  } catch (err) {
    logger.warn(`No se pudo enviar DM de blacklist a ${ticket.userId}: ${err.message}`);
  }

  await sendAuditEmbed(interaction.guild, {
    embeds: [buildAuditTicketEmbed({
      title:  'Ticket — Blacklist',
      color:  0x9B59B6,
      ticket: updatedTicket,
      staff:  interaction.member,
      detalle: motivo,
    })],
  });

  const ticketCh = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  if (ticketCh) await eliminarCanalConCuenta10s(ticketCh);

  await safeEditReply(
    interaction,
    { content: `🚫 <@${ticket.userId}> añadido a la blacklist y ticket cerrado.` },
  );
}

module.exports = {
  publishTicketPanelOnStartup,
  verificarElegibilidadTicket,
  procesarNuevoTicket,
  resolverTicket,
  cerrarTicket,
  escalarTicket,
  blacklistDesdeTicket,
  esStaffTickets,
  esDireccionODueno,
};
