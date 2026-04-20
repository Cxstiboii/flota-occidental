const { SlashCommandBuilder } = require('discord.js');
const { registrarEncargo } = require('../services/turnoService');
const { esTaxista } = require('../utils/permisos');
const { embedOk, embedError } = require('../utils/embeds');
const { safeReply } = require('../utils/discordResponses');

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
      return safeReply(interaction, {
        embeds: [embedError('No tienes el rol **Taxista** necesario.')],
        ephemeral: true,
      }, 'command=/registrar_encargo no-role');
    }

    const dinero = interaction.options.getInteger('dinero');
    const result = await registrarEncargo(interaction.user.id, dinero);

    if (!result.ok) {
      return safeReply(interaction, { embeds: [embedError(result.msg)], ephemeral: true }, 'command=/registrar_encargo service-error');
    }

    return safeReply(interaction, {
      embeds: [embedOk(
        '📦 Encargo Registrado',
        `Encargo entregado con éxito, **${interaction.member.displayName}**.`,
        [
          { name: '💵 Cobrado',        value: `$${dinero.toLocaleString()}`,             inline: true },
          { name: '📦 Total Encargos', value: `${result.encargos}`,                       inline: true },
          { name: '💰 Acumulado',      value: `$${result.dineroTotal.toLocaleString()}`, inline: true },
        ],
      )],
    }, 'command=/registrar_encargo success');
  },
};
