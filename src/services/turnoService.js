const JsonStorage = require('../storage/JsonStorage');
const logger = require('../utils/logger');

const storage = new JsonStorage();

function defaultTaxista(userId) {
  return {
    userId,
    turnoActivo: false,
    inicioTurno: null,
    carreras: 0,
    encargos: 0,
    dineroTotal: 0,
    historial: [],
    registrosCarreras: [],
    ultimoNombre: null,
    activeShift: null,
    pendingRide: null,
  };
}

async function getTaxista(userId) {
  return (await storage.get(userId)) ?? defaultTaxista(userId);
}

async function iniciarTurno(userId, options = {}) {
  const taxista = await getTaxista(userId);
  if (taxista.turnoActivo) {
    return { ok: false, msg: 'Ya tienes un turno activo.', taxista };
  }

  const startedAt = options.startedAt ?? new Date().toISOString();
  taxista.turnoActivo = true;
  taxista.inicioTurno = startedAt;
  taxista.carreras = 0;
  taxista.encargos = 0;
  taxista.dineroTotal = 0;
  taxista.ultimoNombre = options.displayName ?? taxista.ultimoNombre;
  taxista.pendingRide = null;
  taxista.activeShift = {
    id: createShiftId(userId, startedAt),
    startedAt,
    channelId: options.channelId ?? null,
  };

  await storage.set(userId, taxista);
  logger.info(`Turno iniciado | userId=${userId} | channelId=${taxista.activeShift.channelId ?? 'sin-canal'}`);
  return { ok: true, taxista };
}

async function finalizarTurno(userId, options = {}) {
  const taxista = await getTaxista(userId);
  if (!taxista.turnoActivo) return { ok: false, msg: 'No tienes ningun turno activo.' };

  const inicio = new Date(taxista.inicioTurno);
  const fin = new Date(options.endedAt ?? new Date().toISOString());
  const pendientesCaptura = taxista.registrosCarreras.filter(
    ride => ride.shiftId === taxista.activeShift?.id && !ride.screenshotUrl,
  ).length;

  const resumen = {
    shiftId: taxista.activeShift?.id ?? null,
    inicio: taxista.inicioTurno,
    fin: fin.toISOString(),
    duracion: formatDuracion(fin - inicio),
    carreras: taxista.carreras,
    encargos: taxista.encargos,
    dineroTotal: taxista.dineroTotal,
    channelId: taxista.activeShift?.channelId ?? null,
    pendientesCaptura,
  };

  taxista.historial.push(resumen);
  taxista.turnoActivo = false;
  taxista.inicioTurno = null;
  taxista.pendingRide = null;
  taxista.activeShift = null;

  await storage.set(userId, taxista);
  logger.info(`Turno finalizado | userId=${userId} | duracion=${resumen.duracion} | pendientes=${pendientesCaptura}`);
  return { ok: true, resumen, taxista };
}

async function registrarCarrera(userId, rideInput) {
  const taxista = await getTaxista(userId);
  if (!taxista.turnoActivo || !taxista.activeShift) {
    return { ok: false, msg: 'Debes iniciar tu turno primero.' };
  }

  const valor = Number(rideInput.valor);
  if (!Number.isInteger(valor) || valor <= 0) {
    return { ok: false, msg: 'El valor de la carrera debe ser un numero entero positivo.' };
  }

  const ride = {
    id: createRideId(userId),
    shiftId: taxista.activeShift.id,
    origin: rideInput.origin.trim(),
    destination: rideInput.destination.trim(),
    valor,
    createdAt: new Date().toISOString(),
    screenshotUrl: rideInput.screenshotUrl ?? null,
    screenshotMessageId: rideInput.screenshotMessageId ?? null,
    channelId: rideInput.channelId ?? taxista.activeShift.channelId ?? null,
    createdBy: userId,
  };

  taxista.carreras += 1;
  taxista.dineroTotal += valor;
  taxista.pendingRide = ride.screenshotUrl ? null : ride.id;
  taxista.registrosCarreras.push(ride);

  await storage.set(userId, taxista);
  logger.info(`Carrera registrada | userId=${userId} | rideId=${ride.id} | valor=${valor}`);
  return { ok: true, ride, carreras: taxista.carreras, dineroTotal: taxista.dineroTotal };
}

async function adjuntarScreenshot(userId, attachment) {
  const taxista = await getTaxista(userId);
  if (!taxista.turnoActivo || !taxista.pendingRide) {
    return { ok: false, msg: 'No tienes carreras pendientes de screenshot.' };
  }

  const ride = taxista.registrosCarreras.find(entry => entry.id === taxista.pendingRide);
  if (!ride) {
    taxista.pendingRide = null;
    await storage.set(userId, taxista);
    return { ok: false, msg: 'La carrera pendiente ya no existe en el registro.' };
  }

  ride.screenshotUrl = attachment.url;
  ride.screenshotMessageId = attachment.messageId ?? null;
  ride.screenshotFilename = attachment.filename ?? null;
  taxista.pendingRide = null;

  await storage.set(userId, taxista);
  logger.info(`Screenshot adjunto | userId=${userId} | rideId=${ride.id}`);
  return { ok: true, ride };
}

async function registrarEncargo(userId, dinero) {
  const taxista = await getTaxista(userId);
  if (!taxista.turnoActivo) return { ok: false, msg: 'Debes iniciar tu turno primero.' };

  const valor = Number(dinero);
  if (!Number.isInteger(valor) || valor <= 0) {
    return { ok: false, msg: 'El valor del encargo debe ser un numero entero positivo.' };
  }

  taxista.encargos += 1;
  taxista.dineroTotal += valor;

  await storage.set(userId, taxista);
  logger.info(`Encargo registrado | userId=${userId} | dinero=${valor}`);
  return { ok: true, encargos: taxista.encargos, dineroTotal: taxista.dineroTotal };
}

async function getProgreso(userId) {
  return getTaxista(userId);
}

function formatDuracion(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${h}h ${m}m ${s}s`;
}

function createShiftId(userId, startedAt) {
  return `shift_${userId}_${new Date(startedAt).getTime()}`;
}

function createRideId(userId) {
  return `ride_${userId}_${Date.now()}`;
}

module.exports = {
  iniciarTurno,
  finalizarTurno,
  registrarCarrera,
  registrarEncargo,
  adjuntarScreenshot,
  getProgreso,
  formatDuracion,
};
