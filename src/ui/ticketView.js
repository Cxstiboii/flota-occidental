const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

// ── Constantes compartidas ───────────────────────────────────────────────────

const CATEGORIA_INFO = {
  error_carrera:    { nombre: 'Error en carrera registrada', emoji: '🏁', color: 0xED4245, corto: 'carrera'   },
  problema_bot:     { nombre: 'Problema con el bot',         emoji: '🤖', color: 0xFEE75C, corto: 'bot'       },
  conflicto:        { nombre: 'Conflicto con empleado',      emoji: '⚔️', color: 0xEB459E, corto: 'conflicto' },
  revision_sancion: { nombre: 'Revisión de sanción',         emoji: '⚖️', color: 0xED4245, corto: 'sancion'   },
  consulta:         { nombre: 'Consulta general',            emoji: '💬', color: 0x5865F2, corto: 'consulta'  },
};

const CAMPOS_CONFIG = {
  error_carrera: [
    { id: 'descripcion_carrera', label: 'ID o descripción de la carrera' },
    { id: 'error_descripcion',   label: '¿Cuál es el error?' },
    { id: 'screenshot',          label: '¿Tienes screenshot del error?' },
  ],
  problema_bot: [
    { id: 'comando_fallido', label: '¿Qué comando o botón falló?' },
    { id: 'mensaje_error',   label: '¿Qué mensaje de error apareció?' },
    { id: 'cuando_ocurrio',  label: '¿Cuándo ocurrió?' },
  ],
  conflicto: [
    { id: 'con_quien',   label: '¿Con quién es el conflicto?' },
    { id: 'que_ocurrio', label: '¿Qué ocurrió?' },
    { id: 'evidencia',   label: '¿Tienes evidencia?' },
  ],
  revision_sancion: [
    { id: 'tipo_sancion',    label: '¿Qué tipo de sanción quieres apelar?' },
    { id: 'por_que_injusta', label: '¿Por qué crees que fue injusta?' },
    { id: 'evidencia',       label: '¿Tienes evidencia a tu favor?' },
  ],
  consulta: [
    { id: 'sobre_que',            label: '¿Sobre qué es tu consulta?' },
    { id: 'descripcion_consulta', label: 'Describe tu consulta' },
  ],
};

const ESTADO_LABELS = {
  abierto:  '🟡 Abierto',
  resuelto: '✅ Resuelto',
  cerrado:  '🔒 Cerrado',
  escalado: '⬆️ Escalado',
};

// ── Panel fijo en #abrir-ticket ──────────────────────────────────────────────

function buildTicketPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎟️ Sistema de Soporte — Flota Occidental')
    .setDescription(
      'Selecciona la categoría de tu problema en el menú de abajo. ' +
      'Un miembro del staff te atenderá en máximo 24 horas.',
    )
    .addFields({
      name:  '📌 Antes de abrir un ticket',
      value: '▸ Busca tu respuesta en <#preguntas-frecuentes> primero\n' +
             '▸ No abras múltiples tickets por el mismo tema\n' +
             '▸ Sé claro y detallado en tu descripción',
    })
    .setFooter({ text: 'Flota Occidental • Soporte' });
}

function buildTicketPanelSelectMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_ticket_categoria')
    .setPlaceholder('📂 Selecciona la categoría...')
    .addOptions([
      {
        label:       '🏁 Error en carrera registrada',
        value:       'error_carrera',
        description: 'Carrera mal registrada, valor incorrecto, screenshot no vinculada',
      },
      {
        label:       '🤖 Problema con el bot',
        value:       'problema_bot',
        description: 'El bot no responde, comando fallido, error técnico',
      },
      {
        label:       '⚔️ Conflicto con empleado',
        value:       'conflicto',
        description: 'Problema con otro taxista o miembro del staff',
      },
      {
        label:       '⚖️ Revisión de sanción',
        value:       'revision_sancion',
        description: 'Apelar una advertencia, suspensión o baja',
      },
      {
        label:       '💬 Consulta general',
        value:       'consulta',
        description: 'Preguntas sobre la empresa, pagos, rangos u otros temas',
      },
    ]);

  return new ActionRowBuilder().addComponents(menu);
}

// ── Modales de creación de ticket ────────────────────────────────────────────

function buildModalTicket(categoria) {
  const builders = {
    error_carrera:    buildModalErrorCarrera,
    problema_bot:     buildModalProblemaBot,
    conflicto:        buildModalConflicto,
    revision_sancion: buildModalRevisionSancion,
    consulta:         buildModalConsulta,
  };
  return (builders[categoria] ?? buildModalConsulta)();
}

function buildModalErrorCarrera() {
  return new ModalBuilder()
    .setCustomId('modal_ticket_nueva_error_carrera')
    .setTitle('Ticket — Error en carrera registrada')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('descripcion_carrera')
          .setLabel('ID o descripción de la carrera')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: Carrera del turno de hoy a las 9PM')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('error_descripcion')
          .setLabel('¿Cuál es el error?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe el problema con la carrera...')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('screenshot')
          .setLabel('¿Tienes screenshot del error?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Sí / No / La subiré en el ticket')
          .setRequired(true),
      ),
    );
}

function buildModalProblemaBot() {
  return new ModalBuilder()
    .setCustomId('modal_ticket_nueva_problema_bot')
    .setTitle('Ticket — Problema con el bot')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comando_fallido')
          .setLabel('¿Qué comando o botón falló?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: Botón Registrar carrera')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('mensaje_error')
          .setLabel('¿Qué mensaje de error apareció?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Copia el mensaje de error exacto...')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('cuando_ocurrio')
          .setLabel('¿Cuándo ocurrió?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: Hoy a las 10:30 PM')
          .setRequired(true),
      ),
    );
}

function buildModalConflicto() {
  return new ModalBuilder()
    .setCustomId('modal_ticket_nueva_conflicto')
    .setTitle('Ticket — Conflicto con empleado')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('con_quien')
          .setLabel('¿Con quién es el conflicto?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Nombre del personaje o usuario de Discord')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('que_ocurrio')
          .setLabel('¿Qué ocurrió?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe la situación detalladamente...')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('evidencia')
          .setLabel('¿Tienes evidencia?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Sí / No / La subiré en el ticket')
          .setRequired(true),
      ),
    );
}

function buildModalRevisionSancion() {
  return new ModalBuilder()
    .setCustomId('modal_ticket_nueva_revision_sancion')
    .setTitle('Ticket — Revisión de sanción')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('tipo_sancion')
          .setLabel('¿Qué tipo de sanción quieres apelar?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: Advertencia, suspensión...')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('por_que_injusta')
          .setLabel('¿Por qué crees que fue injusta?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Explica tu caso detalladamente...')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('evidencia')
          .setLabel('¿Tienes evidencia a tu favor?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Sí / No / La subiré en el ticket')
          .setRequired(true),
      ),
    );
}

function buildModalConsulta() {
  return new ModalBuilder()
    .setCustomId('modal_ticket_nueva_consulta')
    .setTitle('Ticket — Consulta general')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('sobre_que')
          .setLabel('¿Sobre qué es tu consulta?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: Rangos, pagos, reglas...')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('descripcion_consulta')
          .setLabel('Describe tu consulta')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Cuéntanos tu pregunta o duda...')
          .setRequired(true),
      ),
    );
}

// ── Embed principal del ticket ───────────────────────────────────────────────

function buildTicketEmbed(ticket, taxistaData) {
  const info   = CATEGORIA_INFO[ticket.categoria] ?? { nombre: ticket.categoria, emoji: '🎟️', color: 0x5865F2 };
  const estado = ESTADO_LABELS[ticket.estado] ?? ticket.estado;
  const ts     = Math.floor(new Date(ticket.fechaAbierto).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(info.color)
    .setTitle(`${info.emoji} Ticket — ${info.nombre}`)
    .addFields(
      { name: '👤 Usuario',   value: `<@${ticket.userId}>`, inline: true },
      { name: '📂 Categoría', value: info.nombre,           inline: true },
      { name: '📅 Abierto',   value: `<t:${ts}:F>`,         inline: true },
    );

  const camposConfig = CAMPOS_CONFIG[ticket.categoria] ?? [];
  for (const campo of camposConfig) {
    const valor = ticket.campos?.[campo.id] || 'No especificado';
    embed.addFields({ name: campo.label, value: valor, inline: false });
  }

  const perfilValue = taxistaData
    ? buildPerfilTaxistaValue(taxistaData)
    : 'Usuario sin historial en el sistema';

  embed.addFields(
    { name: '\u200b',               value: '\u200b',    inline: false },
    { name: '📊 Perfil del taxista', value: perfilValue, inline: false },
    { name: '🔖 Estado',             value: estado,      inline: true  },
  );

  embed.setFooter({ text: `Flota Occidental • ID: ${ticket.ticketId}` });
  return embed;
}

function buildPerfilTaxistaValue(data) {
  const ultimoTurnoText = data.ultimoTurnoFin
    ? `<t:${Math.floor(new Date(data.ultimoTurnoFin).getTime() / 1000)}:R>`
    : 'Sin registros';

  return (
    `Rango actual: **${data.rango ?? 'Sin rango'}**\n` +
    `Carreras totales: **${data.totalCarreras}**\n` +
    `Último turno: ${ultimoTurnoText}\n` +
    `Turno activo ahora: **${data.turnoActivo ? 'Sí' : 'No'}**`
  );
}

// ── Botones de gestión del staff ─────────────────────────────────────────────

function buildTicketActionRow(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_ticket_resolver_${ticketId}`)
      .setLabel('✅ Marcar resuelto')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_ticket_cerrar_${ticketId}`)
      .setLabel('🔒 Cerrar ticket')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`btn_ticket_escalar_${ticketId}`)
      .setLabel('⬆️ Escalar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`btn_ticket_blacklist_${ticketId}`)
      .setLabel('🚫 Blacklist')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── Notificación al canal de staff ──────────────────────────────────────────

function buildStaffNotifEmbed(ticket, ticketChannel) {
  const info           = CATEGORIA_INFO[ticket.categoria] ?? { nombre: ticket.categoria, emoji: '🎟️', color: 0x5865F2 };
  const primeraRespuesta = String(Object.values(ticket.campos ?? {})[0] ?? 'Sin descripción');
  const resumen        = primeraRespuesta.length > 100 ? primeraRespuesta.slice(0, 97) + '...' : primeraRespuesta;

  return new EmbedBuilder()
    .setColor(info.color)
    .setTitle(`🔔 Nuevo ticket — ${info.emoji} ${info.nombre}`)
    .addFields(
      { name: 'Usuario',   value: `<@${ticket.userId}>`,    inline: true },
      { name: 'Categoría', value: info.nombre,              inline: true },
      { name: 'Canal',     value: `<#${ticketChannel.id}>`, inline: true },
      { name: 'Resumen',   value: resumen,                  inline: false },
    )
    .setFooter({ text: 'Flota Occidental • Responder en el ticket' })
    .setTimestamp();
}

// ── Modales de acciones del staff ────────────────────────────────────────────

function buildModalResolver(ticketId) {
  return new ModalBuilder()
    .setCustomId(`modal_ticket_resolver_${ticketId}`)
    .setTitle('Marcar ticket como resuelto')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('resolucion')
          .setLabel('Resumen de la resolución')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

function buildModalCerrar(ticketId) {
  return new ModalBuilder()
    .setCustomId(`modal_ticket_cerrar_${ticketId}`)
    .setTitle('Cerrar ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo_cierre')
          .setLabel('Motivo del cierre')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}

function buildModalEscalar(ticketId) {
  return new ModalBuilder()
    .setCustomId(`modal_ticket_escalar_${ticketId}`)
    .setTitle('Escalar ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo_escalado')
          .setLabel('¿Por qué se escala este ticket?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

function buildModalBlacklist(ticketId) {
  return new ModalBuilder()
    .setCustomId(`modal_ticket_blacklist_${ticketId}`)
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

// ── DMs al usuario ───────────────────────────────────────────────────────────

function buildDMResuelto(staffName, resolucion) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Tu ticket fue resuelto — Flota Occidental')
    .setDescription(
      `Tu ticket ha sido resuelto por **${staffName}**.\n\n` +
      `**Resolución:** ${resolucion}\n\n` +
      'Si el problema persiste puedes abrir un nuevo ticket.',
    );
}

function buildDMCerrado(staffName, motivo) {
  return new EmbedBuilder()
    .setColor(0x95A5A6)
    .setTitle('🔒 Ticket cerrado — Flota Occidental')
    .setDescription(
      `Tu ticket fue cerrado por **${staffName}**.\n\n` +
      `**Motivo:** ${motivo}\n\n` +
      'Si necesitas más ayuda puedes abrir un nuevo ticket.',
    );
}

function buildDMBlacklist() {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🚫 Has sido añadido a la blacklist — Flota Occidental')
    .setDescription(
      'Has sido añadido a la lista negra del servidor.\n' +
      'No podrás abrir más tickets ni solicitudes de empleo.\n' +
      'Si crees que esto es un error, contacta al staff del servidor.',
    );
}

module.exports = {
  CATEGORIA_INFO,
  buildTicketPanelEmbed,
  buildTicketPanelSelectMenu,
  buildModalTicket,
  buildTicketEmbed,
  buildTicketActionRow,
  buildStaffNotifEmbed,
  buildModalResolver,
  buildModalCerrar,
  buildModalEscalar,
  buildModalBlacklist,
  buildDMResuelto,
  buildDMCerrado,
  buildDMBlacklist,
};
