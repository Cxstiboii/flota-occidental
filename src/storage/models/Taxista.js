const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  id:                  { type: String, required: true },
  shiftId:             { type: String, required: true },
  origin:              { type: String, default: 'No especificado' },
  destination:         { type: String, default: 'No especificado' },
  valor:               { type: Number, required: true },
  createdAt:           { type: Date, default: Date.now },
  screenshotUrl:       { type: String, default: null },
  screenshotMessageId: { type: String, default: null },
  screenshotFilename:  { type: String, default: null },
  channelId:           { type: String, default: null },
  createdBy:           { type: String },
}, { _id: false });

const shiftSummarySchema = new mongoose.Schema({
  shiftId:          { type: String },
  inicio:           { type: String },
  fin:              { type: String },
  duracion:         { type: String },
  carreras:         { type: Number, default: 0 },
  encargos:         { type: Number, default: 0 },
  dineroTotal:      { type: Number, default: 0 },
  channelId:        { type: String, default: null },
  pendientesCaptura:{ type: Number, default: 0 },
  registros:        { type: [rideSchema], default: [] },
}, { _id: false });

const taxistaSchema = new mongoose.Schema({
  userId:           { type: String, required: true, unique: true, index: true },
  turnoActivo:      { type: Boolean, default: false },
  inicioTurno:      { type: String, default: null },
  carreras:         { type: Number, default: 0 },
  encargos:         { type: Number, default: 0 },
  dineroTotal:      { type: Number, default: 0 },
  totalCarreras:    { type: Number, default: 0 },
  totalEncargos:    { type: Number, default: 0 },
  totalGanado:      { type: Number, default: 0 },
  historial:        { type: [shiftSummarySchema], default: [] },
  registrosCarreras:{ type: [rideSchema], default: [] },
  ultimoNombre:     { type: String, default: null },
  activeShift:      { type: mongoose.Schema.Types.Mixed, default: null },
  pendingRide:      { type: String, default: null },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Taxista', taxistaSchema);
