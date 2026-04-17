const { SlashCommandBuilder } = require('discord.js');
const { registrarEncargo } = require('../services/turnoService');
const { esTaxista } = require('../utils/permisos');
const { embedOk, embedError } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrar_encargo')
    .setDescription('📦 Registra un encargo completado')
    .addIntegerOption(opt =>
      opt.setName('dinero')
        .setDescription('Dinero cobrado por el encargo')
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction) {
    if (!esTaxista(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('No tienes el rol **Taxista** necesario.')],
        ephemeral: true,
      });
    }

    const dinero = interaction.options.getInteger('dinero');
    const result = await registrarEncargo(interaction.user.id, dinero);

    if (!result.ok) {
      return interaction.reply({ embeds: [embedError(result.msg)], ephemeral: true });
    }

    return interaction.reply({
      embeds: [embedOk(
        '📦 Encargo Registrado',
        `Encargo entregado con éxito, **${interaction.member.displayName}**.`,
        [
          { name: '💵 Cobrado',        value: `$${dinero.toLocaleString()}`,             inline: true },
          { name: '📦 Total Encargos', value: `${result.encargos}`,                       inline: true },
          { name: '💰 Acumulado',      value: `$${result.dineroTotal.toLocaleString()}`, inline: true },
        ],
      )],
    });
  },
};
