const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { exportarDatos, getTaxistaDetalle } = require('../services/estadisticasService');
const { esDueno, esSupervisor } = require('../utils/permisos');
const { embedError, embedInfo } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('exportar_taxi')
    .setDescription('Exporta la informacion recolectada por el bot')
    .addStringOption(option =>
      option.setName('alcance')
        .setDescription('Que parte de la informacion quieres exportar')
        .setRequired(true)
        .addChoices(
          { name: 'Todo', value: 'todo' },
          { name: 'Un taxista', value: 'taxista' },
        ),
    )
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Obligatorio cuando el alcance es un taxista')
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!esSupervisor(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('Solo Supervisores y Dueños pueden usar esta exportacion.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const alcance = interaction.options.getString('alcance', true);
    const usuario = interaction.options.getUser('usuario');

    if (alcance === 'todo' && !esDueno(interaction.member)) {
      return interaction.reply({
        embeds: [embedError('La exportacion completa esta reservada para Dueños.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (alcance === 'taxista' && !usuario) {
      return interaction.reply({
        embeds: [embedError('Debes indicar un usuario para exportar un taxista.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let payload;
    let fileName;

    if (alcance === 'todo') {
      payload = await exportarDatos();
      fileName = `taxi-export-${Date.now()}.json`;
    } else {
      const detalle = await getTaxistaDetalle(interaction.guild, usuario.id);
      if (!detalle) {
        return interaction.editReply({
          embeds: [embedError('Ese taxista aun no tiene informacion registrada.')],
        });
      }
      payload = detalle.raw;
      fileName = `taxista-${usuario.id}.json`;
    }

    const attachment = new AttachmentBuilder(
      Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
      { name: fileName },
    );

    return interaction.editReply({
      embeds: [embedInfo(
        'Exportacion lista',
        `Se genero el archivo solicitado para alcance: ${alcance}.`,
      )],
      files: [attachment],
    });
  },
};
