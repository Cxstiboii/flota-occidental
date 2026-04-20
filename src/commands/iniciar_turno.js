const { SlashCommandBuilder } = require('discord.js');
const { startShiftFlow } = require('../controllers/panelController');
const { esTaxista } = require('../utils/permisos');
const { embedError } = require('../utils/embeds');
const { safeReply } = require('../utils/discordResponses');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('iniciar_turno')
    .setDescription('🚖 Inicia tu turno de trabajo'),

  async execute(interaction) {
    if (!esTaxista(interaction.member)) {
      return safeReply(interaction, {
        embeds: [embedError('No tienes el rol **Taxista** necesario para usar este comando.')],
        ephemeral: true,
      }, 'command=/iniciar_turno no-role');
    }

    return startShiftFlow(interaction);
  },
};
