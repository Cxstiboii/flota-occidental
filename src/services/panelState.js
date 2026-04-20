let panelMessageId = process.env.TAXI_PANEL_MESSAGE_ID || null;

function getPanelMessageId() { return panelMessageId; }
function setPanelMessageId(id) { panelMessageId = id; }

module.exports = { getPanelMessageId, setPanelMessageId };
