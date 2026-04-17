const config = require('../config');

/**
 * Verifica permisos usando IDs si están configurados,
 * con fallback a nombres para compatibilidad hacia atrás.
 */
function hasAnyRole(member, roleIds, roleNames) {
  // Preferir IDs si están configurados
  if (roleIds && roleIds.length > 0 && roleIds.some(id => id !== '')) {
    return roleIds.some(id => member.roles.cache.has(id));
  }
  // Fallback a nombres
  return member.roles.cache.some(role => roleNames.includes(role.name));
}

/**
 * Taxistas, supervisores y dueños pueden usar comandos de taxista.
 */
function esTaxista(member) {
  return (
    hasAnyRole(member, config.roleTaxistaIds,   config.roleTaxista)   ||
    hasAnyRole(member, config.roleSupervisorIds, config.roleSupervisor) ||
    hasAnyRole(member, config.roleDuenoIds,      config.roleDueno)
  );
}

/**
 * Solo supervisores y dueños.
 */
function esSupervisor(member) {
  return (
    hasAnyRole(member, config.roleSupervisorIds, config.roleSupervisor) ||
    hasAnyRole(member, config.roleDuenoIds,      config.roleDueno)
  );
}

function esDueno(member) {
  return hasAnyRole(member, config.roleDuenoIds, config.roleDueno);
}

/**
 * Devuelve los objetos Role de supervisores y dueños en el servidor.
 * Usa IDs si están configurados, nombres como fallback.
 */
function getSupervisorRoles(guild) {
  const useIds = config.roleSupervisorIds.some(id => id !== '') ||
                 config.roleDuenoIds.some(id => id !== '');

  if (useIds) {
    const ids = [...config.roleSupervisorIds, ...config.roleDuenoIds].filter(id => id !== '');
    return guild.roles.cache.filter(role => ids.includes(role.id)).map(role => role);
  }

  const names = [...config.roleSupervisor, ...config.roleDueno];
  return guild.roles.cache.filter(role => names.includes(role.name)).map(role => role);
}

module.exports = { esTaxista, esSupervisor, esDueno, getSupervisorRoles };
