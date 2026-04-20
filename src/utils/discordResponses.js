const { DiscordAPIError, MessageFlags } = require('discord.js');
const logger = require('./logger');

function isIgnorableDiscordError(error) {
  return error instanceof DiscordAPIError && [10008, 10062, 40060].includes(error.code);
}

function logDiscordResponseError(action, error, context = '') {
  const suffix = context ? ` | ${context}` : '';
  if (isIgnorableDiscordError(error)) {
    logger.warn(`Discord ignoro ${action}: ${error.message}${suffix}`);
    return;
  }

  throw error;
}

async function safeReply(interaction, payload, context = '') {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(normalizePayload(payload));
    }

    return await interaction.reply(normalizePayload(payload));
  } catch (error) {
    logDiscordResponseError('reply/followUp', error, context);
    return null;
  }
}

async function safeDeferReply(interaction, options = {}, context = '') {
  try {
    if (interaction.deferred || interaction.replied) return null;
    return await interaction.deferReply(options);
  } catch (error) {
    logDiscordResponseError('deferReply', error, context);
    return null;
  }
}

async function safeEditReply(interaction, payload, context = '') {
  try {
    if (!interaction.deferred && !interaction.replied) {
      return await interaction.reply(normalizePayload(payload));
    }

    return await interaction.editReply(normalizePayload(payload));
  } catch (error) {
    logDiscordResponseError('editReply', error, context);
    return null;
  }
}

async function safeShowModal(interaction, modal, context = '') {
  try {
    return await interaction.showModal(modal);
  } catch (error) {
    logDiscordResponseError('showModal', error, context);
    return null;
  }
}

async function safeSend(channel, payload, context = '') {
  try {
    return await channel.send(payload);
  } catch (error) {
    logDiscordResponseError('channel.send', error, context);
    return null;
  }
}

async function safeDeleteMessage(message, context = '') {
  try {
    if (!message?.deletable) return false;
    await message.delete();
    return true;
  } catch (error) {
    logDiscordResponseError('message.delete', error, context);
    return false;
  }
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  if (payload.ephemeral === true && payload.flags == null) {
    return { ...payload, flags: MessageFlags.Ephemeral };
  }

  return payload;
}

// Mensajes de Discord con más de 13 días no se pueden bulkDelete (límite de la API: 14 días)
const BULK_DELETE_MAX_AGE_MS = 13 * 24 * 60 * 60 * 1000;

/**
 * Borra todos los mensajes del bot en un canal (hasta `limit` mensajes recientes).
 * Usa bulkDelete para los mensajes recientes (una sola request) y delete individual
 * para los que superan los 13 días.
 */
async function cleanBotMessages(channel, botUserId, limit = 20) {
  try {
    const messages   = await channel.messages.fetch({ limit });
    const botMessages = messages.filter(m => m.author.id === botUserId);
    if (botMessages.size === 0) return;

    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
    const recent = botMessages.filter(m => m.createdTimestamp > cutoff);
    const old    = botMessages.filter(m => m.createdTimestamp <= cutoff);

    if (recent.size === 1) {
      await safeDeleteMessage(recent.first(), `clean-bot-msgs channel=${channel.id}`);
    } else if (recent.size > 1) {
      await channel.bulkDelete(recent).catch(err =>
        logger.warn(`bulkDelete parcial en canal ${channel.id}: ${err.message}`)
      );
    }

    for (const msg of old.values()) {
      await safeDeleteMessage(msg, `clean-bot-msgs-old channel=${channel.id}`);
    }
  } catch (err) {
    logger.warn(`cleanBotMessages falló en canal ${channel.id}: ${err.message}`);
  }
}

module.exports = {
  safeReply,
  safeDeferReply,
  safeEditReply,
  safeShowModal,
  safeSend,
  safeDeleteMessage,
  cleanBotMessages,
  isIgnorableDiscordError,
};
