const { SlashCommandBuilder } = require('discord.js');
const { registrarCarrera } = require('../services/turnoService');
const { esTaxista } = require('../utils/permisos');
const { embedOk, embedError } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrar_carrera')
    .setDescription('🚕 Registra una carrera completada')
    .addIntegerOption(opt =>
      opt.setName('dinero')
        .setDescription('Dinero cobrado por la carrera')
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction) {
    if (!esTaxista(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('No tienes el rol **Taxista** necesario.')],
        ephemeral: 64,
      });
    }

    const dinero = interaction.options.getInteger('dinero');
    const result = await registrarCarrera(interaction.user.id, {
      origin: 'No especificado',
      destination: 'No especificado',
      valor: dinero,
      channelId: interaction.channelId,
      screenshotUrl: null,
    });

    if (!result.ok) {
      return interaction.reply({ embeds: [embedError(result.msg)], ephemeral: true });
    }

    return interaction.reply({
      embeds: [embedOk(
        '🚕 Carrera Registrada',
        `Registro rapido creado para **${interaction.member.displayName}**. Para una mejor UX usa el panel con botones dentro de tu canal de turno.`,
        [
          { name: '💵 Cobrado',        value: `$${dinero.toLocaleString()}`,             inline: true },
          { name: '🚗 Total Carreras', value: `${result.carreras}`,                       inline: true },
          { name: '💰 Acumulado',      value: `$${result.dineroTotal.toLocaleString()}`, inline: true },
        ],
      )],
    });
  },
};
