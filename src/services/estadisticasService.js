const storage = require('../storage');

/**
 * Obtiene todos los miembros de un conjunto de userIds en paralelo.
 * Devuelve un Map<userId, GuildMember> con los que se pudieron resolver.
 * Los que ya no están en el servidor simplemente no aparecen en el Map.
 */
async function bulkFetchMembers(guild, userIds) {
  const membersMap = new Map();
  if (userIds.length === 0) return membersMap;

  const results = await Promise.allSettled(
    userIds.map(id => guild.members.fetch(id))
  );

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      membersMap.set(userIds[i], result.value);
    }
  });

  return membersMap;
}

function resolveNombre(membersMap, userId, data) {
  return membersMap.get(userId)?.displayName ?? data.ultimoNombre ?? `Usuario (${userId})`;
}

async function getRanking(guild) {
  const allData = await storage.getAll();
  const userIds = Object.keys(allData);
  const membersMap = await bulkFetchMembers(guild, userIds);

  const ranking = userIds.map(userId => {
    const data = allData[userId];
    return {
      userId,
      nombre:        resolveNombre(membersMap, userId, data),
      totalCarreras: getLifetimeMetric(data, 'totalCarreras', 'carreras'),
      totalEncargos: getLifetimeMetric(data, 'totalEncargos', 'encargos'),
      totalDinero:   getLifetimeMetric(data, 'totalGanado', 'dineroTotal'),
    };
  });

  return ranking.sort((a, b) => b.totalDinero - a.totalDinero);
}

async function getDashboard(guild) {
  const allData = await storage.getAll();
  const userIds = Object.keys(allData);
  const membersMap = await bulkFetchMembers(guild, userIds);

  const dashboard = {
    taxistasRegistrados: userIds.length,
    turnosActivos: 0,
    turnosCerrados: 0,
    totalCarreras: 0,
    totalEncargos: 0,
    totalDinero: 0,
    pendientesCaptura: 0,
    topTaxistas: [],
  };

  const ranking = userIds.map(userId => {
    const data         = allData[userId];
    const historial    = data.historial || [];
    const ridesActivas = data.registrosCarreras || [];
    const totalCarreras = getLifetimeMetric(data, 'totalCarreras', 'carreras');
    const totalEncargos = getLifetimeMetric(data, 'totalEncargos', 'encargos');
    const totalDinero   = getLifetimeMetric(data, 'totalGanado', 'dineroTotal');

    dashboard.turnosActivos   += data.turnoActivo ? 1 : 0;
    dashboard.turnosCerrados  += historial.length;
    dashboard.totalCarreras   += totalCarreras;
    dashboard.totalEncargos   += totalEncargos;
    dashboard.totalDinero     += totalDinero;
    dashboard.pendientesCaptura += historial.reduce((acc, t) => acc + Number(t.pendientesCaptura ?? 0), 0);
    dashboard.pendientesCaptura += ridesActivas.filter(r => !r.screenshotUrl).length;

    return {
      userId,
      nombre: resolveNombre(membersMap, userId, data),
      totalCarreras,
      totalEncargos,
      totalDinero,
    };
  });

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
    totalCarreras: getLifetimeMetric(data, 'totalCarreras', 'carreras'),
    totalEncargos: getLifetimeMetric(data, 'totalEncargos', 'encargos'),
    totalDinero: getLifetimeMetric(data, 'totalGanado', 'dineroTotal'),
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

function getLifetimeMetric(data, totalField, fallbackField) {
  const explicitTotal = Number(data?.[totalField] ?? 0);
  if (explicitTotal > 0) return explicitTotal;

  return _sumarHistorial(data, fallbackField) + Number(data?.[fallbackField] ?? 0);
}

module.exports = { getRanking, getDashboard, getTaxistaDetalle, exportarDatos };
