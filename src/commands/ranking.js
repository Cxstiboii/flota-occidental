const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getRanking } = require('../services/estadisticasService');
const { esSupervisor } = require('../utils/permisos');
const { embedInfo, embedError } = require('../utils/embeds');
const { safeReply, safeDeferReply, safeEditReply } = require('../utils/discordResponses');

const MEDALLAS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('🏆 Ranking global de taxistas (solo Supervisores y Dueños)'),

  async execute(interaction) {
    if (!esSupervisor(interaction.member)) {
      return safeReply(interaction, {
        embeds: [embedError('Solo **Supervisores** y **Dueños** pueden ver el ranking.')],
        flags: MessageFlags.Ephemeral,
      }, 'command=/ranking no-role');
    }

    await safeDeferReply(interaction, {}, 'command=/ranking');

    const ranking = await getRanking(interaction.guild);

    if (ranking.length === 0) {
      return safeEditReply(interaction, { embeds: [embedError('Aún no hay datos registrados.')] }, 'command=/ranking empty');
    }

    const fields = ranking.slice(0, 10).map((t, i) => ({
      name:   `${MEDALLAS[i] ?? `#${i + 1}`}  ${t.nombre}`,
      value:  `💵 $${t.totalDinero.toLocaleString()} | 🚗 ${t.totalCarreras} carreras | 📦 ${t.totalEncargos} encargos`,
      inline: false,
    }));

    return safeEditReply(interaction, {
      embeds: [embedInfo(
        '🏆 Ranking Global — Flota Occidental',
        'Top 10 taxistas por dinero acumulado en todos sus turnos.',
        fields,
      )],
    }, 'command=/ranking success');
  },
};
