# Telegram Delivery Evidence

**Status: TELEGRAM DELIVERY EVIDENCE SECURED**

Real Telegram delivery and idempotency tests have been executed and verified in an isolated environment without contacting the Sectors API.

## Delivered Alert Metadata

- **Alert UUID**: `5bcadd2d-a96f-4f1d-9659-d7d29baca4f7`
- **Filing UUID**: `9f90f11c-c401-4625-a250-670f5162c857` (`NSSS.JK`)
- **Evaluation UUID**: `561bb2fe-3620-4276-8748-51716ee59fc0`
- **Channel**: `telegram`
- **Persisted Delivery Status**: `SENT`
- **Persisted `sent_at`**: `2026-10-01T03:26:38.314+00:00`
- **Persisted External Message ID**: `86`

## Controlled Execution Log

### 1. First Execution (Real Telegram Send)
- **Timestamp**: `2026-10-01T03:26:38Z` (`2026-10-01T10:26:38+07:00`)
- **Command**:
  ```powershell
  npm run telegram:deliver -- 5bcadd2d-a96f-4f1d-9659-d7d29baca4f7
  ```
- **Output**:
  ```json
  {"alertId":"5bcadd2d-a96f-4f1d-9659-d7d29baca4f7","status":"SENT","messageId":"86"}
  ```
- **Verification**: The pending alert was claimed, delivered to the Telegram destination, and recorded in the database with status `SENT`, `sent_at: 2026-10-01T03:26:38.314+00:00`, and `external_message_id: "86"`.

### 2. Second Execution (Idempotency / Duplicate Prevention Proof)
- **Timestamp**: `2026-10-01T03:26:43Z` (`2026-10-01T10:26:43+07:00`)
- **Command**:
  ```powershell
  npm run telegram:deliver -- 5bcadd2d-a96f-4f1d-9659-d7d29baca4f7
  ```
- **Output**:
  ```json
  {"alertId":"5bcadd2d-a96f-4f1d-9659-d7d29baca4f7","status":"SKIPPED"}
  ```
- **Verification**: The system detected the existing `SENT` state and skipped delivery. Zero additional messages were sent to Telegram. Persisted `SENT` status, `sent_at`, and `external_message_id` remained unchanged.

## Isolation & API Statement

- **Sectors API Request Count**: `0` (Strictly zero requests to Sectors API; `SECTORS_API_KEY` was not loaded or used).
- **Monitoring Cycle**: `runMonitoringCycle` was not invoked.
- **Scope**: Delivery-only script operated purely on persisted alert evidence from Supabase and dispatched to the Telegram Bot API.

## Test & Build Verification

- `npm test`: 14 test files passed, 110/110 tests passed.
- `npm run typecheck`: passed with zero type errors.

**TELEGRAM DELIVERY EVIDENCE SECURED**


