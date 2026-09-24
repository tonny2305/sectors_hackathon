# Ownership Materiality Sentinel — Phase 1

A data foundation for an equity researcher monitoring ownership disclosures on an IDX watchlist. A new disclosure does not automatically warrant an interruption; repeated holder activity can matter over time. Sectors supplies the ownership evidence at the center of the product.

**Implemented: Phase 1 only.** The homepage is a status placeholder. There is no active schedule, materiality engine, Telegram delivery, or investment advice. No authenticated Sectors capture or unattended run has been produced in this session.

## Setup

Use Node 24 or later and install the locked dependencies:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

Apply `supabase/migrations/202609240001_data_core.sql` once through the Supabase SQL editor or your Supabase migration workflow. The migration requires Supabase's `anon`, `authenticated`, and `service_role` roles. Tests create equivalent local roles in PGlite (PostgreSQL compiled to WASM); they do not provision or verify hosted Supabase/PostgREST.

Set `SECTORS_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the server process environment. `.env.example` lists variable names with empty values. `MAX_FILINGS_PAGES_PER_RUN` defaults to 3; allowed range is 1–100. The CLI uses Node's environment, not Next's dotenv loader. For an ignored local `.env` file, use:

```sh
node --env-file=.env --conditions=react-server scripts/ingest.ts 2026-07-01 2026-07-10
```

With environment variables already set:

```sh
npm run ingest -- 2026-07-01 2026-07-10
```

This is a **manual data-core verification command**, not proof of autonomous monitoring. It logs the run, retrieves filings, validates/normalizes them, inserts them atomically, and records completion. It does not evaluate or send alerts. Exit codes: 0 complete, 2 partial page cap, 1 failure. Daily context is a separately callable client method and is never fetched by this command.

## Data and identity

- Runtime Zod schemas cover documented filing/daily fields, permit missing/null optional values, retain unknown fields, and reject malformed types. Unsafe integer magnitudes are rejected rather than rounded silently. Numeric strings are not assumed to be valid numbers.
- `raw_payload_json` preserves the parsed JSON object, including absent versus null fields and unexpected fields; it is not a byte-for-byte HTTP archive. JSONB may reorder keys.
- The original timestamp is stored as text. The documented example has no timezone; the application does not invent UTC. `source_date` supports future date-window queries. Phase 2 must verify source timezone semantics before instant-based history comparisons.
- Holder identity uses NFKC, whitespace collapse, and lowercase, scoped by symbol. It does not strip legal suffixes or fuzzy-match different entities. Direction and source date are indexed alongside normalized holder name.
- Fingerprints use the packet's SHA-256 fallback over a JSON tuple of symbol, original timestamp, normalized holder, direction, amount, and final holding. Bare source URLs are not proven unique: supplied KETR and ARCI examples contain multiple events under one source URL.
- Records without a holder, direction, or both amount and final holding fail with `INSUFFICIENT_FILING_IDENTITY`; they are not silently merged. A failed batch remains eligible for re-fetch. This conservative identity policy needs authenticated completeness verification.
- Database uniqueness and `ON CONFLICT DO NOTHING` make repeat ingestion idempotent. First evidence wins; changed identity fields can create a new event. Revision reconciliation is not implemented. Reported percentage change is retained separately; signed change comes only from before/after. PostgreSQL computes the persisted delta using exact `numeric` subtraction; the transient JS value uses floating point.
- The migration includes the packet's eight tables, with evaluation/alert/history fields ready for later phases. Unknown future metrics are null, not zero. An alert row is unique per filing; external exactly-once delivery still requires a later delivery/reconciliation policy.

## Reliability and observability

The client uses native `fetch`, a 30-second timeout per attempt, redirects disabled, and no caching. Retries cover 429, 5xx, network errors, and timeout: **three total attempts**, with 1s/2s waits. `Retry-After` can extend a wait to at most 30s. Other 4xx, invalid JSON, and malformed contracts fail without retry. Daily 404/empty or unusable data returns explicit unavailable context.

Filings requests use `limit=30` and follow `next_offset` while `has_next` is true. A page cap returns `PARTIAL` with a warning; broken pagination fails. The bounded result set is ingested in one transaction. If a later page fails, earlier pages are not committed and the window can be retried. Per-attempt logs remain available, even though a failed fetch's aggregate page/record counters may remain zero.

Every attempted Sectors request records endpoint, UTC request time, HTTP status (or null for network failure), latency including response parsing, estimated credit cost, cache status, and a fixed error code. No response body, authorization header, or raw exception is logged. An audit-write failure stops the operation. API accounting estimates one credit per attempt, including failures/retries; actual Sectors billing can differ. The page cap is not a lifetime credit budget.

Database writes are not automatically retried after an ambiguous outcome. Re-running ingestion safely deduplicates committed filings. Interrupted manual runs may remain RUNNING and require inspection; stale-run recovery belongs with the scheduler.

## Later phases (not implemented)

The intended workflow is schedule → Sectors → dedup → watchlist → holder history → materiality → explainable silence/alert → persisted run metrics. Holder memory will measure same-direction 30/90/180-day behavior. The timeline will expose previous evidence and decisions. Every suppressed SILENT/WATCH decision will need reason codes. No materiality state is currently computed.

The packet's 0.25/1/5 percentage-point thresholds remain uncalibrated engineering thresholds. Planned liquidity context uses median `close × volume` over 20 valid days, a proxy rather than exact traded turnover, fetched only for candidates.

Planned measured metrics:

- Interruption reduction = `1 - push_alerts_sent / eligible_new_filings`; zero denominator means N/A.
- Duplicate alert rate = `duplicate_push_alerts / total_push_alerts`.
- Explainability coverage = `explainable_push_alerts / total_push_alerts`, requiring provenance, timestamp, quantitative evidence, and deterministic reason codes.

There are no measured attention savings, accuracy claims, or unattended-run evidence yet. Future Phase 3 requires scheduled-run proof; historical replay is not such proof. Screenshots and polished UI are deferred to Phase 4.

## Security and validation

All credential-bearing modules import `server-only`; Next rejects client imports. The CLI explicitly selects the server condition. Browser roles have no table/RPC permissions; all eight tables enable RLS. No service credentials are public variables. Future worker secrets belong in GitHub Secrets; local `.env*`, raw preflight output, dependency caches, and build output are ignored. Never paste keys into commands, committed files, or logs.

`npm test` exercises contract validation, pagination, bounded retries, timeout, sanitized errors, actual SQL migration/RPC behavior, atomic rollback, persistence after reopen, duplicate ingestion, access controls, and alert uniqueness. Transport tests use mocks; PostgreSQL tests use PGlite. Vitest aliases the server-only marker only inside the test harness; a subprocess test checks that ordinary imports remain blocked.

Public source contracts: [Sectors filings](https://docs.sectors.app/api-references/v2/indonesia/news/filings) and [Sectors daily](https://docs.sectors.app/api-references/v2/indonesia/transaction/daily). Fixture provenance is recorded in `fixtures/README.md`.

The supplied Python preflight remains a research utility, not production logic: it counts future as well as prior nearby events, does not deduplicate history, undercounts failed/retried API attempts, and does not label page-cap truncation. Its classifications are not Phase 2 acceptance evidence. Do not publish accuracy or reduction metrics from its selected sample.

Information and analysis only. No buy/sell/hold recommendation, target price, expected return, or personalized investment advice.
