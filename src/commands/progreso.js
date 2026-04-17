const { SlashCommandBuilder } = require('discord.js');
const { showShiftStatusFlow } = require('../controllers/panelController');
const { esTaxista } = require('../utils/permisos');
const { embedError } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('progreso')
    .setDescription('📊 Consulta tu progreso del turno actual'),

  async execute(interaction) {
    if (!esTaxista(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('No tienes el rol **Taxista** necesario.')],
        ephemeral: true,
      });
    }

    return showShiftStatusFlow(interaction);
  },
};
