const storage = require('../storage');

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

async function getDashboard(guild) {
  const allData = await storage.getAll();
  const entries = Object.entries(allData);
  const dashboard = {
    taxistasRegistrados: entries.length,
    turnosActivos: 0,
    turnosCerrados: 0,
    totalCarreras: 0,
    totalEncargos: 0,
    totalDinero: 0,
    pendientesCaptura: 0,
    topTaxistas: [],
  };

  const ranking = [];

  for (const [userId, data] of entries) {
    const historial = data.historial || [];
    const ridesActivas = data.registrosCarreras || [];
    const totalCarreras = _sumarHistorial(data, 'carreras') + (data.turnoActivo ? data.carreras : 0);
    const totalEncargos = _sumarHistorial(data, 'encargos') + (data.turnoActivo ? data.encargos : 0);
    const totalDinero = _sumarHistorial(data, 'dineroTotal') + (data.turnoActivo ? data.dineroTotal : 0);

    dashboard.turnosActivos += data.turnoActivo ? 1 : 0;
    dashboard.turnosCerrados += historial.length;
    dashboard.totalCarreras += totalCarreras;
    dashboard.totalEncargos += totalEncargos;
    dashboard.totalDinero += totalDinero;
    dashboard.pendientesCaptura += historial.reduce((acc, turno) => acc + Number(turno.pendientesCaptura ?? 0), 0);
    dashboard.pendientesCaptura += ridesActivas.filter(ride => !ride.screenshotUrl).length;

    let nombre = `Usuario (${userId})`;
    try {
      const member = await guild.members.fetch(userId);
      nombre = member.displayName;
    } catch { /* usuario fuera del servidor */ }

    ranking.push({ userId, nombre, totalCarreras, totalEncargos, totalDinero });
  }

  dashboard.topTaxistas = ranking
    .sort((a, b) => b.totalDinero - a.totalDinero)
    .slice(0, 5);

  return dashboard;
}

async function getTaxistaDetalle(guild, userId) {
  const data = await storage.get(userId);
  if (!data) return null;

  let nombre = data.ultimoNombre ?? `Usuario (${userId})`;
  try {
    const member = await guild.members.fetch(userId);
    nombre = member.displayName;
  } catch { /* usuario fuera del servidor */ }

  const historial = data.historial || [];
  const ridesActivas = data.registrosCarreras || [];
  const ridesHistoricas = historial.flatMap(turno => turno.registros || []);
  const todasLasCarreras = [...ridesActivas, ...ridesHistoricas]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  return {
    userId,
    nombre,
    turnoActivo: data.turnoActivo,
    inicioTurno: data.inicioTurno,
    activeShift: data.activeShift,
    pendingRide: data.pendingRide,
    carrerasActuales: data.carreras,
    encargosActuales: data.encargos,
    dineroActual: data.dineroTotal,
    totalTurnos: historial.length,
    totalCarreras: _sumarHistorial(data, 'carreras') + (data.turnoActivo ? data.carreras : 0),
    totalEncargos: _sumarHistorial(data, 'encargos') + (data.turnoActivo ? data.encargos : 0),
    totalDinero: _sumarHistorial(data, 'dineroTotal') + (data.turnoActivo ? data.dineroTotal : 0),
    pendientesCaptura: historial.reduce((acc, turno) => acc + Number(turno.pendientesCaptura ?? 0), 0)
      + ridesActivas.filter(ride => !ride.screenshotUrl).length,
    ultimosTurnos: historial.slice(-3).reverse(),
    ultimasCarreras: todasLasCarreras.slice(0, 5),
    raw: data,
  };
}

async function exportarDatos() {
  return storage.getAll();
}

function _sumarHistorial(data, campo) {
  return (data.historial || []).reduce((acc, t) => acc + (t[campo] ?? 0), 0);
}

module.exports = { getRanking, getDashboard, getTaxistaDetalle, exportarDatos };
