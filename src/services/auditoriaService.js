const config = require('../config');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

// ─── Canal de AUDITORÍA: recibe TODOS los eventos ────────────────────────────

async function auditShiftStarted(interaction, shiftChannel, taxista) {
  return sendAuditEmbed(interaction.guild, {
    embeds: [buildAuditEmbed({
      color: 0xF5C518,
      title: 'Turno iniciado',
      description: `${interaction.user} inicio su turno de trabajo.`,
      member: interaction.member,
      fields: [
        { name: 'Taxista', value: `${interaction.member.displayName} (${interaction.user.id})`, inline: false },
        { name: 'Canal',   value: `<#${shiftChannel.id}>`, inline: true },
        { name: 'Inicio',  value: `<t:${Math.floor(new Date(taxista.inicioTurno).getTime() / 1000)}:F>`, inline: true },
        { name: 'Estado',  value: 'Operativo', inline: true },
      ],
    })],
  });
}

async function auditRideCreated(interaction, ride, totals) {
  return sendAuditEmbed(interaction.guild, {
    embeds: [buildAuditEmbed({
      color: 0x2ED573,
      title: 'Carrera registrada',
      description: `${interaction.user} registro una nueva carrera.`,
      member: interaction.member,
      fields: [
        { name: 'Taxista',            value: `${interaction.member.displayName} (${interaction.user.id})`, inline: false },
        { name: 'Origen',             value: ride.origin, inline: true },
        { name: 'Destino',            value: ride.destination, inline: true },
        { name: 'Valor',              value: `$${Number(ride.valor).toLocaleString()}`, inline: true },
        { name: 'Canal',              value: ride.channelId ? `<#${ride.channelId}>` : 'N/D', inline: true },
        { name: 'Total carreras turno', value: `${totals.carreras}`, inline: true },
        { name: 'Acumulado turno',    value: `$${Number(totals.dineroTotal).toLocaleString()}`, inline: true },
      ],
    })],
  });
}

async function auditScreenshotAttached(message, ride) {
  return sendAuditEmbed(message.guild, {
    embeds: [buildAuditEmbed({
      color: 0x1E90FF,
      title: 'Screenshot vinculada',
      description: `${message.author} adjunto evidencia a una carrera.`,
      member: message.member,
      fields: [
        { name: 'Taxista',    value: `${message.member?.displayName ?? message.author.username} (${message.author.id})`, inline: false },
        { name: 'Origen',     value: ride.origin, inline: true },
        { name: 'Destino',    value: ride.destination, inline: true },
        { name: 'Valor',      value: `$${Number(ride.valor).toLocaleString()}`, inline: true },
        { name: 'Canal',      value: ride.channelId ? `<#${ride.channelId}>` : `<#${message.channelId}>`, inline: true },
        { name: 'Screenshot', value: ride.screenshotUrl ?? 'N/D', inline: false },
      ],
    })],
  });
}

async function auditShiftEnded(interaction, resumen, channelId) {
  const critical = Number(resumen.pendientesCaptura ?? 0) > 0;
  return sendAuditEmbed(interaction.guild, {
    embeds: [buildAuditEmbed({
      color: critical ? 0xFF4757 : 0x5865F2,
      title: critical ? 'Turno finalizado con alertas' : 'Turno finalizado',
      description: `${interaction.user} cerro su turno.`,
      member: interaction.member,
      fields: [
        { name: 'Taxista',              value: `${interaction.member.displayName} (${interaction.user.id})`, inline: false },
        { name: 'Inicio',               value: `<t:${Math.floor(new Date(resumen.inicio).getTime() / 1000)}:F>`, inline: true },
        { name: 'Fin',                  value: `<t:${Math.floor(new Date(resumen.fin).getTime() / 1000)}:F>`, inline: true },
        { name: 'Duracion',             value: resumen.duracion, inline: true },
        { name: 'Carreras',             value: `${resumen.carreras}`, inline: true },
        { name: 'Encargos',             value: `${resumen.encargos}`, inline: true },
        { name: 'Dinero',               value: `$${Number(resumen.dineroTotal).toLocaleString()}`, inline: true },
        { name: 'Pendientes screenshot', value: `${resumen.pendientesCaptura ?? 0}`, inline: true },
        { name: 'Canal cerrado',        value: channelId ? `<#${channelId}>` : 'N/D', inline: true },
      ],
      footer: critical ? 'Revisar pendientes de evidencia' : 'Cierre de turno correcto',
    })],
  });
}

// ─── Canal de ALERTAS: solo eventos críticos con @Supervisores ────────────────

async function alertShiftEndedPendientes(client, resumen, member) {
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🚨 Turno finalizado con carreras sin screenshot')
    .setDescription(`El taxista **${member.displayName}** cerró su turno con evidencias pendientes.`)
    .addFields(
      { name: 'Taxista',               value: `${member.displayName} (${member.id})`, inline: true },
      { name: 'Pendientes screenshot', value: `${resumen.pendientesCaptura}`, inline: true },
      { name: 'Carreras del turno',    value: `${resumen.carreras}`, inline: true },
      { name: 'Dinero registrado',     value: `$${Number(resumen.dineroTotal).toLocaleString()}`, inline: true },
      { name: 'ID de turno',           value: resumen.shiftId ?? 'N/D', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Acción requerida — revisar evidencias' });

  return sendAlertEmbed(client, {
    content: buildCriticalMention(),
    embeds: [embed],
  });
}

async function alertCarreraFueraDeRango(client, guild, member, { valor, limite, turnoId }) {
  const embed = new EmbedBuilder()
    .setColor(0xFF6B00)
    .setTitle('⚠️ Carrera con valor fuera de rango')
    .setDescription(`El taxista **${member.displayName}** intentó registrar un valor superior al límite permitido.`)
    .addFields(
      { name: 'Taxista',         value: `${member.displayName} (${member.id})`, inline: true },
      { name: 'Valor intentado', value: `$${Number(valor).toLocaleString()}`,   inline: true },
      { name: 'Límite máximo',   value: `$${Number(limite).toLocaleString()}`,  inline: true },
      { name: 'ID de turno',     value: turnoId ?? 'N/D', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Acción requerida — verificar valor de carrera' });

  return sendAlertEmbed(client, {
    content: buildCriticalMention(),
    embeds: [embed],
  });
}

async function alertMaxCarrerasAlcanzado(client, guild, member, { carreras, limite, turnoId }) {
  const embed = new EmbedBuilder()
    .setColor(0xFF6B00)
    .setTitle('⚠️ Límite de carreras por turno alcanzado')
    .setDescription(`El taxista **${member.displayName}** alcanzó el máximo de carreras permitidas en un turno.`)
    .addFields(
      { name: 'Taxista',          value: `${member.displayName} (${member.id})`, inline: true },
      { name: 'Carreras en turno', value: `${carreras}`, inline: true },
      { name: 'Límite configurado', value: `${limite}`, inline: true },
      { name: 'ID de turno',       value: turnoId ?? 'N/D', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Acción requerida — revisar turno activo' });

  return sendAlertEmbed(client, {
    content: buildCriticalMention(),
    embeds: [embed],
  });
}

async function alertOrphanChannels(client, count) {
  const embed = new EmbedBuilder()
    .setColor(0xFF6B00)
    .setTitle('⚠️ Canales de turno huérfanos detectados al reiniciar')
    .setDescription(`El bot detectó **${count}** canal(es) de turno que fueron eliminados mientras el bot estaba offline. Las referencias han sido limpiadas — los taxistas afectados pueden finalizar su turno desde el panel principal.`)
    .addFields(
      { name: 'Canales limpiados', value: `${count}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Verificar si los turnos afectados cerraron correctamente' });

  return sendAlertEmbed(client, {
    content: buildCriticalMention(),
    embeds: [embed],
  });
}

// ─── Internos ─────────────────────────────────────────────────────────────────

async function sendAuditEmbed(guild, payload) {
  if (!config.auditChannelId || !guild) return false;

  try {
    const channel = await guild.channels.fetch(config.auditChannelId);
    if (!channel || !channel.isTextBased()) {
      logger.warn(`Canal de auditoria invalido o no accesible: ${config.auditChannelId}`);
      return false;
    }
    await channel.send(payload);
    return true;
  } catch (error) {
    logger.warn(`No se pudo enviar al canal de auditoria ${config.auditChannelId}: ${error.message}`);
    return false;
  }
}

async function sendAlertEmbed(client, payload) {
  if (!config.alertasChannelId) return false;

  try {
    const channel = await client.channels.fetch(config.alertasChannelId);
    if (!channel || !channel.isTextBased()) {
      logger.warn(`Canal de alertas invalido o no accesible: ${config.alertasChannelId}`);
      return false;
    }
    await channel.send(payload);
    return true;
  } catch (error) {
    logger.warn(`No se pudo enviar al canal de alertas ${config.alertasChannelId}: ${error.message}`);
    return false;
  }
}

function buildAuditEmbed({ color, title, description, member, fields, footer }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Auditoria | ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: footer || 'Flota Occidental - Auditoria' });

  if (member) {
    embed.setAuthor({
      name: member.displayName,
      iconURL: member.displayAvatarURL?.() || member.user?.displayAvatarURL?.(),
    });
  }

  if (fields?.length) embed.addFields(fields);

  return embed;
}

function buildCriticalMention() {
  const roleIds = [...config.roleDuenoIds, ...config.roleSupervisorIds].filter(Boolean);
  if (roleIds.length === 0) return undefined;
  return roleIds.map(id => `<@&${id}>`).join(' ');
}

module.exports = {
  auditShiftStarted,
  auditRideCreated,
  auditScreenshotAttached,
  auditShiftEnded,
  alertShiftEndedPendientes,
  alertCarreraFueraDeRango,
  alertMaxCarrerasAlcanzado,
  alertOrphanChannels,
  sendAuditEmbed,
};
