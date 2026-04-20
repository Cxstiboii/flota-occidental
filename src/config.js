const toList = (value, fallback) => (value ?? fallback)
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

module.exports = {
  // IDs de roles principales (recomendado)
  roleTaxistaIds:    toList(process.env.ROLE_TAXISTA_ID,   ''),
  roleSupervisorIds: toList(process.env.ROLE_SUPERVISOR_ID, ''),
  roleDuenoIds:      toList(process.env.ROLE_DUENO_ID,     ''),

  // Nombres de roles (fallback si no se configuran IDs)
  roleTaxista:   toList(process.env.ROLE_TAXISTA,   'Taxista'),
  roleSupervisor: toList(process.env.ROLE_SUPERVISOR, 'Supervisor'),
  roleDueno:     toList(process.env.ROLE_DUENO,     'Dueño'),

  // Canales existentes
  taxiCategoryId:    process.env.TAXI_CATEGORY_ID         || null,
  taxiPanelChannelId: process.env.TAXI_PANEL_CHANNEL_ID   || null,
  auditChannelId:    process.env.TAXI_AUDIT_CHANNEL_ID    || null,
  shiftChannelPrefix: process.env.TAXI_SHIFT_CHANNEL_PREFIX || 'turno',

  // Nuevos — Canales
  alertasChannelId:  process.env.ALERTAS_CHANNEL_ID  || null,
  historialChannelId: process.env.HISTORIAL_CHANNEL_ID || null,
  ascensosChannelId: process.env.ASCENSOS_CHANNEL_ID  || null,

  // Nuevos — Roles automáticos
  rolEnTurnoId:         process.env.ROL_EN_TURNO_ID         || null,
  rolTaxistaJuniorId:   process.env.ROL_TAXISTA_JUNIOR_ID   || null,
  rolTaxistaActivoId:   process.env.ROL_TAXISTA_ACTIVO_ID   || null,
  rolTaxistaEstableId:  process.env.ROL_TAXISTA_ESTABLE_ID  || null,
  rolTaxistaVeteranoId: process.env.ROL_TAXISTA_VETERANO_ID || null,
  rolTaxistaEliteId:    process.env.ROL_TAXISTA_ELITE_ID    || null,

  // Nuevos — Límites anti-trampa (con valores por defecto seguros)
  carreraValorMin:     Number(process.env.CARRERA_VALOR_MIN)      || 50,
  carreraValorMax:     Number(process.env.CARRERA_VALOR_MAX)      || 5000,
  carreraCooldownMs:   Number(process.env.CARRERA_COOLDOWN_MS)    || 60000,
  maxCarrerasPorTurno: Number(process.env.MAX_CARRERAS_POR_TURNO) || 50,

  // Fase 3 — Automatización
  rankingChannelId:        process.env.RANKING_CHANNEL_ID      || null,
  estadisticasChannelId:   process.env.ESTADISTICAS_CHANNEL_ID || null,
  dashboardChannelId:      process.env.DASHBOARD_CHANNEL_ID    || null,

  // Sistema de solicitudes de empleo
  solicitudChannelId:        process.env.SOLICITUD_CHANNEL_ID         || null,
  solicitudMessageId:        process.env.SOLICITUD_MESSAGE_ID         || null,
  solicitudesCategoryId:     process.env.SOLICITUDES_CATEGORY_ID      || null,
  solicitudesStaffChannelId: process.env.SOLICITUDES_STAFF_CHANNEL_ID || null,
  rolPeriodoPruebaId:        process.env.ROL_PERIODO_PRUEBA_ID        || null,
  rolDireccionId:            process.env.ROL_DIRECCION_ID             || null,

  // Sistema de tickets de soporte
  ticketChannelId:       process.env.TICKET_CHANNEL_ID        || null,
  ticketPanelMessageId:  process.env.TICKET_PANEL_MESSAGE_ID  || null,
  ticketsCategoryId:     process.env.TICKETS_CATEGORY_ID      || null,
  ticketsStaffChannelId: process.env.TICKETS_STAFF_CHANNEL_ID || null,
};
