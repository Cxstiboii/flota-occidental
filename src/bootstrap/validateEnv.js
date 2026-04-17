function validateEnv() {
  const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'MONGODB_URI'];
  const missing = required.filter(name => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Faltan variables obligatorias: ${missing.join(', ')}`);
  }

  if (process.env.MONGODB_URI.includes('<') || process.env.MONGODB_URI.includes('>')) {
    throw new Error('MONGODB_URI contiene placeholders sin reemplazar. Usa la URI real de MongoDB Atlas.');
  }
}

module.exports = { validateEnv };
