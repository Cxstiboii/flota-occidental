const fs = require('fs');
const path = require('path');
const StorageAdapter = require('./StorageAdapter');

const DATA_PATH = path.join(__dirname, 'data', 'taxistas.json');

class JsonStorage extends StorageAdapter {
  constructor() {
    super();
    this._ensureFile();
  }

  _ensureFile() {
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(DATA_PATH, JSON.stringify(this._defaultState(), null, 2), 'utf-8');
    }
  }

  _defaultState() {
    return {
      users: {},
      metadata: {
        version: 2,
        updatedAt: new Date(0).toISOString(),
      },
    };
  }

  _normalizeUser(userId, userData = {}) {
    return {
      userId,
      turnoActivo: Boolean(userData.turnoActivo),
      inicioTurno: userData.inicioTurno ?? null,
      carreras: Number(userData.carreras ?? 0),
      encargos: Number(userData.encargos ?? 0),
      dineroTotal: Number(userData.dineroTotal ?? 0),
      historial: Array.isArray(userData.historial) ? userData.historial : [],
      registrosCarreras: Array.isArray(userData.registrosCarreras) ? userData.registrosCarreras : [],
      ultimoNombre: userData.ultimoNombre ?? null,
      activeShift: userData.activeShift ?? null,
      pendingRide: userData.pendingRide ?? null,
    };
  }

  _readState() {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      if (raw && raw.users) {
        return {
          metadata: {
            version: Number(raw.metadata?.version ?? 2),
            updatedAt: raw.metadata?.updatedAt ?? new Date().toISOString(),
          },
          users: raw.users,
        };
      }

      return {
        metadata: {
          version: 2,
          updatedAt: new Date().toISOString(),
        },
        users: raw ?? {},
      };
    } catch {
      return this._defaultState();
    }
  }

  _writeState(state) {
    const payload = {
      metadata: {
        version: 2,
        updatedAt: new Date().toISOString(),
      },
      users: state.users ?? {},
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  }

  async get(userId) {
    const state = this._readState();
    const user = state.users[userId];
    return user ? this._normalizeUser(userId, user) : null;
  }

  async set(userId, userData) {
    const state = this._readState();
    state.users[userId] = this._normalizeUser(userId, userData);
    this._writeState(state);
  }

  async getAll() {
    const state = this._readState();
    return Object.fromEntries(
      Object.entries(state.users).map(([userId, userData]) => [userId, this._normalizeUser(userId, userData)]),
    );
  }

  async delete(userId) {
    const state = this._readState();
    delete state.users[userId];
    this._writeState(state);
  }
}

module.exports = JsonStorage;
