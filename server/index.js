require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught exception:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Unhandled rejection:', reason);
});

const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { URL } = require('url');

const connections = require('./state/connections');
const { handleMessage } = require('./ocpp/handler');
const { pendingCalls } = require('./ocpp/commands/sendCommand');
const supabase = require('./db/supabase');

const chargersRouter = require('./routes/chargers');
const sessionsRouter = require('./routes/sessions');
const logsRouter = require('./routes/logs');
const commandsRouter = require('./routes/commands');
const rfidRouter = require('./routes/rfid');
const meRouter = require('./routes/me');
const adminRouter = require('./routes/admin');
const notificationsRouter = require('./routes/notifications');
const chargeTrucksRouter = require('./routes/chargeTrucks');
const efSupervisorsRouter = require('./routes/efSupervisors');
const billingRouter = require('./routes/billing');
const { startWeeklyCron } = require('./routes/billing');
const issuesRouter = require('./routes/issues');
const exportRouter = require('./routes/export');
const vehiclesRouter = require('./routes/vehicles');

const PORT = process.env.PORT || 3000;
const HEARTBEAT_TIMEOUT_MS = 90 * 1000; // 90 seconds
const HEARTBEAT_CHECK_INTERVAL_MS = 30 * 1000; // check every 30 seconds

// --- Express app ---
const app = express();

// Explicit CORS — must come before all routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/chargers', chargersRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/commands', commandsRouter);
app.use('/api/rfid', rfidRouter);
app.use('/api/me', meRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/charge-trucks', chargeTrucksRouter);
app.use('/api/ef-supervisors', efSupervisorsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/export', exportRouter);
app.use('/api/vehicles', vehiclesRouter);

// --- HTTP server (shared between Express and WebSocket) ---
const server = http.createServer(app);

// --- OCPP WebSocket server ---
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // Expect path: /ocpp/:chargePointId
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const match = pathname.match(/^\/ocpp\/(.+)$/);

  if (!match) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  // OCPP 1.6 requires the server to echo back the Sec-WebSocket-Protocol header.
  // Inject it on the request so the ws library includes it in the handshake response.
  const requestedProtocols = req.headers['sec-websocket-protocol'];
  if (requestedProtocols && requestedProtocols.split(',').map((s) => s.trim()).includes('ocpp1.6')) {
    req.headers['sec-websocket-protocol'] = 'ocpp1.6';
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, match[1]);
  });
});

wss.on('connection', (ws, req, chargePointId) => {
  console.log(`[WS] Charger connected: ${chargePointId}`);
  connections.set(chargePointId, ws);

  ws.on('message', async (data) => {
    const raw = data.toString();
    console.log(`[WS] → ${chargePointId}: ${raw}`);
    await handleMessage(chargePointId, raw, ws, pendingCalls);
  });

  ws.on('close', async () => {
    console.log(`[WS] Charger disconnected: ${chargePointId}`);
    connections.delete(chargePointId);

    // Mark charger offline in DB
    const { error } = await supabase
      .from('chargers')
      .update({ status: 'offline' })
      .eq('charger_id', chargePointId);

    if (error) {
      console.error(`[WS] Failed to mark ${chargePointId} offline:`, error.message);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error from ${chargePointId}:`, err.message);
  });
});

// --- Heartbeat timeout checker ---
// Mark chargers offline if they haven't sent a heartbeat in 90 seconds
setInterval(async () => {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS).toISOString();

  const { error } = await supabase
    .from('chargers')
    .update({ status: 'offline' })
    .neq('status', 'offline')
    .lt('last_heartbeat', cutoff);

  if (error) {
    console.error('[Heartbeat check] DB error:', error.message);
  }
}, HEARTBEAT_CHECK_INTERVAL_MS);

// --- Start ---
server.listen(PORT, () => {
  console.log(`[Server] Primecom OCPP server running on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ocpp/:chargePointId`);
  console.log(`[Server] REST API: http://localhost:${PORT}/api`);
  startWeeklyCron();
});
