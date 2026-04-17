const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { embedInfo, embedOk } = require('../utils/embeds');

function buildTaxiPanelEmbed() {
  return embedInfo(
    'Panel de Flota Occidental',
    'Gestiona tu turno desde este panel. Inicia turno para abrir tu canal privado y registra cada carrera desde ahi con evidencia.',
    [
      { name: '1. Iniciar turno', value: 'Crea tu canal privado de trabajo.', inline: false },
      { name: '2. Registrar carrera', value: 'Usa el boton dentro de tu canal para abrir un formulario.', inline: false },
      { name: '3. Adjuntar screenshot', value: 'Sube la imagen en tu canal de turno y el bot la enlaza automaticamente.', inline: false },
      { name: '4. Finalizar turno', value: 'Cierra el canal y guarda el resumen completo.', inline: false },
    ],
  );
}

function buildTaxiPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('shift:start')
        .setLabel('Iniciar turno')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('shift:end')
        .setLabel('Finalizar turno')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('shift:status')
        .setLabel('Ver progreso')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildShiftChannelEmbed(memberDisplayName, shiftData) {
  return embedOk(
    `Canal de turno - ${memberDisplayName}`,
    'Registra cada carrera desde este canal para mantener el RP ordenado. Cuando mandes una imagen despues de registrar una carrera, el bot la anexara a la ultima pendiente.',
    [
      { name: 'Estado', value: shiftData.turnoActivo ? 'Activo' : 'Cerrado', inline: true },
      { name: 'Inicio', value: shiftData.inicioTurno ? `<t:${Math.floor(new Date(shiftData.inicioTurno).getTime() / 1000)}:F>` : 'N/D', inline: true },
      { name: 'Carreras', value: `${shiftData.carreras}`, inline: true },
      { name: 'Pendiente screenshot', value: shiftData.pendingRide ? 'Si' : 'No', inline: true },
      { name: 'Dinero acumulado', value: `$${Number(shiftData.dineroTotal).toLocaleString()}`, inline: true },
    ],
  );
}

function buildShiftChannelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ride:new')
        .setLabel('Registrar carrera')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('shift:status')
        .setLabel('Actualizar progreso')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('shift:end')
        .setLabel('Finalizar turno')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildShiftSummaryEmbed(memberDisplayName, resumen) {
  return embedInfo(
    `Resumen de turno - ${memberDisplayName}`,
    'Datos guardados correctamente.',
    [
      { name: 'Inicio', value: `<t:${Math.floor(new Date(resumen.inicio).getTime() / 1000)}:F>`, inline: true },
      { name: 'Fin', value: `<t:${Math.floor(new Date(resumen.fin).getTime() / 1000)}:F>`, inline: true },
      { name: 'Duracion', value: resumen.duracion, inline: true },
      { name: 'Carreras', value: `${resumen.carreras}`, inline: true },
      { name: 'Dinero', value: `$${Number(resumen.dineroTotal).toLocaleString()}`, inline: true },
      { name: 'Pendientes', value: `${resumen.pendientesCaptura ?? 0}`, inline: true },
    ],
  );
}

module.exports = {
  buildTaxiPanelEmbed,
  buildTaxiPanelRows,
  buildShiftChannelEmbed,
  buildShiftChannelRows,
  buildShiftSummaryEmbed,
};
