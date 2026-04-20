const { SlashCommandBuilder } = require('discord.js');
const { endShiftFlow } = require('../controllers/panelController');
const { esTaxista } = require('../utils/permisos');
const { embedError } = require('../utils/embeds');
const { safeReply } = require('../utils/discordResponses');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('finalizar_turno')
    .setDescription('🏁 Finaliza tu turno y consulta el resumen'),

  async execute(interaction) {
    if (!esTaxista(interaction.member)) {
      return safeReply(interaction, {
        embeds: [embedError('No tienes el rol **Taxista** necesario.')],
        ephemeral: true,
      }, 'command=/finalizar_turno no-role');
    }

    return endShiftFlow(interaction);
  },
};
