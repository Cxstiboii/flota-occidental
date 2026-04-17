const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const { embedError } = require('../utils/embeds');
const { handleButton, handleModalSubmit } = require('../controllers/panelController');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isButton()) {
      const handled = await handleButton(interaction);
      if (handled) return;
    }

    if (interaction.isModalSubmit()) {
      const handled = await handleModalSubmit(interaction);
      if (handled) return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error(`Error en /${interaction.commandName}: ${err.message}`);
      const reply = {
        embeds: [embedError('Ocurrió un error interno. Contacta a un administrador.')],
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
