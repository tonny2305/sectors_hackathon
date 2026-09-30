# Sectors Archival Harvest Summary

Corpus class: `POST_FREEZE_ARCHIVAL_HOLDOUT`. Raw archival only; no production tables, materiality logic, benchmark artifacts, human evaluation, or Telegram were touched.

This partial corpus must NOT be used to tune or recalibrate the frozen B2 policy, and must NOT be used to alter or contaminate the sealed 117-event evaluation corpus.

- Harvest started: 2026-09-30T16:57:15.956Z
- Harvest finished: 2026-09-30T16:59:55.369Z
- Requested date range: 2000-01-01 through 2026-09-30
- Observed filing date range: 2026-07-03 through 2026-09-30
- Requests: 30, all sequential to `/v2/filings/`
- HTTP outcomes: all 200
- Raw records received: 900
- Unique ownership records: 900
- Unique symbols: 179
- Duplicate records removed locally: 0
- Endpoint total reported: 3836
- Estimated credits consumed: 30 (repository client estimate: 1/request)
- Actual balance before/after: not observable; repo client exposes no usage endpoint and responses had no credit-remaining headers
- Other datasets: none; credits/headroom reserved for ownership priority
- 429/5xx/errors: none
- Stop reason: request_cap_30_no_balance_visibility
- Raw response SHA-256 checks: 30/30 verified; failures 0

Raw response bodies are under `raw-pages/`; deduplicated, untransformed filing objects are in `ownership-unique.jsonl`. Every request, parameter set, timestamp, status, record count, pagination state, and body digest is in `manifest.json`. This is a bounded first archive slice, not the full 3,836-record endpoint corpus.
