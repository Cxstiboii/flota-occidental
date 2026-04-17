const toList = (value, fallback) => (value ?? fallback)
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

module.exports = {
  // IDs de roles (recomendado)
  roleTaxistaIds:   toList(process.env.ROLE_TAXISTA_ID,   ''),
  roleSupervisorIds: toList(process.env.ROLE_SUPERVISOR_ID, ''),
  roleDuenoIds:     toList(process.env.ROLE_DUENO_ID,     ''),

  // Nombres de roles (fallback si no se configuran IDs)
  roleTaxista:   toList(process.env.ROLE_TAXISTA,   'Taxista'),
  roleSupervisor: toList(process.env.ROLE_SUPERVISOR, 'Supervisor'),
  roleDueno:     toList(process.env.ROLE_DUENO,     'Dueño'),

  taxiCategoryId:    process.env.TAXI_CATEGORY_ID    || null,
  taxiPanelChannelId: process.env.TAXI_PANEL_CHANNEL_ID || null,
  auditChannelId: process.env.TAXI_AUDIT_CHANNEL_ID || null,
  shiftChannelPrefix: process.env.TAXI_SHIFT_CHANNEL_PREFIX || 'turno',
};
