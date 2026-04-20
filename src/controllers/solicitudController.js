const { MessageFlags } = require('discord.js');
const { safeReply, safeShowModal } = require('../utils/discordResponses');
const {
  procesarNuevaSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
  agendarCita,
  blacklistUser,
  esStaffSolicitudes,
  esDireccionODueno,
} = require('../services/solicitudService');
const {
  buildModalSolicitud,
  buildModalRechazar,
  buildModalAgendar,
  buildModalBlacklist,
} = require('../ui/solicitudView');

// ── Router de botones ────────────────────────────────────────────────────────

async function handleSolicitudButton(interaction) {
  const { customId } = interaction;

  if (customId === 'btn_solicitar_empleo') {
    await safeShowModal(interaction, buildModalSolicitud(), 'showSolicitudModal');
    return true;
  }

  if (customId.startsWith('btn_aprobar_')) {
    const solicitudId = customId.slice('btn_aprobar_'.length);
    await aprobarSolicitud(interaction, solicitudId);
    return true;
  }

  if (customId.startsWith('btn_rechazar_')) {
    const solicitudId = customId.slice('btn_rechazar_'.length);
    return handleShowModal(
      interaction, solicitudId,
      esStaffSolicitudes,
      buildModalRechazar,
      'showRechazarModal',
    );
  }

  if (customId.startsWith('btn_agendar_')) {
    const solicitudId = customId.slice('btn_agendar_'.length);
    return handleShowModal(
      interaction, solicitudId,
      esStaffSolicitudes,
      buildModalAgendar,
      'showAgendarModal',
    );
  }

  if (customId.startsWith('btn_blacklist_')) {
    const solicitudId = customId.slice('btn_blacklist_'.length);
    return handleShowModal(
      interaction, solicitudId,
      esDireccionODueno,
      buildModalBlacklist,
      'showBlacklistModal',
    );
  }

  return false;
}

// ── Router de modales ────────────────────────────────────────────────────────

async function handleSolicitudModal(interaction) {
  const { customId } = interaction;

  if (customId === 'modal_solicitud') {
    await procesarNuevaSolicitud(interaction);
    return true;
  }

  if (customId.startsWith('modal_rechazar_')) {
    const solicitudId = customId.slice('modal_rechazar_'.length);
    if (!checkStaff(interaction, esStaffSolicitudes)) return true;
    const motivo = interaction.fields.getTextInputValue('motivo_rechazo');
    await rechazarSolicitud(interaction, solicitudId, motivo);
    return true;
  }

  if (customId.startsWith('modal_agendar_')) {
    const solicitudId = customId.slice('modal_agendar_'.length);
    if (!checkStaff(interaction, esStaffSolicitudes)) return true;
    const citaData = {
      fechaHora:     interaction.fields.getTextInputValue('fecha_hora'),
      lugar:         interaction.fields.getTextInputValue('lugar'),
      entrevistador: interaction.fields.getTextInputValue('entrevistador'),
    };
    await agendarCita(interaction, solicitudId, citaData);
    return true;
  }

  if (customId.startsWith('modal_blacklist_')) {
    const solicitudId = customId.slice('modal_blacklist_'.length);
    if (!checkStaff(interaction, esDireccionODueno)) return true;
    const motivo = interaction.fields.getTextInputValue('motivo_blacklist');
    await blacklistUser(interaction, solicitudId, motivo);
    return true;
  }

  return false;
}

// ── Helpers internos ─────────────────────────────────────────────────────────

async function handleShowModal(interaction, solicitudId, permFn, modalFn, context) {
  if (!permFn(interaction.member)) {
    await safeReply(interaction, {
      content: 'No tienes permisos para esta acción.',
      flags:   MessageFlags.Ephemeral,
    });
    return true;
  }
  await safeShowModal(interaction, modalFn(solicitudId), context);
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

module.exports = { handleSolicitudButton, handleSolicitudModal };
