const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function loadCommandPayloads() {
  const commandsPath = path.join(__dirname, '../commands');
  return fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'))
    .map(file => require(path.join(commandsPath, file)))
    .filter(command => command.data)
    .map(command => command.data.toJSON());
}

async function syncApplicationCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  const scope = (process.env.COMMAND_SCOPE || 'guild').trim().toLowerCase();

  if (!token || !clientId) {
    throw new Error('Faltan DISCORD_TOKEN o CLIENT_ID para sincronizar comandos.');
  }

  const commands = loadCommandPayloads();
  const rest = new REST({ version: '10' }).setToken(token);
  const route = scope === 'global'
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, guildId);

  if (scope !== 'global' && !guildId) {
    throw new Error('GUILD_ID es obligatorio cuando COMMAND_SCOPE es "guild".');
  }

  logger.info(`Sincronizando ${commands.length} comandos slash en alcance ${scope}...`);
  await rest.put(route, { body: commands });
  logger.info(`Comandos slash sincronizados correctamente en alcance ${scope}.`);
}

module.exports = {
  loadCommandPayloads,
  syncApplicationCommands,
};
