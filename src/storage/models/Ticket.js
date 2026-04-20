const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketId:            { type: String, required: true, unique: true },
  userId:              { type: String, required: true, index: true },
  guildId:             { type: String, required: true },
  categoria:           {
    type: String,
    required: true,
    enum: ['error_carrera', 'problema_bot', 'conflicto', 'revision_sancion', 'consulta'],
  },
  campos:              { type: mongoose.Schema.Types.Mixed, default: {} },
  estado:              {
    type: String,
    default: 'abierto',
    enum: ['abierto', 'resuelto', 'cerrado', 'escalado'],
  },
  channelId:           { type: String, default: null },
  embedMessageId:      { type: String, default: null },
  resolucion:          { type: String, default: null },
  motivoCierre:        { type: String, default: null },
  abiertoPor:          { type: String, default: null },
  cerradoPor:          { type: String, default: null },
  fechaAbierto:        { type: Date, default: Date.now },
  fechaCerrado:        { type: Date, default: null },
  ultimoTicketCerrado: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
