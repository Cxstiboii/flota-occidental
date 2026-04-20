let ticketPanelMessageId = process.env.TICKET_PANEL_MESSAGE_ID || null;

function getTicketPanelMessageId() { return ticketPanelMessageId; }
function setTicketPanelMessageId(id) { ticketPanelMessageId = id; }

module.exports = { getTicketPanelMessageId, setTicketPanelMessageId };
