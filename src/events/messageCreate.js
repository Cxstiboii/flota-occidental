const { handleMessage } = require('../controllers/panelController');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    try {
      await handleMessage(message);
    } catch (error) {
      logger.error(`Error procesando screenshot de carrera: ${error.message}`);
    }
  },
};
