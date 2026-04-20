const mongoose = require('mongoose');

const citaSchema = new mongoose.Schema({
  fechaHora:     { type: String },
  lugar:         { type: String },
  entrevistador: { type: String },
  agendadoPor:   { type: String },
}, { _id: false });

const solicitudSchema = new mongoose.Schema({
  solicitudId:     { type: String, required: true, unique: true, index: true },
  userId:          { type: String, required: true, index: true },
  guildId:         { type: String, required: true },
  nombrePersonaje: { type: String, required: true },
  nombreServidor:  { type: String },
  tiempoCiudad:    { type: String, required: true },
  conducta:        { type: String, required: true },
  motivacion:      { type: String, required: true },
  estado: {
    type:    String,
    enum:    ['pendiente', 'aprobado', 'rechazado', 'cita_agendada'],
    default: 'pendiente',
  },
  ticketChannelId: { type: String },
  embedMessageId:  { type: String },
  cita:            { type: citaSchema },
  motivoRechazo:   { type: String },
  fechaSolicitud:  { type: Date, default: Date.now },
  fechaRechazo:    { type: Date },
  fechaAprobacion: { type: Date },
  procesadoPor:    { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Solicitud', solicitudSchema);
