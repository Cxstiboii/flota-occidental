'use strict';
const { EmbedBuilder } = require('discord.js');
const storage = require('../storage');
const logger = require('../utils/logger');

const TIMEZONE        = process.env.TIMEZONE || 'America/Bogota';
const UPDATE_INTERVAL = Number(process.env.DASHBOARD_UPDATE_INTERVAL) || 300000;

let _messageId         = process.env.DASHBOARD_MESSAGE_ID || null;
let _client            = null;
let _ridesSinceUpdate  = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the UTC Date equivalent to midnight (00:00) of today in the given timezone.
 * Computes the offset from current time to avoid DST edge cases.
 */
function getStartOfDayUTC(timezone) {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = t => {
    const v = parseInt(parts.find(p => p.type === t).value, 10);
    return t === 'hour' && v === 24 ? 0 : v;
  };
  const [y, mo, d, h, mi, s] = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(get);
  const offsetMs = Date.UTC(y, mo - 1, d, h, mi, s) - now.getTime();
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) - offsetMs);
}

function formatDuration(startIso) {
  const ms = Date.now() - new Date(startIso).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString()}`;
}

// ─── Embed ────────────────────────────────────────────────────────────────────

async function buildDashboardEmbed(guild) {
  const allData    = await storage.getAll();
  const todayStart = getStartOfDayUTC(TIMEZONE);

  // Resolve names for active taxistas only (minimize API calls)
  const activeIds = Object.entries(allData)
    .filter(([, d]) => d.turnoActivo)
    .map(([id]) => id);

  const membersMap = new Map();
  await Promise.allSettled(
    activeIds.map(id => guild.members.fetch(id).then(m => membersMap.set(id, m)).catch(() => {}))
  );

  const activos       = [];
  let   carrerasHoy   = 0;
  let   dineroHoy     = 0;
  const taxistasHoy   = new Set();

  for (const [userId, data] of Object.entries(allData)) {
    // Active shifts right now
    if (data.turnoActivo && data.inicioTurno) {
      const nombre = membersMap.get(userId)?.displayName ?? data.ultimoNombre ?? `Usuario (${userId})`;
      activos.push({ nombre, carreras: data.carreras || 0, inicio: data.inicioTurno });
    }

    // Closed shifts from today
    const turnosHoy = (data.historial || []).filter(t =>
      t.fin && new Date(t.fin) >= todayStart
    );
    turnosHoy.forEach(t => {
      carrerasHoy += Number(t.carreras || 0);
      dineroHoy   += Number(t.dineroTotal || 0);
      taxistasHoy.add(userId);
    });

    // Active shift that started today counts toward today's stats
    if (data.turnoActivo && data.inicioTurno && new Date(data.inicioTurno) >= todayStart) {
      carrerasHoy += Number(data.carreras || 0);
      dineroHoy   += Number(data.dineroTotal || 0);
      taxistasHoy.add(userId);
    }
  }

  const hayActivos = activos.length > 0;
  const horaLocal  = new Date().toLocaleTimeString('es-CO', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const embed = new EmbedBuilder()
    .setColor(hayActivos ? 0x57F287 : 0xED4245)
    .setTitle('📡 OPERACIONES EN VIVO — Flota Occidental')
    .setTimestamp();

  embed.addFields({
    name:   '📊 Estado actual',
    value:  hayActivos ? `🟢 Turnos activos: **${activos.length}**` : '🔴 Sin taxistas activos',
    inline: false,
  });

  if (hayActivos) {
    const filas = activos.slice(0, 10).map(a =>
      `👤 **${a.nombre}** | 🏁 ${a.carreras} carreras | ⏱️ ${formatDuration(a.inicio)} en turno`
    );
    embed.addFields({ name: '🚖 Taxistas en turno', value: filas.join('\n'), inline: false });
  }

  embed.addFields({
    name:   '📅 Estadísticas de hoy',
    value:  [
      `🏁 Carreras hoy: **${carrerasHoy}**`,
      `💰 Dinero generado hoy: **${formatMoney(dineroHoy)}**`,
      `👥 Taxistas que trabajaron hoy: **${taxistasHoy.size}**`,
    ].join('\n'),
    inline: false,
  });

  embed.setFooter({ text: `Actualizado: ${horaLocal} • Próxima actualización en 5 min` });

  return embed;
}

// ─── Core update ─────────────────────────────────────────────────────────────

async function updateDashboard() {
  const channelId = process.env.DASHBOARD_CHANNEL_ID;
  if (!channelId || !_client) return;

  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return;

    const guild   = await _client.guilds.fetch(guildId);
    const channel = await _client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const payload = { embeds: [await buildDashboardEmbed(guild)] };

    if (_messageId) {
      try {
        const msg = await channel.messages.fetch(_messageId);
        await msg.edit(payload);
        return;
      } catch {
        logger.warn('[Dashboard] Mensaje eliminado, creando uno nuevo.');
        _messageId = null;
      }
    }

    const msg  = await channel.send(payload);
    _messageId = msg.id;
    logger.info(`[Dashboard] Mensaje creado (id=${msg.id}) — actualiza DASHBOARD_MESSAGE_ID=${msg.id} en .env`);
  } catch (error) {
    logger.error(`[Dashboard] Error actualizando: ${error.message}`);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

function iniciarDashboard(client) {
  if (!process.env.DASHBOARD_CHANNEL_ID) {
    logger.info('[Dashboard] DASHBOARD_CHANNEL_ID no configurado — dashboard omitido.');
    return;
  }

  _client = client;

  updateDashboard().catch(() => {});

  setInterval(() => {
    updateDashboard().catch(err =>
      logger.error(`[Dashboard] Error en intervalo: ${err.message}`)
    );
  }, UPDATE_INTERVAL);

  logger.info(`[Dashboard] Iniciado (intervalo: ${UPDATE_INTERVAL / 1000}s, timezone: ${TIMEZONE})`);
}

function triggerDashboardUpdate() {
  if (!_client || !process.env.DASHBOARD_CHANNEL_ID) return;
  updateDashboard().catch(() => {});
}

function notifyNewRide() {
  _ridesSinceUpdate++;
  if (_ridesSinceUpdate >= 5) {
    _ridesSinceUpdate = 0;
    triggerDashboardUpdate();
  }
}

module.exports = { iniciarDashboard, triggerDashboardUpdate, notifyNewRide };
