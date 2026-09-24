# Phase 3 Checkpoint — 24 September 2026

## A. Implemented in Phase 3

| Module / File | Responsibility |
| --- | --- |
| `lib/automation/monitor.ts` | Complete autonomous monitoring orchestrator: Sectors filing polling, deduplication, watchlist filtering, holder history loading, credit-aware daily enrichment, evaluation persistence, alert queueing, holder state updates, attention metrics computation, and run status finalization. |
| `scripts/monitor.ts` | Production CLI entrypoint supporting scheduled cron execution and manual backfill runs with dynamic Jakarta timezone handling. |
| `.github/workflows/scheduled-monitor.yml` | GitHub Actions unattended weekday cron schedule (`30 3,5,8,11 * * 1-5` UTC = 10:30, 12:30, 15:30, 18:30 WIB) with `workflow_dispatch` support. |
| `lib/db/store.ts` | Added `getWatchlistSymbols`, `upsertHolderActivityState`, `queueAlert`, and `ingestWithRows` for automation orchestration. |
| `package.json` | Pinned `"monitor"` script command (`node --conditions=react-server --experimental-strip-types scripts/monitor.ts`). |
| `tests/monitor.test.ts` | 4 comprehensive orchestration tests covering end-to-end multi-state cycles, credit-aware daily API skipping, page cap partial runs, and failure logging. |

---

## B. Autonomous Monitoring Data Flow

```text
[GitHub Actions Scheduled Cron]
               │
               ▼
   [Fetch Latest Sectors Filings] (limit=30, page cap=3)
               │
               ▼
   [Atomic Ingest & Fingerprint Dedup] (PostgreSQL RPC)
               │
               ▼
   [Filter Active Watchlist Symbols]
               │
               ▼
  ┌────────────────────────────────────────────────────────┐
  │ For Each Eligible Filing:                              │
  │   1. Load prior holder events (30d/90d/180d)           │
  │   2. Base Materiality Evaluation                       │
  │   3. Credit-Aware Check:                               │
  │      - If SILENT routine: SKIP daily API call          │
  │      - If WATCH / Candidate: FETCH 20d daily liquidity │
  │   4. Save Final Evaluation (event_evaluations)         │
  │   5. Queue Alert if MATERIAL/STRUCTURAL (alerts)       │
  │   6. Upsert Holder Activity State (holder_activity_state)
  └────────────────────────────────────────────────────────┘
               │
               ▼
  [Compute Attention Intelligence Metrics]
  (Interruption Reduction, Duplicate Rate, Explainability Coverage)
               │
               ▼
  [Finalize Run Status & Metrics in automation_runs]
```

---

## C. Credit-Aware Routing Strategy

1. **Base Ingestion**: Filings API is queried once per page (1 credit per attempt).
2. **Selective Context Enrichment**:
   - `SILENT` events with negligible stake changes **skip** `/v2/daily/` calls completely (0 extra credits).
   - `WATCH` and candidate high-value events perform a single 30-day liquidity lookup cached per symbol for the cycle.
3. **Audit Logging**: Every attempted API call records latency, HTTP status, and estimated credit cost into `api_call_logs`.

---

## D. Error Handling & Run States

- **`COMPLETE`**: All pages fetched (`has_next = false`), all filings evaluated and persisted cleanly.
- **`PARTIAL`**: Hard cap (`MAX_FILINGS_PAGES_PER_RUN = 3`) reached while `has_next = true`. Logs operational warning `MAX_FILINGS_PAGES_REACHED` without discarding processed batches.
- **`FAILED`**: Network/Sectors/Database fatal error caught, recorded immediately in `automation_runs` with `error_summary`.

---

## E. Scheduler Specification

- **Jakarta Times (WIB, UTC+7)**: 10:30, 12:30, 15:30, 18:30
- **GitHub Actions UTC Cron**: `30 3,5,8,11 * * 1-5`
- **Concurrency**: `cancel-in-progress: false` to ensure atomic run completion.

---

## F. Test Suite Summary

Executed on Windows with Node 24:

| Test File | Tests | Result |
| :--- | :--- | :--- |
| `tests/monitor.test.ts` | 4 | PASS: End-to-end orchestration, credit savings, page cap partial runs, and failure logging |
| `tests/materiality.test.ts` | 13 | PASS: 4 materiality states, boundaries, missing field safety, liquidity enrichment |
| `tests/escalation.test.ts` | 6 | PASS: Stateful sequence escalation, holder isolation, direction reset, 180d lookback |
| `tests/metrics.test.ts` | 4 | PASS: Interruption reduction, duplicate alert rate, explainability coverage, 0 denominator |
| `tests/replay.test.ts` | 1 | PASS: Documented NSSS.JK 5th purchase case study replay |
| `tests/client.test.ts` | 36 | PASS: API schema parsing, 3-attempt bounded retries, 429 backoff, audit logs |
| `tests/security.test.ts` | 3 | PASS: Server-only boundary, secret exclusion, names-only environment template |
| `tests/persistence.test.ts` | 12 | PASS: PostgreSQL WASM (PGlite) migration, RLS, atomic RPC, alert uniqueness |
| **Total** | **79** | **PASS (100%)** |

Quality Checks:
- `npm.cmd test`: **79 passed (8 test files)**
- `npm.cmd run typecheck`: **0 errors (Strict TypeScript)**
- `npm.cmd run build`: **Compiled successfully in Turbopack production build**

---

## G. Status & Handoff to Phase 4

**Phase 3 is COMPLETE and VERIFIED.**

Next steps for **Phase 4 (UI & Output Layer)**:
1. Implement Telegram alert delivery dispatcher for queued alerts (`lib/alerts/telegram.ts`).
2. Build the Attention Intelligence Dashboard (`app/page.tsx` & `components/`):
   - Active automation status, last run, and next expected run.
   - Attention metrics cards: *Interruption Reduction* ($\ge 90\%$), *Duplicate Alert Rate* ($0\%$), *Explainability Coverage* ($100\%$).
   - Real-time run timeline.
3. Build Material Alerts feed and Detail view with Sectors provenance and reason codes (`app/alerts/page.tsx`, `app/alerts/[id]/page.tsx`).
4. Build Suppressed Events / Attention Log (`app/suppressed/page.tsx`) proving *Explainable Silence*.
5. Build Holder Behavior Timeline component on event details.
6. Build Watchlist management screen (`app/watchlist/page.tsx`).
