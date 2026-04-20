'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');

// ── Carga segura de rage-mp ──────────────────────────────────────────────────

let RageMp;
try { RageMp = require('rage-mp').default; } catch { RageMp = null; }

// ── Configuración del servidor ───────────────────────────────────────────────

const SERVER_IP   = 'mundo1.gtahub.gg:22010';
const SERVER_NAME = 'ORION';
const CACHE_TTL   = 2 * 60 * 1000; // 2 minutos

// ── Estado en memoria ────────────────────────────────────────────────────────

let cache = { data: null, lastUpdate: null };

let _client            = null;
let _eraOnline         = null;  // null = primer ciclo, sin alertas
let _ultimaAlertaLleno = null;  // timestamp de última alerta de servidor lleno

// ── Fetch fresco (siempre llama a la API, actualiza cache) ───────────────────

async function _fetchFresh() {
  if (!RageMp) {
    const result = {
      online:     false,
      name:       SERVER_NAME,
      players:    0,
      maxplayers: 3000,
      peak:       cache.data?.peak || 0,
      lastCheck:  new Date(),
      error:      'rage-mp no instalado',
    };
    cache.data      = result;
    cache.lastUpdate = Date.now();
    return result;
  }

  try {
    const rageMp = new RageMp({ timeout: 5000 });
    const server = await rageMp.getSingleServer(SERVER_IP);

    const result = {
      online:     true,
      name:       SERVER_NAME,
      players:    server.players    || 0,
      maxplayers: server.maxplayers || 3000,
      peak:       server.peak       || 0,
      gamemode:   server.gamemode   || 'roleplay',
      lastCheck:  new Date(),
    };

    cache.data       = result;
    cache.lastUpdate = Date.now();
    return result;

  } catch (error) {
    const result = {
      online:     false,
      name:       SERVER_NAME,
      players:    0,
      maxplayers: 3000,
      peak:       cache.data?.peak || 0,
      lastCheck:  new Date(),
      error:      error.message,
    };
    cache.data       = result;
    cache.lastUpdate = Date.now();
    return result;
  }
}

// ── Obtener estado (con cache) ───────────────────────────────────────────────

async function getServerStatus() {
  if (cache.data && Date.now() - cache.lastUpdate < CACHE_TTL) {
    return cache.data;
  }
  return _fetchFresh();
}

// ── Formatear para embed ─────────────────────────────────────────────────────

function formatServerStatus(status) {
  if (!status.online) {
    return {
      estado:    '🔴 Offline',
      jugadores: 'N/A',
      barra:     '░░░░░░░░░░',
    };
  }

  const porcentaje = status.players / status.maxplayers;
  const llenos     = Math.round(porcentaje * 10);
  const barra      = '█'.repeat(llenos) + '░'.repeat(10 - llenos);

  return {
    estado:    '🟢 En línea',
    jugadores: `${status.players.toLocaleString()} / ${status.maxplayers.toLocaleString()}`,
    barra:     `${barra} ${Math.round(porcentaje * 100)}%`,
  };
}

// ── Enviar alerta al canal de alertas ────────────────────────────────────────

async function _enviarAlerta(payload) {
  if (!_client || !config.alertasChannelId) return;
  try {
    const channel = await _client.channels.fetch(config.alertasChannelId);
    if (channel?.isTextBased()) await channel.send(payload);
  } catch (err) {
    logger.warn(`[RageService] No se pudo enviar alerta: ${err.message}`);
  }
}

// ── Lógica de alertas ────────────────────────────────────────────────────────

async function _verificarAlertas(status) {
  // Alerta 1 — servidor se cae
  if (_eraOnline === true && !status.online) {
    await _enviarAlerta({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🔴 SERVIDOR ORION — OFFLINE')
          .setDescription('El servidor de GTA RP no responde.')
          .setTimestamp()
          .setFooter({ text: 'Flota Occidental • ORION Monitor' }),
      ],
    });
  }

  // Alerta 2 — servidor vuelve en línea
  if (_eraOnline === false && status.online) {
    const fmt = formatServerStatus(status);
    await _enviarAlerta({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🟢 SERVIDOR ORION — DE VUELTA EN LÍNEA')
          .addFields(
            { name: 'Jugadores actuales',    value: fmt.jugadores, inline: true },
            { name: 'Hora de restauración',  value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: 'Flota Occidental • ORION Monitor' }),
      ],
    });
  }

  // Alerta 3 — servidor casi lleno (>= 90%), anti-spam 1 vez/hora
  if (status.online) {
    const porcentaje = status.players / status.maxplayers;
    const HORA_MS    = 60 * 60 * 1000;
    const cooldownOk = !_ultimaAlertaLleno || Date.now() - _ultimaAlertaLleno > HORA_MS;

    if (porcentaje >= 0.90 && cooldownOk) {
      _ultimaAlertaLleno = Date.now();
      const fmt = formatServerStatus(status);
      await _enviarAlerta({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('⚠️ SERVIDOR ORION — CASI LLENO')
            .addFields(
              { name: 'Jugadores',  value: fmt.jugadores,                         inline: true },
              { name: 'Capacidad',  value: fmt.barra,                             inline: true },
              { name: 'Porcentaje', value: `${Math.round(porcentaje * 100)}%`,   inline: true },
            )
            .setTimestamp()
            .setFooter({ text: 'Flota Occidental • ORION Monitor' }),
        ],
      });
    }
  }

  _eraOnline = status.online;
}

// ── Monitor automático ───────────────────────────────────────────────────────

function iniciarMonitorServidor(client) {
  _client = client;

  const ciclo = async () => {
    try {
      const status = await _fetchFresh();
      await _verificarAlertas(status);
    } catch (err) {
      logger.warn(`[RageService] Error en ciclo de monitoreo: ${err.message}`);
    }
  };

  ciclo();
  setInterval(ciclo, CACHE_TTL);
  logger.info(`[RageService] Monitor ORION iniciado (intervalo: ${CACHE_TTL / 1000}s)`);
}

module.exports = { getServerStatus, formatServerStatus, iniciarMonitorServidor };
