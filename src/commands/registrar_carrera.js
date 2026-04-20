const { SlashCommandBuilder } = require('discord.js');
const { registrarCarrera } = require('../services/turnoService');
const { esTaxista } = require('../utils/permisos');
const { embedOk, embedError } = require('../utils/embeds');
const { safeReply } = require('../utils/discordResponses');
const { alertCarreraFueraDeRango, alertMaxCarrerasAlcanzado } = require('../services/auditoriaService');

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
      return safeReply(interaction, {
        embeds: [embedError('No tienes el rol **Taxista** necesario.')],
        ephemeral: true,
      }, 'command=/registrar_carrera no-role');
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
      // Enviar alerta a supervisores si aplica (sin bloquear la respuesta al taxista)
      if (result.code === 'VALOR_MAX') {
        alertCarreraFueraDeRango(interaction.client, interaction.guild, interaction.member, result).catch(() => {});
      } else if (result.code === 'MAX_CARRERAS') {
        alertMaxCarrerasAlcanzado(interaction.client, interaction.guild, interaction.member, result).catch(() => {});
      }
      return safeReply(interaction, { embeds: [embedError(result.msg)], ephemeral: true }, 'command=/registrar_carrera service-error');
    }

    return safeReply(interaction, {
      embeds: [embedOk(
        '🚕 Carrera Registrada',
        `Registro rapido creado para **${interaction.member.displayName}**.\n\n⚠️ **Debes enviar una screenshot** en tu canal de turno para completar el registro. Hasta que lo hagas no podrás registrar otra carrera.\n\nPara mayor comodidad, usa el botón "Registrar carrera" dentro de tu canal de turno.`,
        [
          { name: '💵 Cobrado',        value: `$${dinero.toLocaleString()}`,             inline: true },
          { name: '🚗 Total Carreras', value: `${result.carreras}`,                       inline: true },
          { name: '💰 Acumulado',      value: `$${result.dineroTotal.toLocaleString()}`, inline: true },
        ],
      )],
    }, 'command=/registrar_carrera success');
  },
};
