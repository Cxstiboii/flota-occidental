const JsonStorage = require('../storage/JsonStorage');

const storage = new JsonStorage();

async function getRanking(guild) {
  const allData = await storage.getAll();
  const ranking = [];

  for (const [userId, data] of Object.entries(allData)) {
    let nombre = `Usuario (${userId})`;
    try {
      const member = await guild.members.fetch(userId);
      nombre = member.displayName;
    } catch { /* usuario ya no está en el servidor */ }

    const totalCarreras  = _sumarHistorial(data, 'carreras')  + (data.turnoActivo ? data.carreras  : 0);
    const totalEncargos  = _sumarHistorial(data, 'encargos')  + (data.turnoActivo ? data.encargos  : 0);
    const totalDinero    = _sumarHistorial(data, 'dineroTotal') + (data.turnoActivo ? data.dineroTotal : 0);

    ranking.push({ userId, nombre, totalCarreras, totalEncargos, totalDinero });
  }

  return ranking.sort((a, b) => b.totalDinero - a.totalDinero);
}

function _sumarHistorial(data, campo) {
  return (data.historial || []).reduce((acc, t) => acc + (t[campo] ?? 0), 0);
}

module.exports = { getRanking };
