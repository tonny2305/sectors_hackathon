# Telegram Delivery Evidence

**Status: TELEGRAM DELIVERY EVIDENCE NOT SECURED**

No real Telegram request was made. The controlled send is blocked until credentials are safe and available locally.

## Existing Alert

The live Sectors evidence records one persisted `MATERIAL` Telegram alert:

- Alert: `5bcadd2d-a96f-4f1d-9659-d7d29baca4f7`
- Filing: `9f90f11c-c401-4625-a250-670f5162c857` (`NSSS.JK`)
- Evaluation: `561bb2fe-3620-4276-8748-51716ee59fc0`
- Recorded delivery status: `PENDING`
- Recorded `sent_at`: `null`
- Recorded external message ID: `null`

The status above is from the final Sectors evidence snapshot; this work did not attempt delivery or claim the alert.

## Delivery-Only Path

`npm run telegram:deliver -- <alert-uuid>` selects only the supplied alert ID, reads its persisted filing/evaluation evidence, claims it through the existing conditional `PENDING/FAILED → UNKNOWN` update, then calls Telegram. It does not import `runMonitoringCycle` or `SectorsClient`, and it does not read `SECTORS_API_KEY`. A confirmed Telegram response with a numeric `message_id` is required before the row becomes `SENT`; `sent_at` and that message ID are persisted together. A second attempt skips `SENT`. Confirmed rejection remains retryable; ambiguous results remain `UNKNOWN`.

For the existing alert, after credentials are rotated and set locally, the delivery-only command is:

```powershell
npm run telegram:deliver -- 5bcadd2d-a96f-4f1d-9659-d7d29baca4f7
```

Run that same command once more only after the first response and persisted `SENT` state are confirmed; the expected result is `SKIPPED`, with no additional Telegram message.

## Local Verification

- `npm test`: 14 test files passed, 110 tests passed.
- `npm run typecheck`: passed.
- Delivery-only tests use mocks and assert the injected network request targets Telegram only.
- No live Sectors or Telegram request was made during this delivery work.

## Blocker

The environment attachment in the conversation exposed an active Supabase service credential, and showed Telegram bot/chat credentials as empty. Do not use the exposed Supabase credential. Rotate the Supabase service-role credential and the exposed Sectors API credential in their respective consoles; then update local environment variables without pasting secrets into chat. Set Telegram bot token and chat ID locally. After that, the one-alert command above can perform the controlled delivery without calling Sectors.

**TELEGRAM DELIVERY EVIDENCE NOT SECURED**
