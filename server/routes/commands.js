const express = require('express');
const router = express.Router();
const connections = require('../state/connections');
const remoteStartTransaction = require('../ocpp/commands/remoteStartTransaction');
const remoteStopTransaction = require('../ocpp/commands/remoteStopTransaction');
const reset = require('../ocpp/commands/reset');
const updateFirmware = require('../ocpp/commands/updateFirmware');
const getConfiguration = require('../ocpp/commands/getConfiguration');
const changeConfiguration = require('../ocpp/commands/changeConfiguration');
const getDiagnostics = require('../ocpp/commands/getDiagnostics');
const unlockConnector = require('../ocpp/commands/unlockConnector');
const clearCache = require('../ocpp/commands/clearCache');
const setChargingProfile = require('../ocpp/commands/setChargingProfile');

function requireConnected(req, res, next) {
  const { id } = req.params;
  if (!connections.has(id)) {
    return res.status(503).json({ error: `Charger ${id} is not currently connected` });
  }
  next();
}

// POST /api/commands/:id/remote-start
router.post('/:id/remote-start', requireConnected, async (req, res) => {
  const { connectorId, idTag } = req.body;
  try {
    const result = await remoteStartTransaction(req.params.id, connectorId, idTag);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/remote-stop
router.post('/:id/remote-stop', requireConnected, async (req, res) => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }
  try {
    const result = await remoteStopTransaction(req.params.id, transactionId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/reset
router.post('/:id/reset', requireConnected, async (req, res) => {
  const { type = 'Soft' } = req.body;
  try {
    const result = await reset(req.params.id, type);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/update-firmware
router.post('/:id/update-firmware', requireConnected, async (req, res) => {
  const { location, retrieveDate } = req.body;
  if (!location) {
    return res.status(400).json({ error: 'location (firmware URL) is required' });
  }
  try {
    const result = await updateFirmware(req.params.id, location, retrieveDate);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/get-configuration
router.post('/:id/get-configuration', requireConnected, async (req, res) => {
  const { keys } = req.body;
  try {
    const result = await getConfiguration(req.params.id, keys);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/change-configuration
router.post('/:id/change-configuration', requireConnected, async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'key and value are required' });
  }
  try {
    const result = await changeConfiguration(req.params.id, key, value);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/get-diagnostics
router.post('/:id/get-diagnostics', requireConnected, async (req, res) => {
  const { location } = req.body;
  if (!location) {
    return res.status(400).json({ error: 'location (upload URL) is required' });
  }
  try {
    const result = await getDiagnostics(req.params.id, location);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/unlock-connector
router.post('/:id/unlock-connector', requireConnected, async (req, res) => {
  const { connectorId = 1 } = req.body;
  try {
    const result = await unlockConnector(req.params.id, connectorId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/clear-cache
router.post('/:id/clear-cache', requireConnected, async (req, res) => {
  try {
    const result = await clearCache(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/set-charging-profile — cap output power in kW,
// total (connectorId 0) or per connector
router.post('/:id/set-charging-profile', requireConnected, async (req, res) => {
  const { connectorId = 0, limitKw } = req.body;
  const kw = parseFloat(limitKw);
  if (!limitKw || isNaN(kw) || kw <= 0) {
    return res.status(400).json({ error: 'limitKw is required and must be a positive number' });
  }
  try {
    const result = await setChargingProfile(req.params.id, parseInt(connectorId), Math.round(kw * 1000));
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commands/:id/transfer-vin — DataTransfer to request vehicle VIN from charger
router.post('/:id/transfer-vin', requireConnected, async (req, res) => {
  const { sendCommand } = require('../ocpp/commands/sendCommand');
  try {
    const result = await sendCommand(req.params.id, 'DataTransfer', {
      vendorId: 'Primecom',
      messageId: 'GetVIN',
      data: '',
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
