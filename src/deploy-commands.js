require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data) commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registrando ${commands.length} comandos slash...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Comandos registrados exitosamente.');
  } catch (err) {
    console.error('❌ Error al registrar comandos:', err);
  }
})();
