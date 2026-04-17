const { SlashCommandBuilder } = require('discord.js');
const { publishPanel } = require('../controllers/panelController');
const { esSupervisor } = require('../utils/permisos');
const { embedError } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel_taxi')
    .setDescription('Publica el panel interactivo de Flota Occidental'),

  async execute(interaction) {
    if (!esSupervisor(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('Solo Supervisores y Dueños pueden publicar el panel.')],
        ephemeral: true,
      });
    }

    return publishPanel(interaction);
  },
};
