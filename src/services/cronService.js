'use strict';
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const storage = require('../storage');
const logger = require('../utils/logger');

const TIMEZONE = process.env.TIMEZONE || 'America/Bogota';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString()}`;
}

/**
 * Returns the UTC Date equivalent to midnight on day 1 of year/month in the given timezone.
 * Uses noon UTC as reference to avoid DST ambiguity.
 */
function getMonthStartUTC(year, month, timezone) {
  const noon = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(noon);
  const get = t => {
    const v = parseInt(parts.find(p => p.type === t).value, 10);
    return t === 'hour' && v === 24 ? 0 : v;
  };
  const [y, mo, d, h, mi, s] = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(get);
  const offsetMs = Date.UTC(y, mo - 1, d, h, mi, s) - noon.getTime();
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - offsetMs);
}

async function bulkFetchMembers(guild, userIds) {
  const map = new Map();
  await Promise.allSettled(
    userIds.map(id => guild.members.fetch(id).then(m => map.set(id, m)).catch(() => {}))
  );
  return map;
}

// ─── Ranking semanal ─────────────────────────────────────────────────────────

async function publicarRankingSemanal(client) {
  const channelId = process.env.RANKING_CHANNEL_ID;
  const guildId   = process.env.GUILD_ID;
  if (!channelId || !guildId) return;

  try {
    const guild   = await client.guilds.fetch(guildId);
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const allData      = await storage.getAll();
    const membersMap   = await bulkFetchMembers(guild, Object.keys(allData));

    const stats = [];
    for (const [userId, data] of Object.entries(allData)) {
      const turnosSemana = (data.historial || []).filter(t => t.fin && new Date(t.fin) >= sevenDaysAgo);
      const dinero = turnosSemana.reduce((acc, t) => acc + Number(t.dineroTotal || 0), 0);
      if (dinero === 0) continue;
      const nombre = membersMap.get(userId)?.displayName ?? data.ultimoNombre ?? `Usuario (${userId})`;
      stats.push({ userId, nombre, dinero });
    }

    if (stats.length === 0) return;

    stats.sort((a, b) => b.dinero - a.dinero);
    const top10  = stats.slice(0, 10);
    const MEDALS = ['🥇', '🥈', '🥉'];
    const SUFIJOS = ['er', 'do', 'er'];

    const lineas = top10.map((e, i) => {
      if (i < 3) return `${MEDALS[i]} **${i + 1}${SUFIJOS[i]} lugar** — ${e.nombre} | ${formatMoney(e.dinero)}`;
      return `${i + 1}. ${e.nombre} | ${formatMoney(e.dinero)}`;
    });

    const fmtDate = d => d.toLocaleDateString('es-CO', {
      timeZone: TIMEZONE, day: '2-digit', month: 'long', year: 'numeric',
    });
    const lunesStr   = fmtDate(sevenDaysAgo);
    const domingoStr = fmtDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 RANKING SEMANAL — Flota Occidental')
      .setDescription(`Mejores taxistas de la semana\n\n${lineas.join('\n')}`)
      .setFooter({ text: `Semana del ${lunesStr} al ${domingoStr} • Próximo ranking: lunes` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    await channel.send(`¡Felicitaciones <@${top10[0].userId}>! 🏆 Empleado de la semana`);

    logger.info(`[CronRanking] Ranking semanal publicado — ${top10.length} taxistas.`);
  } catch (error) {
    logger.error(`[CronRanking] Error: ${error.message}`);
  }
}

// ─── Resumen mensual ─────────────────────────────────────────────────────────

async function publicarResumenMensual(client) {
  const channelId = process.env.ESTADISTICAS_CHANNEL_ID;
  const guildId   = process.env.GUILD_ID;
  if (!channelId || !guildId) return;

  try {
    const guild   = await client.guilds.fetch(guildId);
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    // Determine previous month in the configured timezone
    const now      = new Date();
    const nowParts = new Intl.DateTimeFormat('en', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    const currYear  = parseInt(nowParts.find(p => p.type === 'year').value, 10);
    const currMonth = parseInt(nowParts.find(p => p.type === 'month').value, 10);
    const prevYear  = currMonth === 1 ? currYear - 1 : currYear;
    const prevMonth = currMonth === 1 ? 12 : currMonth - 1;

    const startPrev = getMonthStartUTC(prevYear, prevMonth, TIMEZONE);
    const startCurr = getMonthStartUTC(currYear, currMonth, TIMEZONE);

    const allData    = await storage.getAll();
    const membersMap = await bulkFetchMembers(guild, Object.keys(allData));

    let totalCarreras = 0;
    let totalDinero   = 0;
    const taxistasActivos = [];

    for (const [userId, data] of Object.entries(allData)) {
      const turnosMes = (data.historial || []).filter(t =>
        t.fin && new Date(t.fin) >= startPrev && new Date(t.fin) < startCurr
      );
      if (turnosMes.length === 0) continue;

      const carreras = turnosMes.reduce((acc, t) => acc + Number(t.carreras || 0), 0);
      const dinero   = turnosMes.reduce((acc, t) => acc + Number(t.dineroTotal || 0), 0);
      totalCarreras += carreras;
      totalDinero   += dinero;

      const nombre = membersMap.get(userId)?.displayName ?? data.ultimoNombre ?? `Usuario (${userId})`;
      taxistasActivos.push({ nombre, carreras, dinero });
    }

    if (taxistasActivos.length === 0) return;

    const masRentable = taxistasActivos.reduce((a, b) => (b.dinero > a.dinero ? b : a));
    const masActivo   = taxistasActivos.reduce((a, b) => (b.carreras > a.carreras ? b : a));
    const promedio    = Math.round(totalDinero / taxistasActivos.length);

    const rawMesNombre = new Date(Date.UTC(prevYear, prevMonth - 1, 15))
      .toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });
    const mesNombre = rawMesNombre.charAt(0).toUpperCase() + rawMesNombre.slice(1);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 RESUMEN MENSUAL — ${mesNombre} ${prevYear}`)
      .addFields(
        { name: '💼 Taxistas activos',    value: `${taxistasActivos.length}`,                                      inline: true },
        { name: '🏁 Total carreras',       value: `${totalCarreras}`,                                               inline: true },
        { name: '💰 Dinero generado',      value: formatMoney(totalDinero),                                         inline: true },
        { name: '📈 Promedio por taxista', value: formatMoney(promedio),                                            inline: true },
        { name: '🏆 Más rentable',         value: `${masRentable.nombre} — ${formatMoney(masRentable.dinero)}`,     inline: true },
        { name: '⚡ Más carreras',          value: `${masActivo.nombre} — ${masActivo.carreras} carreras`,           inline: true },
      )
      .setFooter({ text: 'Flota Occidental • Resumen automático' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    logger.info(`[CronMensual] Resumen de ${mesNombre} ${prevYear} publicado.`);
  } catch (error) {
    logger.error(`[CronMensual] Error: ${error.message}`);
  }
}

// ─── Inicialización ───────────────────────────────────────────────────────────

function iniciarCrons(client) {
  const rankingCron = process.env.RANKING_CRON || '0 0 * * 1';

  if (!cron.validate(rankingCron)) {
    logger.warn(`[Cron] RANKING_CRON inválido ("${rankingCron}") — ranking semanal desactivado.`);
  } else {
    cron.schedule(rankingCron, () => {
      publicarRankingSemanal(client).catch(err =>
        logger.error(`[CronRanking] Error no capturado: ${err.message}`)
      );
    }, { timezone: TIMEZONE });
    logger.info(`[Cron] Ranking semanal: ${rankingCron} (${TIMEZONE})`);
  }

  cron.schedule('0 0 1 * *', () => {
    publicarResumenMensual(client).catch(err =>
      logger.error(`[CronMensual] Error no capturado: ${err.message}`)
    );
  }, { timezone: TIMEZONE });
  logger.info(`[Cron] Resumen mensual: 0 0 1 * * (${TIMEZONE})`);
}

module.exports = { iniciarCrons };
