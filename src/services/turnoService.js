const storage = require('../storage');
const logger = require('../utils/logger');
const config = require('../config');
const { Mutex } = require('async-mutex');

const taxistaLocks = new Map();

function defaultTaxista(userId) {
  return {
    userId,
    turnoActivo: false,
    inicioTurno: null,
    carreras: 0,
    encargos: 0,
    dineroTotal: 0,
    totalCarreras: 0,
    totalEncargos: 0,
    totalGanado: 0,
    historial: [],
    registrosCarreras: [],
    ultimoNombre: null,
    activeShift: null,
    pendingRide: null,
  };
}

async function getTaxista(userId) {
  return normalizeTaxista((await storage.get(userId)) ?? defaultTaxista(userId), userId);
}

async function iniciarTurno(userId, options = {}) {
  return withTaxistaLock(userId, async () => {
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
  });
}

async function finalizarTurno(userId, options = {}) {
  return withTaxistaLock(userId, async () => {
    const taxista = await getTaxista(userId);
    if (!taxista.turnoActivo) return { ok: false, msg: 'No tienes ningun turno activo.' };

    const inicio = new Date(taxista.inicioTurno);
    const fin = new Date(options.endedAt ?? new Date().toISOString());

    const carrerasDelTurno = taxista.registrosCarreras.filter(
      ride => ride.shiftId === taxista.activeShift?.id,
    );

    const pendientesCaptura = carrerasDelTurno.filter(ride => !ride.screenshotUrl).length;

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
      registros: carrerasDelTurno,
    };

    taxista.registrosCarreras = taxista.registrosCarreras.filter(
      ride => ride.shiftId !== taxista.activeShift?.id,
    );

    taxista.historial.push(resumen);
    taxista.turnoActivo = false;
    taxista.inicioTurno = null;
    taxista.carreras = 0;
    taxista.encargos = 0;
    taxista.dineroTotal = 0;
    taxista.pendingRide = null;
    taxista.activeShift = null;

    await storage.set(userId, taxista);
    logger.info(
      `Turno finalizado | userId=${userId} | duracion=${resumen.duracion} | dineroTurno=${resumen.dineroTotal} | totalGanado=${taxista.totalGanado}`
    );
    return { ok: true, resumen, taxista };
  });
}

async function registrarCarrera(userId, rideInput) {
  return withTaxistaLock(userId, async () => {
    const taxista = await getTaxista(userId);
    if (!taxista.turnoActivo || !taxista.activeShift) {
      return { ok: false, msg: 'Debes iniciar tu turno primero.' };
    }

    const valor = Number(rideInput.valor);
    if (!Number.isInteger(valor) || valor <= 0) {
      return { ok: false, msg: 'El valor de la carrera debe ser un numero entero positivo.' };
    }

    // Validación: valor mínimo
    if (valor < config.carreraValorMin) {
      return {
        ok: false,
        msg: `El valor mínimo por carrera es $${config.carreraValorMin.toLocaleString()}.`,
      };
    }

    // Validación: valor máximo → requiere alerta a supervisores
    if (valor > config.carreraValorMax) {
      return {
        ok: false,
        msg: `El valor $${valor.toLocaleString()} supera el máximo permitido de $${config.carreraValorMax.toLocaleString()}. Contacta a un supervisor.`,
        code: 'VALOR_MAX',
        valor,
        limite: config.carreraValorMax,
        turnoId: taxista.activeShift?.id,
      };
    }

    // Validación: cooldown entre carreras
    if (config.carreraCooldownMs > 0) {
      const carrerasDelTurno = taxista.registrosCarreras.filter(r => r.shiftId === taxista.activeShift.id);
      if (carrerasDelTurno.length > 0) {
        const lastRide   = carrerasDelTurno[carrerasDelTurno.length - 1];
        const elapsed    = Date.now() - new Date(lastRide.createdAt).getTime();
        if (elapsed < config.carreraCooldownMs) {
          const segsRestantes = Math.ceil((config.carreraCooldownMs - elapsed) / 1000);
          return { ok: false, msg: `Debes esperar ${segsRestantes}s antes de registrar otra carrera.` };
        }
      }
    }

    // Validación: límite de carreras por turno → requiere alerta a supervisores
    if (taxista.carreras >= config.maxCarrerasPorTurno) {
      return {
        ok: false,
        msg: `Has alcanzado el límite de ${config.maxCarrerasPorTurno} carreras por turno. Contacta a un supervisor.`,
        code: 'MAX_CARRERAS',
        carreras: taxista.carreras,
        limite: config.maxCarrerasPorTurno,
        turnoId: taxista.activeShift?.id,
      };
    }

    const ride = {
      id: createRideId(userId),
      shiftId: taxista.activeShift.id,
      origin: rideInput.origin.trim(),
      destination: rideInput.destination.trim(),
      valor,
      createdAt: new Date(),
      screenshotUrl: rideInput.screenshotUrl ?? null,
      screenshotMessageId: rideInput.screenshotMessageId ?? null,
      channelId: rideInput.channelId ?? taxista.activeShift.channelId ?? null,
      createdBy: userId,
    };

    taxista.carreras += 1;
    taxista.totalCarreras += 1;
    taxista.dineroTotal += valor;
    taxista.totalGanado += valor;
    taxista.pendingRide = ride.screenshotUrl ? null : ride.id;
    taxista.registrosCarreras.push(ride);

    await storage.set(userId, taxista);
    logger.info(
      `Carrera registrada | userId=${userId} | rideId=${ride.id} | valor=${valor} | dineroTurno=${taxista.dineroTotal} | totalGanado=${taxista.totalGanado}`
    );
    return {
      ok: true,
      ride,
      carreras: taxista.carreras,
      dineroTotal: taxista.dineroTotal,
      totalGanado: taxista.totalGanado,
    };
  });
}

async function adjuntarScreenshot(userId, attachment) {
  return withTaxistaLock(userId, async () => {
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
  });
}

async function registrarEncargo(userId, dinero) {
  return withTaxistaLock(userId, async () => {
    const taxista = await getTaxista(userId);
    if (!taxista.turnoActivo) return { ok: false, msg: 'Debes iniciar tu turno primero.' };

    const valor = Number(dinero);
    if (!Number.isInteger(valor) || valor <= 0) {
      return { ok: false, msg: 'El valor del encargo debe ser un numero entero positivo.' };
    }

    taxista.encargos += 1;
    taxista.totalEncargos += 1;
    taxista.dineroTotal += valor;
    taxista.totalGanado += valor;

    await storage.set(userId, taxista);
    logger.info(
      `Encargo registrado | userId=${userId} | dinero=${valor} | dineroTurno=${taxista.dineroTotal} | totalGanado=${taxista.totalGanado}`
    );
    return {
      ok: true,
      encargos: taxista.encargos,
      dineroTotal: taxista.dineroTotal,
      totalGanado: taxista.totalGanado,
    };
  });
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

function normalizeTaxista(taxista, userId = taxista?.userId) {
  const normalized = {
    ...defaultTaxista(userId),
    ...taxista,
  };

  normalized.historial = Array.isArray(normalized.historial) ? normalized.historial : [];
  normalized.registrosCarreras = Array.isArray(normalized.registrosCarreras) ? normalized.registrosCarreras : [];
  normalized.totalCarreras = Number(normalized.totalCarreras ?? 0);
  normalized.totalEncargos = Number(normalized.totalEncargos ?? 0);
  normalized.totalGanado = Number(normalized.totalGanado ?? 0);

  if (normalized.totalCarreras === 0) {
    normalized.totalCarreras = _sumarHistorial(normalized, 'carreras') + Number(normalized.carreras ?? 0);
  }

  if (normalized.totalEncargos === 0) {
    normalized.totalEncargos = _sumarHistorial(normalized, 'encargos') + Number(normalized.encargos ?? 0);
  }

  if (normalized.totalGanado === 0) {
    normalized.totalGanado = _sumarHistorial(normalized, 'dineroTotal') + Number(normalized.dineroTotal ?? 0);
  }

  return normalized;
}

function _sumarHistorial(data, campo) {
  return (data.historial || []).reduce((acc, item) => acc + Number(item?.[campo] ?? 0), 0);
}

async function withTaxistaLock(userId, task) {
  const mutex = getTaxistaMutex(userId);
  return mutex.runExclusive(task);
}

function getTaxistaMutex(userId) {
  if (!taxistaLocks.has(userId)) {
    taxistaLocks.set(userId, new Mutex());
  }

  return taxistaLocks.get(userId);
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
