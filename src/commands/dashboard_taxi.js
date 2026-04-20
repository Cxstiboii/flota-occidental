const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getDashboard } = require('../services/estadisticasService');
const { esSupervisor } = require('../utils/permisos');
const { embedError, embedInfo } = require('../utils/embeds');
const { safeReply, safeDeferReply, safeEditReply } = require('../utils/discordResponses');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard_taxi')
    .setDescription('Resumen global de toda la operacion del bot'),

  async execute(interaction) {
    if (!esSupervisor(interaction.member)) {
      return safeReply(interaction, {
        embeds: [embedError('Solo Supervisores y Dueños pueden consultar el dashboard.')],
        flags: MessageFlags.Ephemeral,
      }, 'command=/dashboard_taxi no-role');
    }

    await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral }, 'command=/dashboard_taxi');
    const data = await getDashboard(interaction.guild);

    const topFields = data.topTaxistas.length > 0
      ? data.topTaxistas.map((taxista, index) => ({
          name: `#${index + 1} ${taxista.nombre}`,
          value: `💵 $${taxista.totalDinero.toLocaleString()} | 🚕 ${taxista.totalCarreras} carreras | 📦 ${taxista.totalEncargos} encargos`,
          inline: false,
        }))
      : [{ name: 'Top taxistas', value: 'Aun no hay informacion registrada.', inline: false }];

    return safeEditReply(interaction, {
      embeds: [embedInfo(
        'Dashboard global de Flota Occidental',
        'Vista rapida del estado operativo e historico.',
        [
          { name: 'Taxistas registrados', value: `${data.taxistasRegistrados}`, inline: true },
          { name: 'Turnos activos', value: `${data.turnosActivos}`, inline: true },
          { name: 'Turnos cerrados', value: `${data.turnosCerrados}`, inline: true },
          { name: 'Carreras totales', value: `${data.totalCarreras}`, inline: true },
          { name: 'Encargos totales', value: `${data.totalEncargos}`, inline: true },
          { name: 'Dinero total', value: `$${data.totalDinero.toLocaleString()}`, inline: true },
          { name: 'Pendientes de screenshot', value: `${data.pendientesCaptura}`, inline: true },
          ...topFields,
        ],
      )],
    }, 'command=/dashboard_taxi success');
  },
};
