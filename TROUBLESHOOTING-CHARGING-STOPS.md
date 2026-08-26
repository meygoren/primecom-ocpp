# Charger starts a session then stops within seconds (OCPP connected)

Symptom: the charger charges normally with no OCPP URL configured, but as soon
as it is pointed at the Central System it starts a session and stops it a few
seconds later.

When that happens, the charger — not the server — is ending the session. There
are only a few reasons a charger does that, and all of them are visible in the
logs.

## 1. Read the stop reason first

Open the Logs page (or the Railway server logs) and find the `StopTransaction`
that follows the `StartTransaction`. The `reason` field names the cause:

| reason | What it means | Fix |
|---|---|---|
| `DeAuthorized` | The server answered `Authorize` or `StartTransaction` with something other than `Accepted` | See section 2 |
| `Local` / `EVDisconnected` | The charger or the vehicle ended it — not an OCPP problem | Check the cable/vehicle |
| `Other`, `PowerLoss`, `Reboot` | Charger-side fault | Check charger logs / firmware |
| no reason, right after start | The charger never got its `StartTransaction` reply in time | See section 3 |

The server now prints these lines for every session, so they are easy to find:

```
[StartTransaction] PC-UNIT-001 connector 1 idTag "04A3BF12" meterStart 0 → transactionId 42 (Accepted)
[StopTransaction]  PC-UNIT-001 transaction 42 stopped — reason "DeAuthorized" meterStop 0 idTag "04A3BF12"
[StopTransaction]  PC-UNIT-001 transaction 42 lasted only 6s (reason "DeAuthorized"). ...
```

## 2. RFID authorization

The RFID list works in two modes:

- **Empty list → open mode.** Every tag is accepted. This matches how the
  charger behaves with no OCPP URL.
- **Any tags in the list → only those tags are accepted.** A tag that is not
  listed gets `Invalid`, and the charger stops the session it just started.

Tag matching ignores case, spaces and `:`/`-` separators, so `04:a3:bf:12` and
`04A3BF12` are the same tag. Whatever the charger sends as `idTag` is what must
be listed — read it off the `Authorize` entry in the Logs page, not off the
card.

A rejected tag is logged loudly:

```
[Authorize] PC-UNIT-001 tag "04A3BF12" REJECTED — not in the 3 configured RFID tags. ...
```

To run open again, delete every tag on the RFID page.

## 3. Slow replies

A charger only waits a limited time for `StartTransaction.conf`. If it does not
arrive, the charger tears the session down. The server therefore replies to
every charger message before writing anything to the database; all database
work happens after the reply is on the wire. Nothing in the reply path should
ever `await` Supabase.

## 4. Auto-start

If **Auto Start** is enabled for a charger, the server sends
`RemoteStartTransaction` two seconds after the connector reports `Preparing`.
If the charger already started a session on its own in that gap, a remote start
aimed at a busy connector makes some firmware drop the running session. The
server now skips the auto-start when a session is already open on that charger.

If a charger misbehaves while testing, turn Auto Start and Auto Transfer VIN off
for it and retest — that isolates server-initiated commands from the problem.

## 5. `DCStartFailed` — the session opens but no power flows

On a DC unit the log looks like this (real example, R3243025108003):

```
StatusNotification  {"status":"Preparing","connectorId":1}
RemoteStartTransaction {"idTag":"AUTO","connectorId":1}      ← auto-start, 2s after Preparing
StartTransaction    {"idTag":"AUTO","meterStart":6580}
StatusNotification  {"status":"Charging"}
StopTransaction     {"reason":"Other","meterStop":6580}       ← 4s later, meterStop == meterStart
StatusNotification  {"info":"DCStartFailed","status":"Finishing"}
MeterValues         Voltage 0.0 V, Current 0.0 A
```

`DCStartFailed` is the charger's own power stage refusing to come up. The
session was authorised fine — zero energy moved. Things to rule out, in order:

1. **Auto Start.** The server sends `RemoteStartTransaction` shortly after the
   connector reports `Preparing`. On a DC charger the vehicle handshake behind
   `Preparing` takes several seconds, and authorising into the middle of it can
   fail the DC start. Turn Auto Start off for the charger and start the session
   at the charger instead — if that charges, auto-start timing is the cause.
2. **Auto Transfer VIN.** The `DataTransfer(GetVIN)` this sends is a
   vendor-specific message. Some firmware never answers it at all. Turn it off
   while diagnosing.
3. **Power limits.** Check what limits are actually in force with
   Get Composite Schedule for connector 0 and for each connector, and check
   `ChargePointMaxCurrentLimit` with Get Configuration. A limit below what the
   vehicle needs to begin can fail the start. Clear the limits and retest.

If it still fails with all three off, the problem is at the charger or the
vehicle, not the Central System.
