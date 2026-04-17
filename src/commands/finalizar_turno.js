const { SlashCommandBuilder } = require('discord.js');
const { endShiftFlow } = require('../controllers/panelController');
const { esTaxista } = require('../utils/permisos');
const { embedError } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('finalizar_turno')
    .setDescription('🏁 Finaliza tu turno y consulta el resumen'),

  async execute(interaction) {
    if (!esTaxista(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('No tienes el rol **Taxista** necesario.')],
        ephemeral: true,
      });
    }

    return endShiftFlow(interaction);
  },
};
