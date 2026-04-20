const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const COLORS = {
  gold:  0xFFD700,
  green: 0x57F287,
  red:   0xED4245,
  blue:  0x5865F2,
};

const ESTADO_LABELS = {
  pendiente:     '🟡 Pendiente de revisión',
  aprobado:      '✅ Aprobado',
  rechazado:     '❌ Rechazado',
  cita_agendada: '📅 Cita agendada',
};

// ── Panel fijo en #solicitud-de-empleo ──────────────────────────────────────

function buildSolicitudPanelEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('📝 Solicitud de Empleo — Flota Occidental')
    .setDescription(
      '¿Quieres formar parte de Flota Occidental? Haz clic en el botón y completa el formulario. ' +
      'Un supervisor revisará tu solicitud.',
    )
    .setFooter({ text: 'Flota Occidental • El proceso tarda máximo 24 horas' });
}

function buildSolicitudPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_solicitar_empleo')
      .setLabel('📝 Solicitar empleo')
      .setStyle(ButtonStyle.Success),
  );
}

// ── Embed principal del ticket ───────────────────────────────────────────────

function buildSolicitudEmbed(solicitud) {
  const ts = Math.floor(new Date(solicitud.fechaSolicitud).getTime() / 1000);
  const estado = ESTADO_LABELS[solicitud.estado] ?? solicitud.estado;

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('📋 Nueva Solicitud de Empleo')
    .addFields(
      { name: '👤 Solicitante',         value: `<@${solicitud.userId}> (${solicitud.userId})`, inline: false },
      { name: '🎭 Nombre del personaje', value: solicitud.nombrePersonaje,                          inline: true  },
      { name: '🏷️ Apodo en el servidor', value: solicitud.nombreServidor ?? '—',                  inline: true  },
      { name: '⏳ Tiempo en la ciudad',  value: solicitud.tiempoCiudad,                            inline: true  },
      { name: '📊 Conducta',             value: solicitud.conducta,                            inline: false },
      { name: '💬 Motivación',           value: solicitud.motivacion,                          inline: false },
      { name: '📅 Fecha de solicitud',   value: `<t:${ts}:F>`,                                 inline: true  },
      { name: '🔖 Estado',               value: estado,                                        inline: true  },
    )
    .setFooter({ text: `Flota Occidental • ID: ${solicitud.solicitudId}` });
}

// ── Fila de botones del staff ────────────────────────────────────────────────

function buildStaffActionRow(solicitudId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_aprobar_${solicitudId}`)
      .setLabel('✅ Aprobar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_rechazar_${solicitudId}`)
      .setLabel('❌ Rechazar')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`btn_agendar_${solicitudId}`)
      .setLabel('📅 Agendar cita')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`btn_blacklist_${solicitudId}`)
      .setLabel('🚫 Blacklist')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── Notificación al canal de staff ──────────────────────────────────────────

function buildStaffNotifEmbed(solicitud, ticketChannel) {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('🔔 Nueva solicitud de empleo')
    .setDescription(`<@${solicitud.userId}> ha enviado una solicitud.`)
    .addFields(
      { name: 'Personaje',        value: solicitud.nombrePersonaje,   inline: true },
      { name: 'Tiempo en ciudad', value: solicitud.tiempoCiudad,      inline: true },
      { name: 'Canal',            value: `<#${ticketChannel.id}>`,    inline: true },
    )
    .setFooter({ text: 'Flota Occidental • Revisar en el ticket' })
    .setTimestamp();
}

// ── Embed de cita en el ticket ───────────────────────────────────────────────

function buildCitaEmbed(cita, agendadoPor) {
  return new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle('📅 Cita Agendada')
    .addFields(
      { name: '📅 Fecha y hora',  value: cita.fechaHora,     inline: false },
      { name: '📍 Lugar en GTA',  value: cita.lugar,         inline: false },
      { name: '👤 Entrevistador', value: cita.entrevistador, inline: true  },
      { name: '🗓️ Agendado por',  value: agendadoPor,        inline: true  },
    );
}

// ── DMs al aplicante ─────────────────────────────────────────────────────────

function buildDMAprobado() {
  return new EmbedBuilder()
    .setColor(COLORS.green)
    .setTitle('✅ Solicitud Aprobada — Flota Occidental')
    .setDescription(
      'Tu solicitud ha sido aprobada. Has recibido el rol **En Período de Prueba**.\n' +
      'Un miembro del staff te contactará para agendar tu cita en GTA.\n' +
      'Mientras tanto, revisa el canal del ticket para más instrucciones.',
    );
}

function buildDMRechazado(motivo) {
  return new EmbedBuilder()
    .setColor(COLORS.red)
    .setTitle('❌ Solicitud Rechazada — Flota Occidental')
    .setDescription(
      'Tu solicitud no fue aprobada en esta ocasión.\n\n' +
      `**Motivo:** ${motivo}\n\n` +
      'Puedes volver a aplicar después de 3 días.',
    );
}

function buildDMCita(cita) {
  return new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle('📅 Cita Agendada — Flota Occidental')
    .setDescription(
      'Tu entrevista ha sido agendada.\n\n' +
      `📅 **Fecha y hora:** ${cita.fechaHora}\n` +
      `📍 **Lugar en GTA:** ${cita.lugar}\n` +
      `👤 **Entrevistador:** ${cita.entrevistador}\n\n` +
      'Preséntate puntualmente. Cualquier duda pregunta en tu ticket.',
    );
}

function buildDMBlacklist() {
  return new EmbedBuilder()
    .setColor(COLORS.red)
    .setTitle('🚫 Solicitud Bloqueada — Flota Occidental')
    .setDescription(
      'Tu solicitud ha sido bloqueada y no podrás volver a aplicar.\n' +
      'Si crees que esto es un error, contacta al staff del servidor.',
    );
}

// ── Modales ──────────────────────────────────────────────────────────────────

function buildModalSolicitud() {
  return new ModalBuilder()
    .setCustomId('modal_solicitud')
    .setTitle('Solicitud de Empleo — Flota Occidental')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nombre_personaje')
          .setLabel('Nombre del personaje')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: John Martinez')
          .setRequired(true)
          .setMaxLength(50),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('tiempo_ciudad')
          .setLabel('Tiempo en la ciudad')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 3 meses, 1 año...')
          .setRequired(true)
          .setMaxLength(50),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('conducta')
          .setLabel('¿Cómo ha sido tu conducta?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe tu historial de conducta en el servidor...')
          .setRequired(true)
          .setMaxLength(300),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivacion')
          .setLabel('¿Por qué quieres trabajar con nosotros?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Cuéntanos tu motivación...')
          .setRequired(true)
          .setMaxLength(300),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nombre_servidor')
          .setLabel('Apodo en Discord (igual al de GTA)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: John Martinez')
          .setRequired(true)
          .setMaxLength(32),
      ),
    );
}

function buildModalRechazar(solicitudId) {
  return new ModalBuilder()
    .setCustomId(`modal_rechazar_${solicitudId}`)
    .setTitle('Motivo del Rechazo')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo_rechazo')
          .setLabel('Motivo del rechazo')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

function buildModalAgendar(solicitudId) {
  return new ModalBuilder()
    .setCustomId(`modal_agendar_${solicitudId}`)
    .setTitle('Agendar Cita')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fecha_hora')
          .setLabel('Fecha y hora de la cita')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: Sábado 20 de abril a las 8:00 PM')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('lugar')
          .setLabel('Lugar de encuentro en GTA')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: Sede de Flota Occidental, parking norte')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('entrevistador')
          .setLabel('¿Quién realizará la entrevista?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Nombre del supervisor/director/dueño')
          .setRequired(true),
      ),
    );
}

function buildModalBlacklist(solicitudId) {
  return new ModalBuilder()
    .setCustomId(`modal_blacklist_${solicitudId}`)
    .setTitle('Añadir a Blacklist')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo_blacklist')
          .setLabel('Motivo para blacklist')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

module.exports = {
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
  buildModalSolicitud,
  buildModalRechazar,
  buildModalAgendar,
  buildModalBlacklist,
};
