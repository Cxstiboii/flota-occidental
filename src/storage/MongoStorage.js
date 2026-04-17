const mongoose = require('mongoose');
const StorageAdapter = require('./StorageAdapter');
const Taxista = require('./models/Taxista');
const logger = require('../utils/logger');

class MongoStorage extends StorageAdapter {
  constructor() {
    super();
    this._connected = false;
    this._connecting = null;
  }

  async connect() {
    if (this._connected) return mongoose.connection;
    if (this._connecting) return this._connecting;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('Falta la variable MONGODB_URI en el archivo .env');
    }

    if (uri.includes('<') || uri.includes('>')) {
      throw new Error('MONGODB_URI contiene placeholders sin reemplazar. Quita los caracteres < > y pega la contraseña real.');
    }

    try {
      this._connecting = mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
      });
      await this._connecting;
      this._connected = true;
      logger.info('Conectado a MongoDB Atlas');
      return mongoose.connection;
    } catch (error) {
      logger.error(`Error conectando a MongoDB: ${error.message}`);
      throw error;
    } finally {
      this._connecting = null;
    }
  }

  _normalize(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    return {
      userId:            obj.userId,
      turnoActivo:       Boolean(obj.turnoActivo),
      inicioTurno:       obj.inicioTurno ?? null,
      carreras:          Number(obj.carreras ?? 0),
      encargos:          Number(obj.encargos ?? 0),
      dineroTotal:       Number(obj.dineroTotal ?? 0),
      historial:         Array.isArray(obj.historial) ? obj.historial : [],
      registrosCarreras: Array.isArray(obj.registrosCarreras) ? obj.registrosCarreras : [],
      ultimoNombre:      obj.ultimoNombre ?? null,
      activeShift:       obj.activeShift ?? null,
      pendingRide:       obj.pendingRide ?? null,
    };
  }

  async get(userId) {
    await this.connect();
    const doc = await Taxista.findOne({ userId });
    return this._normalize(doc);
  }

  async set(userId, userData) {
    await this.connect();
    await Taxista.findOneAndUpdate(
      { userId },
      { $set: userData },
      { upsert: true, new: true },
    );
  }

  async getAll() {
    await this.connect();
    const docs = await Taxista.find({});
    return Object.fromEntries(
      docs.map(doc => [doc.userId, this._normalize(doc)])
    );
  }

  async delete(userId) {
    await this.connect();
    await Taxista.deleteOne({ userId });
  }
}

module.exports = MongoStorage;
