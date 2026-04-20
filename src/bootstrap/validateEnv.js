function validateEnv() {
  const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'MONGODB_URI', 'ALERTAS_CHANNEL_ID'];
  const missing = required.filter(name => !process.env[name]?.trim());

  if (missing.length > 0) {
    const hints = missing.map(name => {
      if (name === 'ALERTAS_CHANNEL_ID') return `  ${name} — ID del canal donde el bot enviará alertas críticas (@Supervisores)`;
      return `  ${name}`;
    }).join('\n');
    throw new Error(`Faltan variables obligatorias:\n${hints}`);
  }

  const uri = process.env.MONGODB_URI.trim();

  if (uri.includes('<') || uri.includes('>')) {
    throw new Error('MONGODB_URI contiene placeholders sin reemplazar. Usa la URI real de MongoDB Atlas.');
  }

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error('MONGODB_URI debe comenzar con mongodb:// o mongodb+srv://');
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch (error) {
    throw new Error(
      'MONGODB_URI no es una URI valida. Verifica formato, caracteres especiales en la password y nombre del cluster.'
    );
  }

  if (!parsed.hostname) {
    throw new Error('MONGODB_URI no incluye el hostname del cluster de MongoDB Atlas.');
  }

  if (parsed.username && !parsed.password) {
    throw new Error('MONGODB_URI incluye usuario pero no password. Revisa las credenciales de Atlas.');
  }

  if (!/[?&]retryWrites=/.test(uri)) {
    process.emitWarning(
      'MONGODB_URI no incluye retryWrites. No bloquea el arranque, pero conviene usar la URI completa entregada por Atlas.',
      { code: 'MONGODB_URI_INCOMPLETE' }
    );
  }

  const solicitudVars = ['SOLICITUD_CHANNEL_ID', 'SOLICITUDES_CATEGORY_ID', 'SOLICITUDES_STAFF_CHANNEL_ID'];
  const missingSolicitud = solicitudVars.filter(name => !process.env[name]?.trim());
  if (missingSolicitud.length > 0) {
    process.emitWarning(
      `Sistema de solicitudes de empleo desactivado. Faltan vars: ${missingSolicitud.join(', ')}`,
      { code: 'SOLICITUDES_CONFIG_INCOMPLETE' }
    );
  }
}

module.exports = { validateEnv };
