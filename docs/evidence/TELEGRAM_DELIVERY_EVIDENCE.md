# Telegram Delivery Evidence

**Status: LIVE DELIVERY AND PERSISTED IDEMPOTENCY PROOF CAPTURED; SCREENSHOT PENDING**

This controlled proof used the delivery-only command for one persisted alert. It did not run `runMonitoringCycle` and did not load or call the Sectors API.

## Destination Verification

- Telegram API result: `ok: true`
- Chat type: `group`
- Chat title: `IDX Ownership Sentinel`
- Bot token and numeric chat ID are intentionally not recorded.

## Delivered Alert Metadata

- **Alert UUID**: `09d3ffa7-661d-4143-9e88-f36155d56769`
- **Ticker**: `NSSS.JK`
- **Materiality**: `MATERIAL`
- **Channel**: `telegram`

## Controlled Execution Log

### 1. First Execution

Command:

```powershell
npm run telegram:deliver -- 09d3ffa7-661d-4143-9e88-f36155d56769
```

Sanitized result:

```json
{"alertId":"09d3ffa7-661d-4143-9e88-f36155d56769","status":"SENT","messageId":"88"}
```

Telegram accepted the send and returned external message ID `88`.

### 2. Persisted Database Verification

Sanitized Supabase row observed after the first send:

```json
{
  "id": "09d3ffa7-661d-4143-9e88-f36155d56769",
  "delivery_status": "SENT",
  "sent_at": "2026-10-01T12:43:51.59+00:00",
  "external_message_id": "88"
}
```

The same values remained after the second execution.

### 3. Second Execution / Idempotency Proof

The exact same command was run once more:

```powershell
npm run telegram:deliver -- 09d3ffa7-661d-4143-9e88-f36155d56769
```

Sanitized result:

```json
{"alertId":"09d3ffa7-661d-4143-9e88-f36155d56769","status":"SKIPPED"}
```

No second Telegram send was initiated by the delivery path. The persisted status, `sent_at`, and external message ID remained unchanged.

## Isolation & API Statement

- Sectors API requests during this controlled proof: `0`.
- `runMonitoringCycle` was not invoked.
- `SECTORS_API_KEY` was not loaded or used by the delivery command.
- Only the persisted alert/evaluation data, Supabase REST API, and Telegram Bot API were used.

## Screenshot Evidence

The in-app browser was unavailable during this run, so a screenshot of the Telegram group message could not be captured. No fabricated screenshot or visual claim is included.

## Test & Build Verification

Pending after this evidence update:

- `npm test`
- `npm run typecheck`
- `git diff --check`
- secret scan

