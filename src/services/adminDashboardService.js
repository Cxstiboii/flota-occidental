'use strict';

const { EmbedBuilder } = require('discord.js');
const storage = require('../storage');
const logger  = require('../utils/logger');
const { getServerStatus, formatServerStatus } = require('./rageService');

const TIMEZONE        = process.env.TIMEZONE || 'America/Bogota';
const UPDATE_INTERVAL = Number(process.env.ADMIN_DASHBOARD_UPDATE_INTERVAL) || 600_000; // 10 min

let _messageId = process.env.ADMIN_DASHBOARD_MESSAGE_ID || null;
let _client    = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function horaLocal() {
  return new Date().toLocaleTimeString('es-CO', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ── Construcción del embed ───────────────────────────────────────────────────

async function buildEstadoEmpresaEmbed() {
  const allData = await storage.getAll();
  const entries = Object.entries(allData);

  const totalRegistrados = entries.length;
  const enTurnoAhora     = entries.filter(([, d]) => d.turnoActivo).length;

  let totalCarrerasGlobal = 0;
  let totalDineroGlobal   = 0;
  const porCarreras       = [];

  for (const [, data] of entries) {
    totalCarrerasGlobal += Number(data.totalCarreras || 0);
    totalDineroGlobal   += Number(data.totalGanado   || 0);
    if (data.totalCarreras > 0) {
      porCarreras.push({
        nombre:   data.ultimoNombre ?? 'Desconocido',
        carreras: Number(data.totalCarreras),
      });
    }
  }

  porCarreras.sort((a, b) => b.carreras - a.carreras);
  const top5 = porCarreras.slice(0, 5);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🏢 Estado de la Empresa — Flota Occidental')
    .setTimestamp();

  // Resumen general
  embed.addFields({
    name: '📊 Resumen general',
    value: [
      `👥 Taxistas registrados: **${totalRegistrados}**`,
      `🟢 En turno ahora: **${enTurnoAhora}**`,
      `🏁 Carreras históricas totales: **${totalCarrerasGlobal.toLocaleString()}**`,
      `💰 Dinero total generado: **$${totalDineroGlobal.toLocaleString()}**`,
    ].join('\n'),
    inline: false,
  });

  // Top 5 histórico
  if (top5.length > 0) {
    const MEDALLAS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    embed.addFields({
      name:  '🏆 Top 5 taxistas (histórico)',
      value: top5.map((t, i) =>
        `${MEDALLAS[i]} **${t.nombre}** — ${t.carreras.toLocaleString()} carreras`
      ).join('\n'),
      inline: false,
    });
  }

  // Servidor ORION
  try {
    const status = await getServerStatus();
    const fmt    = formatServerStatus(status);
    const peak   = (status.peak || 0).toLocaleString();
    const hora   = new Date(status.lastCheck).toLocaleTimeString('es-CO', {
      timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
    });

    embed.addFields({
      name: '🎮 Servidor ORION — Estado actual',
      value: [
        fmt.estado,
        `👥 Jugadores conectados: **${fmt.jugadores}**`,
        fmt.barra,
        `📊 Peak histórico: **${peak}**`,
        `🕐 Última verificación: ${hora}`,
      ].join('\n'),
      inline: false,
    });
  } catch {
    embed.addFields({
      name:  '🎮 Servidor ORION — Estado actual',
      value: '⚠️ Estado no disponible',
      inline: false,
    });
  }

  embed.setFooter({ text: `Actualizado: ${horaLocal()} • Flota Occidental` });
  return embed;
}

// ── Actualización del mensaje ─────────────────────────────────────────────────

async function actualizarEstadoEmpresa() {
  const channelId = process.env.ADMIN_DASHBOARD_CHANNEL_ID;
  if (!channelId || !_client) return;

  try {
    const channel = await _client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const payload = { embeds: [await buildEstadoEmpresaEmbed()] };

    if (_messageId) {
      try {
        const msg = await channel.messages.fetch(_messageId);
        await msg.edit(payload);
        return;
      } catch {
        logger.warn('[AdminDashboard] Mensaje eliminado, creando uno nuevo.');
        _messageId = null;
      }
    }

    const msg  = await channel.send(payload);
    _messageId = msg.id;
    logger.info(
      `[AdminDashboard] Mensaje creado (id=${msg.id}) — actualiza ADMIN_DASHBOARD_MESSAGE_ID=${msg.id} en .env`,
    );
  } catch (error) {
    logger.error(`[AdminDashboard] Error actualizando: ${error.message}`);
  }
}

// ── Inicialización ────────────────────────────────────────────────────────────

function iniciarAdminDashboard(client) {
  if (!process.env.ADMIN_DASHBOARD_CHANNEL_ID) {
    logger.info('[AdminDashboard] ADMIN_DASHBOARD_CHANNEL_ID no configurado — admin dashboard omitido.');
    return;
  }

  _client = client;

  actualizarEstadoEmpresa().catch(() => {});

  setInterval(() => {
    actualizarEstadoEmpresa().catch(err =>
      logger.error(`[AdminDashboard] Error en intervalo: ${err.message}`)
    );
  }, UPDATE_INTERVAL);

  logger.info(`[AdminDashboard] Iniciado (intervalo: ${UPDATE_INTERVAL / 1000}s)`);
}

module.exports = { iniciarAdminDashboard, actualizarEstadoEmpresa };
