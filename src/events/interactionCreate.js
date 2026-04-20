const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const { embedError } = require('../utils/embeds');
const { safeEditReply } = require('../utils/discordResponses');
const { handleButton, handleModalSubmit } = require('../controllers/panelController');
const { handleSolicitudButton, handleSolicitudModal } = require('../controllers/solicitudController');
const { handleTicketSelectMenu, handleTicketButton, handleTicketModal } = require('../controllers/ticketController');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      if (interaction.isStringSelectMenu()) {
        const ticketHandled = await handleTicketSelectMenu(interaction);
        if (ticketHandled) return;
      }

      if (interaction.isButton()) {
        const ticketHandled = await handleTicketButton(interaction);
        if (ticketHandled) return;

        const solicitudHandled = await handleSolicitudButton(interaction);
        if (solicitudHandled) return;

        const handled = await handleButton(interaction);
        if (handled) return;
      }

      if (interaction.isModalSubmit()) {
        const ticketHandled = await handleTicketModal(interaction);
        if (ticketHandled) return;

        const solicitudHandled = await handleSolicitudModal(interaction);
        if (solicitudHandled) return;

        const handled = await handleModalSubmit(interaction);
        if (handled) return;
      }

      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction);
    } catch (err) {
      const interactionName = interaction.commandName || interaction.customId || interaction.type;
      logger.error(`Error procesando interaccion ${interactionName}: ${err.message}`);
      // safeEditReply usa editReply cuando está deferido (evita dejar el slot vacío)
      // y reply cuando no ha habido ninguna respuesta aún
      await safeEditReply(interaction, {
        embeds: [embedError('Ocurrió un error interno. Contacta a un administrador.')],
        flags: MessageFlags.Ephemeral,
      }, `interaction=${interactionName}`);
    }
  },
};
