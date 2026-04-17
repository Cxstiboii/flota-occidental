const { SlashCommandBuilder } = require('discord.js');
const { getRanking } = require('../services/estadisticasService');
const { esSupervisor } = require('../utils/permisos');
const { embedInfo, embedError } = require('../utils/embeds');

const MEDALLAS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('🏆 Ranking global de taxistas (solo Supervisores y Dueños)'),

  async execute(interaction) {
    if (!esSupervisor(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('Solo **Supervisores** y **Dueños** pueden ver el ranking.')],
        ephemeral: 64,
      });
    }

    await interaction.deferReply();

    const ranking = await getRanking(interaction.guild);

    if (ranking.length === 0) {
      return interaction.editReply({ embeds: [embedError('Aún no hay datos registrados.')] });
    }

    const fields = ranking.slice(0, 10).map((t, i) => ({
      name:   `${MEDALLAS[i] ?? `#${i + 1}`}  ${t.nombre}`,
      value:  `💵 $${t.totalDinero.toLocaleString()} | 🚗 ${t.totalCarreras} carreras | 📦 ${t.totalEncargos} encargos`,
      inline: false,
    }));

    return interaction.editReply({
      embeds: [embedInfo(
        '🏆 Ranking Global — Los Santos Taxi Co.',
        'Top 10 taxistas por dinero acumulado en todos sus turnos.',
        fields,
      )],
    });
  },
};
