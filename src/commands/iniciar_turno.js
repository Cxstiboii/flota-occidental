const { SlashCommandBuilder } = require('discord.js');
const { startShiftFlow } = require('../controllers/panelController');
const { esTaxista } = require('../utils/permisos');
const { embedError } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('iniciar_turno')
    .setDescription('🚖 Inicia tu turno de trabajo'),

  async execute(interaction) {
    if (!esTaxista(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('No tienes el rol **Taxista** necesario para usar este comando.')],
        ephemeral: true,
      });
    }

    return startShiftFlow(interaction);
  },
};
