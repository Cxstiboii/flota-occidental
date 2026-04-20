const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getServerStatus, formatServerStatus } = require('../services/rageService');
const { safeDeferReply, safeEditReply } = require('../utils/discordResponses');

const TIMEZONE = process.env.TIMEZONE || 'America/Bogota';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servidor')
    .setDescription('🎮 Consulta el estado actual del servidor ORION'),

  async execute(interaction) {
    await safeDeferReply(interaction, { ephemeral: true }, 'command=/servidor');

    try {
      const status = await getServerStatus();
      const fmt    = formatServerStatus(status);

      const peak = (status.peak || 0).toLocaleString();
      const hora = new Date(status.lastCheck).toLocaleTimeString('es-CO', {
        timeZone: TIMEZONE,
        hour:     '2-digit',
        minute:   '2-digit',
        second:   '2-digit',
        hour12:   false,
      });

      const embed = new EmbedBuilder()
        .setColor(status.online ? 0x57F287 : 0xED4245)
        .setTitle('🎮 Estado del Servidor — ORION')
        .addFields(
          { name: 'Estado',            value: fmt.estado,    inline: true  },
          { name: 'Jugadores',         value: fmt.jugadores, inline: true  },
          { name: 'Capacidad',         value: fmt.barra,     inline: false },
          { name: 'Peak histórico',    value: peak,          inline: true  },
          { name: 'Verificado',        value: hora,          inline: true  },
        )
        .setFooter({ text: 'Flota Occidental • GTAHUB.GG 2.0 | ORION' })
        .setTimestamp();

      await safeEditReply(interaction, { embeds: [embed] });
    } catch {
      await safeEditReply(interaction, {
        content: '⚠️ No se pudo obtener el estado del servidor en este momento.',
        flags:   MessageFlags.Ephemeral,
      });
    }
  },
};
