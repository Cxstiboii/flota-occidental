const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
  userId:        { type: String, required: true },
  guildId:       { type: String, required: true },
  motivo:        { type: String, required: true },
  agregadoPor:   { type: String, required: true },
  fechaAgregado: { type: Date, default: Date.now },
}, { timestamps: true });

blacklistSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('Blacklist', blacklistSchema);
