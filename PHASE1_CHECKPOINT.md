# Phase 1 checkpoint — 24 September 2026

## A. Implemented

| Files | Responsibility |
| --- | --- |
| `package.json`, lockfile, `tsconfig.json`, `vitest.config.ts` | Next.js/Node TypeScript project; strict source checking, pinned dependency resolution, Vitest |
| `app/layout.tsx`, `app/page.tsx` | Minimal status page and information-only disclaimer |
| `lib/sectors/schemas.ts` | Runtime filing/daily contracts; null handling, safe numbers, timestamps, pagination |
| `lib/sectors/client.ts` | Server-only authenticated REST client; bounded pagination/retries, timeout, unavailable daily context, sanitized per-attempt logs |
| `lib/sectors/normalize.ts` | Normalized ownership model, conservative holder identity, versioned composite SHA-256 fingerprint |
| `supabase/migrations/202609240001_data_core.sql` | Eight specified tables, holder-history index, unique event/alert constraints, atomic ingestion RPC, RLS and role restrictions |
| `lib/db/store.ts` | Native-fetch Supabase persistence for filings, API attempts, and manual verification runs |
| `scripts/ingest.ts` | Explicitly manual Phase 1 ingestion command; COMPLETE/PARTIAL/FAILED run recording |
| `fixtures/*`, `tests/*` | Labeled documentation fixtures and 51 automated checks |
| `.gitignore`, `.env.example`, `README.md` | Secret exclusions, empty environment template, setup and limitations |

The supplied packet and calibration files are preserved. Local incremental Git commits record initialization, API contracts, persistence, and validation.

## B. Real Sectors verification

**No authenticated API verification.** `SECTORS_API_KEY` was absent; no `.env` existed. No Supabase URL/service credential was available either. No real filings were fetched or written to hosted Supabase.

Public [filings documentation](https://docs.sectors.app/api-references/v2/indonesia/news/filings) and [daily documentation](https://docs.sectors.app/api-references/v2/indonesia/transaction/daily) were inspected. The JSON fixtures reproduce their public examples. Synthetic variations test failures; PGlite executes the actual PostgreSQL migration and ingestion function. The hosted PostgREST boundary is mocked, not live-verified.

## C. Preflight result

Authenticated Python preflight did not run because the API key was unavailable. Live record count, field completeness, ownership-change distribution, state distribution, repeat-holder patterns, and latency are therefore **unmeasured**, not zero-valued findings.

The supplied publication-selected proxy contains 27 events: SILENT 7, WATCH 4, MATERIAL 10, STRUCTURAL 6. Its absolute-delta median is 0.94 pp, range 0.01–67.74 pp. These are supplied proxy results, not results from this implementation or an unbiased Sectors sample. Thresholds were not changed.

Findings relevant to later verification:

- Shared source URLs in the supplied KETR/ARCI examples rule out assuming URL-only event uniqueness.
- The documented Sectors timestamp lacks a timezone; the original string is retained exactly.
- Daily documentation includes open/high/low in addition to the packet's minimum fields; these are preserved.
- The supplied preflight's repeat calculation looks both backward and forward, does not deduplicate, and undercounts retries in its credit estimate. Its page cap is not reported as partial. It cannot serve as a causal holder-memory acceptance test.

## D. Tests

Executed on Windows with Node 24.16.0:

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS: 51 tests in 3 files |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS: optimized Next.js build and static routes |

Coverage includes contracts, optional nulls, malformed data, invalid pagination, explicit partial results, 429/5xx/network/timeout retries, permanent 4xx, no-secret error output, source/raw persistence, exact SQL numeric delta, overlap deduplication, rollback, reopen persistence, database permissions, and alert-row uniqueness. Simultaneous PGlite calls are serialized by the local runtime; this is not a hosted concurrency load test.

## E. Credit usage

**0 authenticated Sectors requests; 0 estimated Sectors credits consumed.** Documentation browsing is not an authenticated Sectors API call. Production instrumentation estimates one credit per attempt, including retries; billing reconciliation remains unverified.

## F. Security

No credential was supplied or intentionally written/committed. A final scan passed across 33 Git-history blobs, 29 tracked files, and 9 browser build files: no private-key/JWT/Supabase-secret patterns were detected, and no server credential variable names or test canary appeared in browser output. No real environment secret was available for value comparison; pattern scanning cannot prove the absence of every arbitrary secret format.

`.env` and `.env.*` are ignored except the names-only `.env.example`; preflight output is ignored. API and database keys stay in private server modules guarded with `server-only`. Browser roles have no database table/RPC access; all eight tables enable RLS. Logs contain fixed error codes, never response bodies or authorization headers. The security tests verify these boundaries. Use process environment locally and GitHub Secrets for the later scheduled worker.

## G. Deviations and limits

- Uses the packet's composite fingerprint fallback because source URL uniqueness is unverified. Identity changes/revisions require a future reconciliation policy.
- Incomplete event identity fails ingestion explicitly rather than risking merging unrelated records. Authenticated data must establish how often this occurs. Failed batches can be re-fetched; malformed/rejected payloads are not separately quarantined.
- Interprets “max 3 tries” as three total attempts, hence waits of 1s and 2s rather than an unnecessary 4s wait after the final failure.
- Adds PGlite only as a development dependency to test actual PostgreSQL behavior without Docker or a provisioned server. Production remains Supabase Postgres. Native fetch avoids adding a database SDK.
- Source TypeScript remains strict; `skipLibCheck` skips third-party declaration checking because PGlite's bundled declarations refer to missing Emscripten types.
- Pagination, retries, API logs, and a manual verification run wrapper are included now because the Phase 1 request explicitly requires them, although the full packet places their scheduler integration later.
- UI polish, materiality/escalation logic, Telegram, scheduling, and unattended-run proof remain deferred as requested. Unique alert rows are foundation only, not proof of external exactly-once delivery.

## H. GO / MODIFY / KILL

**MODIFY: retain the foundation, but do not claim a live-data GO yet.** The contract and PostgreSQL tests support the design. Missing authenticated evidence prevents concluding that real Sectors data reliably satisfies the schemas and identity requirements, or that the hosted Supabase boundary works.

Before approving Phase 2: apply the migration to the intended Supabase project, set server credentials, run the supplied preflight with its documented caveats, ingest a bounded real window twice, verify second-run zero inserts, inspect completeness/identity failures, and confirm persisted request logs and timestamps. No threshold calibration or financial-accuracy conclusion is justified yet.

Stopped at Phase 1.
