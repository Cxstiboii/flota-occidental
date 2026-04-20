const { EmbedBuilder } = require('discord.js');
const storage = require('../storage');
const config = require('../config');
const { safeSend } = require('../utils/discordResponses');
const logger = require('../utils/logger');

const INTERVALO_MS  = 30 * 60 * 1000;  // 30 minutos
const TURNO_MAX_MS  = 8 * 60 * 60 * 1000; // 8 horas

// Map de userId → timestamp de última alerta enviada
const alertasEnviadas = new Map();

function limpiarAlertaTurno(userId) {
  alertasEnviadas.delete(userId);
}

function iniciarMonitorTurnos(client) {
  if (!config.alertasChannelId) {
    console.warn('[Monitor] ALERTAS_CHANNEL_ID no configurado — monitor de turnos extendidos desactivado.');
    return;
  }
  setInterval(() => verificarTurnosExtendidos(client), INTERVALO_MS);
  logger.info('[Monitor] Monitor de turnos extendidos iniciado (intervalo 30 min).');
}

async function verificarTurnosExtendidos(client) {
  try {
    const channel = await client.channels.fetch(config.alertasChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const allData = await storage.getAll();
    const ahora   = Date.now();

    for (const [userId, data] of Object.entries(allData)) {
      if (!data.turnoActivo || !data.inicioTurno) continue;

      const duracion = ahora - new Date(data.inicioTurno).getTime();
      if (duracion < TURNO_MAX_MS) continue;

      // Anti-spam: no re-alertar si ya se envió una en las últimas 8h
      const ultimaAlerta = alertasEnviadas.get(userId) ?? 0;
      if (ahora - ultimaAlerta < TURNO_MAX_MS) continue;

      alertasEnviadas.set(userId, ahora);

      const horas    = Math.floor(duracion / 3_600_000);
      const minutos  = Math.floor((duracion % 3_600_000) / 60_000);
      const inicioTs = Math.floor(new Date(data.inicioTurno).getTime() / 1000);
      const mention  = buildSupervisorMention();

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⚠️ Turno Extendido')
        .setDescription(`El taxista <@${userId}> lleva más de 8 horas con el turno abierto.`)
        .addFields(
          { name: 'Taxista',         value: `<@${userId}> (${data.ultimoNombre ?? userId})`, inline: true },
          { name: 'Duración actual', value: `${horas}h ${minutos}m`,                         inline: true },
          { name: 'Inicio del turno',value: `<t:${inicioTs}:F>`,                             inline: true },
          { name: 'Canal del turno', value: data.activeShift?.channelId ? `<#${data.activeShift.channelId}>` : 'Sin canal', inline: true },
        )
        .setTimestamp();

      await safeSend(channel, {
        content: mention || undefined,
        embeds: [embed],
      }, `monitor-turno-extendido userId=${userId}`);

      logger.warn(`[Monitor] Alerta turno extendido enviada: userId=${userId} duración=${horas}h ${minutos}m`);
    }
  } catch (error) {
    logger.error(`[Monitor] Error en verificarTurnosExtendidos: ${error.message}`);
  }
}

function buildSupervisorMention() {
  const ids = [...(config.roleDuenoIds ?? []), ...(config.roleSupervisorIds ?? [])].filter(Boolean);
  return ids.map(id => `<@&${id}>`).join(' ');
}

module.exports = { iniciarMonitorTurnos, limpiarAlertaTurno };
