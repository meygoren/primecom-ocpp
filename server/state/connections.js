// In-memory map of active WebSocket connections
// Key: chargePointId (string)
// Value: WebSocket instance
const connections = new Map();

module.exports = connections;
