const mongoose = require('mongoose');
const StorageAdapter = require('./StorageAdapter');
const Taxista = require('./models/Taxista');
const logger = require('../utils/logger');

function redactMongoUri(uri = '') {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[invalid mongodb uri]';
  }
}

function buildMongoConnectionHint(error, uri) {
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
  const code = error?.code;

  if (
    code === 8000 ||
    message.includes('bad auth') ||
    message.includes('authentication failed') ||
    message.includes('auth failed')
  ) {
    return 'Autenticacion rechazada por Atlas. Verifica usuario, password y si la password fue URL-encoded.';
  }

  if (
    message.includes('not allowed to access this mongodb atlas cluster') ||
    message.includes('ip address') ||
    message.includes('whitelist') ||
    message.includes('network access')
  ) {
    return 'Atlas esta rechazando la IP de origen. Agrega la IP en Network Access o usa 0.0.0.0/0 para Railway.';
  }

  if (
    message.includes('querysrv') ||
    message.includes('enotfound') ||
    message.includes('getaddrinfo') ||
    message.includes('dns')
  ) {
    return 'Fallo de DNS al resolver el cluster. Revisa el hostname del URI, tu red local y que el cluster siga activo.';
  }

  if (
    message.includes('server selection timed out') ||
    message.includes('connection timed out') ||
    code === 'ETIMEDOUT'
  ) {
    return 'Timeout al conectar con Atlas. Suele deberse a IP no autorizada, cluster pausado o bloqueo de red.';
  }

  if (
    message.includes('replicasetnoprimary') ||
    message.includes('no primary') ||
    message.includes('topology was destroyed')
  ) {
    return 'El cluster no tiene un nodo primario disponible. Revisa el estado del cluster en Atlas.';
  }

  if (!uri.includes('mongodb.net')) {
    return 'El URI no parece ser de MongoDB Atlas. Confirma que copiaste la cadena correcta desde Connect > Drivers.';
  }

  return 'Revisa URI, credenciales, Network Access, estado del cluster y conectividad DNS.';
}

// readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
const MONGO_CONNECTED    = 1;
const MONGO_CONNECTING   = 2;

class MongoStorage extends StorageAdapter {
  constructor() {
    super();
    this._connecting = null;
    this._listenersRegistered = false;
  }

  get _isConnected() {
    return mongoose.connection.readyState === MONGO_CONNECTED;
  }

  async connect() {
    if (this._isConnected) return mongoose.connection;

    // Si Mongoose ya está en proceso de conectar (otro call concurrente), esperar ese resultado
    if (this._connecting) return this._connecting;

    // Si Mongoose está conectando internamente (reconexión automática de Atlas), esperar
    if (mongoose.connection.readyState === MONGO_CONNECTING) {
      return new Promise((resolve, reject) => {
        mongoose.connection.once('connected', () => resolve(mongoose.connection));
        mongoose.connection.once('error', reject);
      });
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('Falta la variable MONGODB_URI en el archivo .env');
    }

    if (uri.includes('<') || uri.includes('>')) {
      throw new Error('MONGODB_URI contiene placeholders sin reemplazar. Quita los caracteres < > y pega la contraseña real.');
    }

    try {
      if (!this._listenersRegistered) {
        mongoose.connection.on('connected', () => {
          logger.info('Conexion de MongoDB establecida');
        });

        mongoose.connection.on('disconnected', () => {
          logger.warn('MongoDB se desconecto. Mongoose intentara reconectar automaticamente.');
        });

        mongoose.connection.on('reconnected', () => {
          logger.info('MongoDB reconectado exitosamente.');
        });

        mongoose.connection.on('error', (connectionError) => {
          logger.error(`Error de conexion MongoDB: ${connectionError.message}`);
        });

        this._listenersRegistered = true;
      }

      this._connecting = mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        appName: 'taxi-bot',
      });
      await this._connecting;
      logger.info(`Conectado a MongoDB Atlas (${mongoose.connection.name || 'sin-db'})`);
      return mongoose.connection;
    } catch (error) {
      const hint = buildMongoConnectionHint(error, uri);
      logger.error(`Error conectando a MongoDB: ${error.message}`);
      logger.error(`Diagnostico MongoDB: ${hint}`);
      logger.warn(`URI utilizada (redactada): ${redactMongoUri(uri)}`);
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
      totalCarreras:     Number(obj.totalCarreras ?? obj.carreras ?? 0),
      totalEncargos:     Number(obj.totalEncargos ?? obj.encargos ?? 0),
      totalGanado:       Number(obj.totalGanado ?? obj.dineroTotal ?? 0),
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
      { upsert: true, returnDocument: 'after' },
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
