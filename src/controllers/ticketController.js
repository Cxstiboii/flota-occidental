const { MessageFlags } = require('discord.js');
const { safeReply, safeShowModal } = require('../utils/discordResponses');
const {
  procesarNuevoTicket,
  resolverTicket,
  cerrarTicket,
  escalarTicket,
  blacklistDesdeTicket,
  esStaffTickets,
  esDireccionODueno,
} = require('../services/ticketService');
const {
  buildModalTicket,
  buildModalResolver,
  buildModalCerrar,
  buildModalEscalar,
  buildModalBlacklist,
} = require('../ui/ticketView');

// ── Router de select menus ───────────────────────────────────────────────────

async function handleTicketSelectMenu(interaction) {
  if (interaction.customId !== 'select_ticket_categoria') return false;

  const categoria = interaction.values[0];
  await safeShowModal(interaction, buildModalTicket(categoria), `showTicketModal categoria=${categoria}`);
  return true;
}

// ── Router de botones ────────────────────────────────────────────────────────

async function handleTicketButton(interaction) {
  const { customId } = interaction;

  if (customId.startsWith('btn_ticket_resolver_')) {
    const ticketId = customId.slice('btn_ticket_resolver_'.length);
    return handleShowStaffModal(interaction, ticketId, esStaffTickets, buildModalResolver, 'showResolverModal');
  }

  if (customId.startsWith('btn_ticket_cerrar_')) {
    const ticketId = customId.slice('btn_ticket_cerrar_'.length);
    return handleShowStaffModal(interaction, ticketId, esStaffTickets, buildModalCerrar, 'showCerrarModal');
  }

  if (customId.startsWith('btn_ticket_escalar_')) {
    const ticketId = customId.slice('btn_ticket_escalar_'.length);
    return handleShowStaffModal(interaction, ticketId, esStaffTickets, buildModalEscalar, 'showEscalarModal');
  }

  if (customId.startsWith('btn_ticket_blacklist_')) {
    const ticketId = customId.slice('btn_ticket_blacklist_'.length);
    return handleShowStaffModal(interaction, ticketId, esDireccionODueno, buildModalBlacklist, 'showBlacklistModal');
  }

  return false;
}

// ── Router de modales ────────────────────────────────────────────────────────

async function handleTicketModal(interaction) {
  const { customId } = interaction;

  if (customId.startsWith('modal_ticket_nueva_')) {
    const categoria = customId.slice('modal_ticket_nueva_'.length);
    await procesarNuevoTicket(interaction, categoria);
    return true;
  }

  if (customId.startsWith('modal_ticket_resolver_')) {
    const ticketId = customId.slice('modal_ticket_resolver_'.length);
    if (!checkStaff(interaction, esStaffTickets)) return true;
    const resolucion = interaction.fields.getTextInputValue('resolucion');
    await resolverTicket(interaction, ticketId, resolucion);
    return true;
  }

  if (customId.startsWith('modal_ticket_cerrar_')) {
    const ticketId = customId.slice('modal_ticket_cerrar_'.length);
    if (!checkStaff(interaction, esStaffTickets)) return true;
    const motivo = interaction.fields.getTextInputValue('motivo_cierre');
    await cerrarTicket(interaction, ticketId, motivo);
    return true;
  }

  if (customId.startsWith('modal_ticket_escalar_')) {
    const ticketId = customId.slice('modal_ticket_escalar_'.length);
    if (!checkStaff(interaction, esStaffTickets)) return true;
    const motivo = interaction.fields.getTextInputValue('motivo_escalado');
    await escalarTicket(interaction, ticketId, motivo);
    return true;
  }

  if (customId.startsWith('modal_ticket_blacklist_')) {
    const ticketId = customId.slice('modal_ticket_blacklist_'.length);
    if (!checkStaff(interaction, esDireccionODueno)) return true;
    const motivo = interaction.fields.getTextInputValue('motivo_blacklist');
    await blacklistDesdeTicket(interaction, ticketId, motivo);
    return true;
  }

  return false;
}

// ── Helpers internos ─────────────────────────────────────────────────────────

async function handleShowStaffModal(interaction, ticketId, permFn, modalFn, context) {
  if (!permFn(interaction.member)) {
    await safeReply(interaction, {
      content: 'No tienes permisos para esta acción.',
      flags:   MessageFlags.Ephemeral,
    });
    return true;
  }
  await safeShowModal(interaction, modalFn(ticketId), context);
  return true;
}

function checkStaff(interaction, permFn) {
  if (permFn(interaction.member)) return true;
  safeReply(interaction, {
    content: 'No tienes permisos para esta acción.',
    flags:   MessageFlags.Ephemeral,
  });
  return false;
}

module.exports = { handleTicketSelectMenu, handleTicketButton, handleTicketModal };
