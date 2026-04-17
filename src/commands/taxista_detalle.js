const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getTaxistaDetalle } = require('../services/estadisticasService');
const { esSupervisor } = require('../utils/permisos');
const { embedError, embedInfo } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('taxista_detalle')
    .setDescription('Consulta el detalle completo de un taxista')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario a consultar')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!esSupervisor(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('Solo Supervisores y Dueños pueden consultar este detalle.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const usuario = interaction.options.getUser('usuario', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const detalle = await getTaxistaDetalle(interaction.guild, usuario.id);
    if (!detalle) {
      return interaction.editReply({
        embeds: [embedError('Ese taxista aun no tiene informacion registrada.')],
      });
    }

    const ultimasCarreras = detalle.ultimasCarreras.length > 0
      ? detalle.ultimasCarreras.map(carrera => ({
          name: `${carrera.origin} -> ${carrera.destination}`,
          value: `💵 $${Number(carrera.valor).toLocaleString()} | 📸 ${carrera.screenshotUrl ? 'Si' : 'No'} | <t:${Math.floor(new Date(carrera.createdAt).getTime() / 1000)}:R>`,
          inline: false,
        }))
      : [{ name: 'Ultimas carreras', value: 'Sin carreras registradas.', inline: false }];

    return interaction.editReply({
      embeds: [embedInfo(
        `Detalle de ${detalle.nombre}`,
        `Usuario: <@${detalle.userId}>`,
        [
          { name: 'Estado', value: detalle.turnoActivo ? 'Turno activo' : 'Sin turno', inline: true },
          { name: 'Turnos cerrados', value: `${detalle.totalTurnos}`, inline: true },
          { name: 'Pendientes screenshot', value: `${detalle.pendientesCaptura}`, inline: true },
          { name: 'Carreras totales', value: `${detalle.totalCarreras}`, inline: true },
          { name: 'Encargos totales', value: `${detalle.totalEncargos}`, inline: true },
          { name: 'Dinero total', value: `$${detalle.totalDinero.toLocaleString()}`, inline: true },
          { name: 'Canal activo', value: detalle.activeShift?.channelId ? `<#${detalle.activeShift.channelId}>` : 'N/D', inline: true },
          { name: 'Ultimo inicio', value: detalle.inicioTurno ? `<t:${Math.floor(new Date(detalle.inicioTurno).getTime() / 1000)}:F>` : 'N/D', inline: true },
          ...ultimasCarreras,
        ],
      )],
    });
  },
};
