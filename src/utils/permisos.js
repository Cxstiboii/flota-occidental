const config = require('../config');

function esTaxista(member) {
  return hasAnyRole(member, [...config.roleTaxista, ...config.roleSupervisor, ...config.roleDueno]);
}

function esSupervisor(member) {
  return hasAnyRole(member, [...config.roleSupervisor, ...config.roleDueno]);
}

function hasAnyRole(member, roleNames) {
  return member.roles.cache.some(role => roleNames.includes(role.name));
}

function getSupervisorRoles(guild) {
  const supervisorNames = [...config.roleSupervisor, ...config.roleDueno];
  return guild.roles.cache.filter(role => supervisorNames.includes(role.name)).map(role => role);
}

module.exports = { esTaxista, esSupervisor, getSupervisorRoles };
