const { ActivityType } = require('discord.js');
const { buildTaxiPanelEmbed, buildTaxiPanelRows } = require('../ui/panelView');
const logger = require('../utils/logger');
const { safeSend } = require('../utils/discordResponses');
const storage = require('../storage');
const { getPanelMessageId, setPanelMessageId } = require('../services/panelState');
const { publishSolicitudPanelOnStartup } = require('../services/solicitudService');
const { publishTicketPanelOnStartup }   = require('../services/ticketService');
const { alertOrphanChannels } = require('../services/auditoriaService');
const { iniciarMonitorTurnos } = require('../services/turnoMonitor');
const { iniciarCrons } = require('../services/cronService');
const { iniciarDashboard } = require('../services/dashboardService');
const { iniciarMonitorServidor } = require('../services/rageService');
const { iniciarAdminDashboard }  = require('../services/adminDashboardService');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Bot en línea como ${client.user.tag}`);
    client.user.setActivity('🚖 Flota Occidental', { type: ActivityType.Watching });

    await publishPanelOnStartup(client);
    await publishSolicitudPanelOnStartup(client);
    await publishTicketPanelOnStartup(client);
    await verifyActiveShiftChannels(client);
    iniciarMonitorTurnos(client);
    iniciarDashboard(client);
    iniciarAdminDashboard(client);
    iniciarMonitorServidor(client);
    iniciarCrons(client);
  },
};

async function publishPanelOnStartup(client) {
  const channelId = process.env.TAXI_PANEL_CHANNEL_ID;
  if (!channelId) {
    logger.warn('TAXI_PANEL_CHANNEL_ID no configurado — panel automático desactivado.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logger.warn(`Canal de panel ${channelId} no encontrado.`);
      return;
    }

    const allData      = await storage.getAll();
    const activosCount = Object.values(allData).filter(d => d.turnoActivo).length;

    const panelPayload = {
      embeds: [buildTaxiPanelEmbed(activosCount)],
      components: buildTaxiPanelRows(),
    };

    const existingId = getPanelMessageId();
    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit(panelPayload);
        logger.info(`[Panel] Panel editado en startup (messageId=${existingId})`);
        return;
      } catch {
        logger.warn(`[Panel] Mensaje ${existingId} no encontrado, publicando uno nuevo.`);
        setPanelMessageId(null);
      }
    }

    const msg = await safeSend(channel, panelPayload, `startup-panel channelId=${channelId}`);
    if (msg) {
      setPanelMessageId(msg.id);
      logger.info(`[Panel] Panel publicado en startup (messageId=${msg.id}) — actualiza TAXI_PANEL_MESSAGE_ID=${msg.id} en .env`);
    }
  } catch (error) {
    logger.error(`Error publicando panel en startup: ${error.message}`);
  }
}

async function verifyActiveShiftChannels(client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return;

  try {
    const guild   = await client.guilds.fetch(guildId);
    const allData = await storage.getAll();
    let cleaned   = 0;

    for (const [userId, data] of Object.entries(allData)) {
      if (!data.turnoActivo || !data.activeShift?.channelId) continue;

      const channelId = data.activeShift.channelId;
      let channelExists = false;

      try {
        const ch = await guild.channels.fetch(channelId);
        channelExists = Boolean(ch);
      } catch {
        channelExists = false;
      }

      if (!channelExists) {
        logger.warn(`Canal de turno ${channelId} del usuario ${userId} no existe. Limpiando referencia.`);
        data.activeShift = { ...data.activeShift, channelId: null };
        await storage.set(userId, data);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Startup: ${cleaned} referencia(s) de canal de turno limpiada(s).`);
      alertOrphanChannels(client, cleaned).catch(err =>
        logger.warn(`No se pudo enviar alerta de canales huérfanos: ${err.message}`)
      );
    }
  } catch (error) {
    logger.error(`Error verificando canales de turno activos: ${error.message}`);
  }
}
