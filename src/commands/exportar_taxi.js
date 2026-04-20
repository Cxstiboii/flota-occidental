const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { exportarDatos, getTaxistaDetalle } = require('../services/estadisticasService');
const { esDueno, esSupervisor } = require('../utils/permisos');
const { embedError, embedInfo } = require('../utils/embeds');
const { safeReply, safeDeferReply, safeEditReply } = require('../utils/discordResponses');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('exportar_taxi')
    .setDescription('Exporta la informacion recolectada por el bot')
    .addStringOption(option =>
      option.setName('alcance')
        .setDescription('Que parte de la informacion quieres exportar')
        .setRequired(true)
        .addChoices(
          { name: 'Todo', value: 'todo' },
          { name: 'Un taxista', value: 'taxista' },
        ),
    )
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Obligatorio cuando el alcance es un taxista')
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!esSupervisor(interaction.member)) {
      return safeReply(interaction, {
        embeds: [embedError('Solo Supervisores y Dueños pueden usar esta exportacion.')],
        flags: MessageFlags.Ephemeral,
      }, 'command=/exportar_taxi no-role');
    }

    const alcance = interaction.options.getString('alcance', true);
    const usuario = interaction.options.getUser('usuario');

    if (alcance === 'todo' && !esDueno(interaction.member)) {
      return safeReply(interaction, {
        embeds: [embedError('La exportacion completa esta reservada para Dueños.')],
        flags: MessageFlags.Ephemeral,
      }, 'command=/exportar_taxi forbidden-scope');
    }

    if (alcance === 'taxista' && !usuario) {
      return safeReply(interaction, {
        embeds: [embedError('Debes indicar un usuario para exportar un taxista.')],
        flags: MessageFlags.Ephemeral,
      }, 'command=/exportar_taxi missing-user');
    }

    await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral }, 'command=/exportar_taxi');

    const fechaHoy = formatFecha(new Date());

    if (alcance === 'todo') {
      const payload = await exportarDatos();

      const jsonAttachment = new AttachmentBuilder(
        Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
        { name: `flota_${fechaHoy}.json` },
      );

      const csvAttachment = new AttachmentBuilder(
        Buffer.from(generarCSVConsolidado(payload), 'utf-8'),
        { name: `flota_${fechaHoy}.csv` },
      );

      return safeEditReply(interaction, {
        embeds: [embedInfo('Exportacion lista', 'Se generaron los archivos de la flota completa.')],
        files: [jsonAttachment, csvAttachment],
      }, 'command=/exportar_taxi success-todo');
    }

    // Alcance: taxista individual
    const detalle = await getTaxistaDetalle(interaction.guild, usuario.id);
    if (!detalle) {
      return safeEditReply(interaction, {
        embeds: [embedError('Ese taxista aun no tiene informacion registrada.')],
      }, 'command=/exportar_taxi missing-data');
    }

    const username = usuario.username.replace(/[^a-z0-9_]/gi, '_');

    const jsonAttachment = new AttachmentBuilder(
      Buffer.from(JSON.stringify(detalle.raw, null, 2), 'utf-8'),
      { name: `${username}_${fechaHoy}.json` },
    );

    const csvAttachment = new AttachmentBuilder(
      Buffer.from(generarCSVTaxista(detalle.raw, detalle.nombre), 'utf-8'),
      { name: `${username}_${fechaHoy}.csv` },
    );

    return safeEditReply(interaction, {
      embeds: [embedInfo(
        'Exportacion lista',
        `Se generaron los archivos para **${detalle.nombre}**.`,
      )],
      files: [jsonAttachment, csvAttachment],
    }, 'command=/exportar_taxi success-taxista');
  },
};

// ─── Generadores CSV ──────────────────────────────────────────────────────────

function generarCSVTaxista(data, nombre) {
  const cabecera = 'Fecha,Inicio Turno,Fin Turno,Duración (min),Carreras,Encargos,Dinero Total,Pendientes Screenshot';
  const filas = (data.historial || []).map(turno => csvFilaTurno(turno));
  return [cabecera, ...filas].join('\n');
}

function generarCSVConsolidado(allData) {
  const cabecera = 'Taxista,UserId,Fecha,Inicio Turno,Fin Turno,Duración (min),Carreras,Encargos,Dinero Total,Pendientes Screenshot';
  const filas = [];

  for (const [userId, data] of Object.entries(allData)) {
    const nombre = data.ultimoNombre ?? userId;
    for (const turno of (data.historial || [])) {
      filas.push(`${escaparCSV(nombre)},${userId},${csvFilaTurno(turno)}`);
    }
  }

  return [cabecera, ...filas].join('\n');
}

function csvFilaTurno(turno) {
  const inicio       = new Date(turno.inicio);
  const fin          = new Date(turno.fin);
  const duracionMin  = isNaN(inicio) || isNaN(fin) ? '' : Math.round((fin - inicio) / 60_000);
  const fecha        = isNaN(inicio) ? '' : inicio.toISOString().split('T')[0];

  return [
    fecha,
    isNaN(inicio) ? '' : inicio.toISOString(),
    isNaN(fin)    ? '' : fin.toISOString(),
    duracionMin,
    turno.carreras         ?? 0,
    turno.encargos         ?? 0,
    turno.dineroTotal      ?? 0,
    turno.pendientesCaptura ?? 0,
  ].join(',');
}

function escaparCSV(valor) {
  const str = String(valor ?? '');
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

function formatFecha(date) {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}
