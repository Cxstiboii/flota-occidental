require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./src/utils/logger');
const storage = require('./src/storage');
const { syncApplicationCommands } = require('./src/bootstrap/commandRegistry');
const { validateEnv } = require('./src/bootstrap/validateEnv');

async function main() {
  validateEnv();
  await storage.connect();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.commands = new Collection();

  const commandsPath = path.join(__dirname, 'src', 'commands');
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      logger.info(`Comando cargado: ${command.data.name}`);
    }
  }

  const eventsPath = path.join(__dirname, 'src', 'events');
  for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  client.on('error', (error) => {
    logger.error(`Error del cliente de Discord: ${error.message}`);
  });

  client.on('shardError', (error) => {
    logger.error(`Error de shard de Discord: ${error.message}`);
  });

  if (process.env.SYNC_COMMANDS_ON_STARTUP === 'true') {
    await syncApplicationCommands();
  }

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((error) => {
  logger.error(`No se pudo iniciar el bot: ${error.message}`);
  process.exit(1);
});
