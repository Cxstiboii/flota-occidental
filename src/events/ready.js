const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    logger.info(`Bot en línea como ${client.user.tag}`);
    client.user.setActivity('🚖 Los Santos Taxi Co.', { type: ActivityType.Watching });
  },
};
