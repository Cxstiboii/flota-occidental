const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const {
  iniciarTurno,
  finalizarTurno,
  registrarCarrera,
  adjuntarScreenshot,
  getProgreso,
} = require('../services/turnoService');
const { buildRideModal } = require('../ui/modals');
const {
  buildShiftChannelEmbed,
  buildShiftChannelRows,
  buildShiftSummaryEmbed,
  buildTaxiPanelEmbed,
  buildTaxiPanelRows,
} = require('../ui/panelView');
const { embedError, embedInfo, embedOk } = require('../utils/embeds');
const { esTaxista, getSupervisorRoles } = require('../utils/permisos');
const logger = require('../utils/logger');

async function handleButton(interaction) {
  switch (interaction.customId) {
    case 'shift:start':
      return startShiftFlow(interaction);
    case 'shift:end':
      return endShiftFlow(interaction);
    case 'shift:status':
      return showShiftStatusFlow(interaction);
    case 'ride:new':
      return handleNewRideButton(interaction);
    default:
      return false;
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'ride:create') return false;

  if (!esTaxista(interaction.member)) {
    await interaction.reply({ embeds: [embedError('No tienes permisos para registrar carreras.')], ephemeral: true });
    return true;
  }

  const origin = interaction.fields.getTextInputValue('origin').trim();
  const destination = interaction.fields.getTextInputValue('destination').trim();
  const rawFare = interaction.fields.getTextInputValue('fare').trim();

  if (!origin || !destination) {
    await interaction.reply({ embeds: [embedError('Origen y destino son obligatorios.')], ephemeral: true });
    return true;
  }

  if (!/^\d+$/.test(rawFare)) {
    await interaction.reply({ embeds: [embedError('El valor debe contener solo numeros enteros.')], ephemeral: true });
    return true;
  }

  const result = await registrarCarrera(interaction.user.id, {
    origin,
    destination,
    valor: Number(rawFare),
    channelId: interaction.channelId,
  });

  if (!result.ok) {
    await interaction.reply({ embeds: [embedError(result.msg)], ephemeral: true });
    return true;
  }

  await interaction.reply({
    embeds: [embedOk(
      'Carrera registrada',
      'Ahora envia la screenshot en este canal y quedara asociada automaticamente a esta carrera.',
      [
        { name: 'Origen', value: origin, inline: true },
        { name: 'Destino', value: destination, inline: true },
        { name: 'Valor', value: `$${Number(rawFare).toLocaleString()}`, inline: true },
      ],
    )],
  });

  return true;
}

async function handleMessage(message) {
  if (message.author.bot || !message.guild || message.attachments.size === 0) return false;

  const progress = await getProgreso(message.author.id);
  if (!progress.turnoActivo || !progress.pendingRide) return false;
  if (progress.activeShift?.channelId && progress.activeShift.channelId !== message.channelId) return false;

  const attachment = message.attachments.find(file => file.contentType?.startsWith('image/')) ?? message.attachments.first();
  if (!attachment) return false;

  const result = await adjuntarScreenshot(message.author.id, {
    url: attachment.url,
    filename: attachment.name,
    messageId: message.id,
  });

  if (!result.ok) {
    await message.reply({ embeds: [embedError(result.msg)] });
    return true;
  }

  await message.reply({
    embeds: [embedInfo(
      'Screenshot vinculada',
      'La evidencia quedo enlazada a tu ultima carrera.',
      [
        { name: 'Origen', value: result.ride.origin, inline: true },
        { name: 'Destino', value: result.ride.destination, inline: true },
        { name: 'Valor', value: `$${result.ride.valor.toLocaleString()}`, inline: true },
      ],
    )],
  });

  return true;
}

async function publishPanel(interaction) {
  await interaction.reply({
    embeds: [buildTaxiPanelEmbed()],
    components: buildTaxiPanelRows(),
  });
}

async function startShiftFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({ embeds: [embedError('No tienes el rol necesario para usar este panel.')], ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const existing = await getProgreso(interaction.user.id);
  if (existing.turnoActivo) {
    const channelText = existing.activeShift?.channelId ? `<#${existing.activeShift.channelId}>` : 'tu canal actual';
    await interaction.editReply({ embeds: [embedError(`Ya tienes un turno activo. Continua en ${channelText}.`)] });
    return true;
  }

  const shiftChannel = await createShiftChannel(interaction);
  const result = await iniciarTurno(interaction.user.id, {
    displayName: interaction.member.displayName,
    channelId: shiftChannel.id,
  });

  if (!result.ok) {
    await interaction.editReply({ embeds: [embedError(result.msg)] });
    return true;
  }

  await shiftChannel.send({
    content: `${interaction.user}`,
    embeds: [buildShiftChannelEmbed(interaction.member.displayName, result.taxista)],
    components: buildShiftChannelRows(),
  });

  await interaction.editReply({
    embeds: [embedOk(
      'Turno iniciado',
      `Tu canal privado de trabajo esta listo en ${shiftChannel}.`,
      [{ name: 'Siguiente paso', value: 'Usa el boton "Registrar carrera" dentro del canal.', inline: false }],
    )],
  });

  return true;
}

async function endShiftFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({ embeds: [embedError('No tienes el rol necesario para usar este panel.')], ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const progress = await getProgreso(interaction.user.id);
  const result = await finalizarTurno(interaction.user.id);

  if (!result.ok) {
    await interaction.editReply({ embeds: [embedError(result.msg)] });
    return true;
  }

  if (progress.activeShift?.channelId) {
    try {
      const shiftChannel = await interaction.guild.channels.fetch(progress.activeShift.channelId);
      if (shiftChannel) {
        await shiftChannel.send({
          embeds: [buildShiftSummaryEmbed(interaction.member.displayName, result.resumen)],
        });
        await shiftChannel.setName(`cerrado-${shiftChannel.name}`.slice(0, 100));
        await shiftChannel.permissionOverwrites.edit(interaction.user.id, {
          SendMessages: false,
          AttachFiles: false,
        });
      }
    } catch (error) {
      logger.warn(`No se pudo cerrar el canal de turno ${progress.activeShift.channelId}: ${error.message}`);
    }
  }

  await interaction.editReply({
    embeds: [buildShiftSummaryEmbed(interaction.member.displayName, result.resumen)],
  });
  return true;
}

async function showShiftStatusFlow(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({ embeds: [embedError('No tienes el rol necesario para usar este panel.')], ephemeral: true });
    return true;
  }

  const progress = await getProgreso(interaction.user.id);
  const estado = progress.turnoActivo ? 'Activo' : 'Sin turno';
  const startedAt = progress.inicioTurno
    ? `<t:${Math.floor(new Date(progress.inicioTurno).getTime() / 1000)}:R>`
    : 'N/D';

  await interaction.reply({
    embeds: [embedInfo(
      `Estado de turno - ${interaction.member.displayName}`,
      'Resumen rapido de tu jornada actual.',
      [
        { name: 'Estado', value: estado, inline: true },
        { name: 'Inicio', value: startedAt, inline: true },
        { name: 'Carreras', value: `${progress.carreras}`, inline: true },
        { name: 'Dinero', value: `$${Number(progress.dineroTotal).toLocaleString()}`, inline: true },
        { name: 'Canal', value: progress.activeShift?.channelId ? `<#${progress.activeShift.channelId}>` : 'N/D', inline: true },
        { name: 'Pendiente screenshot', value: progress.pendingRide ? 'Si' : 'No', inline: true },
      ],
    )],
    ephemeral: true,
  });
  return true;
}

async function handleNewRideButton(interaction) {
  if (!esTaxista(interaction.member)) {
    await interaction.reply({ embeds: [embedError('No tienes permisos para registrar carreras.')], ephemeral: true });
    return true;
  }

  const progress = await getProgreso(interaction.user.id);
  if (!progress.turnoActivo) {
    await interaction.reply({ embeds: [embedError('Debes iniciar un turno antes de registrar carreras.')], ephemeral: true });
    return true;
  }

  if (progress.activeShift?.channelId && progress.activeShift.channelId !== interaction.channelId) {
    await interaction.reply({
      embeds: [embedError(`Registra tus carreras solo dentro de <#${progress.activeShift.channelId}>.`)],
      ephemeral: true,
    });
    return true;
  }

  if (progress.pendingRide) {
    await interaction.reply({
      embeds: [embedError('Tienes una carrera pendiente de screenshot. Adjunta la imagen antes de registrar otra.')],
      ephemeral: true,
    });
    return true;
  }

  await interaction.showModal(buildRideModal());
  return true;
}

async function createShiftChannel(interaction) {
  const guild = interaction.guild;
  const roleOverwrites = getSupervisorRoles(guild).map(role => ({
    id: role.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
    ],
  }));

  return guild.channels.create({
    name: `${config.shiftChannelPrefix}-${sanitizeChannelName(interaction.member.displayName)}`.slice(0, 100),
    type: ChannelType.GuildText,
    parent: config.taxiCategoryId ?? undefined,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      ...roleOverwrites,
    ],
    topic: `Canal privado de turno para ${interaction.user.tag} (${interaction.user.id})`,
  });
}

function sanitizeChannelName(input) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'taxista';
}

module.exports = {
  handleButton,
  handleModalSubmit,
  handleMessage,
  publishPanel,
  startShiftFlow,
  endShiftFlow,
  showShiftStatusFlow,
};
