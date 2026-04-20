let solicitudMessageId = process.env.SOLICITUD_MESSAGE_ID || null;

function getSolicitudMessageId() { return solicitudMessageId; }
function setSolicitudMessageId(id) { solicitudMessageId = id; }

module.exports = { getSolicitudMessageId, setSolicitudMessageId };
