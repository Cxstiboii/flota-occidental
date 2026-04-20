const { EmbedBuilder } = require('discord.js');

const COLOR_OK   = 0xF5C518; // amarillo taxi
const COLOR_ERR  = 0xFF4757;
const COLOR_INFO = 0x2ED573;
const FOOTER     = 'Flota Occidental';

function embedOk(title, desc, fields = []) {
  const e = new EmbedBuilder()
    .setColor(COLOR_OK)
    .setTitle(title)
    .setDescription(desc)
    .setTimestamp()
    .setFooter({ text: FOOTER });
  if (fields.length) e.addFields(fields);
  return e;
}

function embedError(msg) {
  return new EmbedBuilder()
    .setColor(COLOR_ERR)
    .setTitle('❌ Error')
    .setDescription(msg)
    .setTimestamp()
    .setFooter({ text: FOOTER });
}

function embedInfo(title, desc, fields = []) {
  const e = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(title)
    .setDescription(desc)
    .setTimestamp()
    .setFooter({ text: FOOTER });
  if (fields.length) e.addFields(fields);
  return e;
}

module.exports = { embedOk, embedError, embedInfo };
