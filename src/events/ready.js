const { ActivityType } = require('discord.js');
const { buildTaxiPanelEmbed, buildTaxiPanelRows } = require('../ui/panelView');
const logger = require('../utils/logger');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Bot en línea como ${client.user.tag}`);
    client.user.setActivity('🚖 Los Santos Taxi Co.', { type: ActivityType.Watching });

    await publishPanelOnStartup(client);
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
      logger.warn(`Canal ${channelId} no encontrado.`);
      return;
    }

    // Borrar mensajes anteriores del bot en ese canal para no acumular paneles
    const messages = await channel.messages.fetch({ limit: 20 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    for (const msg of botMessages.values()) {
      await msg.delete().catch(() => {});
    }

    await channel.send({
      embeds: [buildTaxiPanelEmbed()],
      components: buildTaxiPanelRows(),
    });

    logger.info(`Panel publicado en canal ${channelId}`);
  } catch (error) {
    logger.error(`Error publicando panel en startup: ${error.message}`);
  }
}