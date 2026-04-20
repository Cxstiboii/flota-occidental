const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { safeSend } = require('../utils/discordResponses');
const logger = require('../utils/logger');

const RANGOS = [
  { nombre: 'Taxista Elite',    minCarreras: 500, getRolId: () => config.rolTaxistaEliteId    },
  { nombre: 'Taxista Veterano', minCarreras: 200, getRolId: () => config.rolTaxistaVeteranoId },
  { nombre: 'Taxista Estable',  minCarreras: 75,  getRolId: () => config.rolTaxistaEstableId  },
  { nombre: 'Taxista Activo',   minCarreras: 20,  getRolId: () => config.rolTaxistaActivoId   },
  { nombre: 'Taxista Junior',   minCarreras: 1,   getRolId: () => config.rolTaxistaJuniorId   },
];

function getRangoObjetivo(totalCarreras) {
  return RANGOS.find(r => totalCarreras >= r.minCarreras) ?? null;
}

async function verificarYAscender(member, totalCarreras, client) {
  try {
    const rango = getRangoObjetivo(totalCarreras);
    if (!rango) return;

    const rolId = rango.getRolId();
    if (!rolId) {
      console.warn(`[Rangos] Rol para "${rango.nombre}" no configurado — omitiendo ascenso.`);
      return;
    }

    if (member.roles.cache.has(rolId)) return;

    // Quitar todos los roles de rango inferiores que tenga
    const rolesDeRango = RANGOS.map(r => r.getRolId()).filter(Boolean);
    for (const id of rolesDeRango) {
      if (id !== rolId && member.roles.cache.has(id)) {
        await member.roles.remove(id).catch(err =>
          logger.warn(`[Rangos] No se pudo quitar rol ${id} de ${member.id}: ${err.message}`)
        );
      }
    }

    await member.roles.add(rolId);

    if (!config.ascensosChannelId) return;
    const channel = await client.channels.fetch(config.ascensosChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('⭐ ASCENSO — Flota Occidental')
      .setDescription(`**${member.displayName}** ha alcanzado el rango **${rango.nombre}**`)
      .addFields(
        { name: 'Carreras totales', value: `${totalCarreras}`, inline: true },
        { name: 'Nuevo rango',      value: rango.nombre,       inline: true },
      )
      .setTimestamp();

    await safeSend(channel, { embeds: [embed] }, `rangos-ascenso userId=${member.id}`);
    logger.info(`[Rangos] ${member.displayName} ascendió a ${rango.nombre} (${totalCarreras} carreras)`);
  } catch (error) {
    logger.warn(`[Rangos] Error en verificarYAscender para ${member?.id}: ${error.message}`);
  }
}

module.exports = { verificarYAscender };
