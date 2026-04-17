require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { syncApplicationCommands } = require('./bootstrap/commandRegistry');

(async () => {
  try {
    await syncApplicationCommands();
    console.log('✅ Comandos registrados exitosamente.');
  } catch (err) {
    console.error('❌ Error al registrar comandos:', err);
    process.exit(1);
  }
})();
