const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

function buildRideModal() {
  return new ModalBuilder()
    .setCustomId('ride:create')
    .setTitle('Registrar carrera')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('origin')
          .setLabel('Punto de origen')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('destination')
          .setLabel('Destino')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fare')
          .setLabel('Valor de la carrera')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ejemplo: 3500')
          .setMaxLength(12)
          .setRequired(true),
      ),
    );
}

module.exports = { buildRideModal };
