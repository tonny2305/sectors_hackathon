# Autonomous Ownership Materiality Sentinel

An evidence-based monitor for Indonesian ownership disclosures. It fetches Sectors filings, deduplicates them in Supabase, compares each holder with earlier filings, classifies events as `SILENT`, `WATCH`, `MATERIAL`, or `STRUCTURAL`, and records both decisions and run evidence. It does not provide investment recommendations.

## How it works

```text
weekday schedule or manual trigger
  -> authenticated Sectors filings API (bounded pages and attempts)
  -> atomic fingerprint deduplication in Supabase
  -> active watchlist filter
  -> prior-holder history and deterministic materiality rules
  -> optional Sectors daily liquidity proxy for candidates
  -> persisted evaluation and suppression reasons
  -> queued alert; optional Telegram delivery
  -> persisted run and API-call logs
```

The classifier uses share-based relative position change only when the share counts exist. It never treats missing values as zero. An event can escalate as a holder repeats the same direction within 30, 90, or 180 days. The liquidity measure is a `close × volume` proxy, not exact traded turnover. Thresholds are v1 engineering choices requiring calibration on authenticated data.

## Setup

Requires Node.js 24 or newer, a Sectors API key, and a Supabase project. Run `npm ci`, copy `.env.example` to `.env`, and set `SECTORS_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Apply [the SQL migration](supabase/migrations/202609240001_data_core.sql) in Supabase and configure at least one watchlist symbol. `.env` is ignored by Git; keep the service-role key and all scheduler credentials server-side.

Run `npm run dev` for the web app or `npm run monitor -- 2026-09-24 2026-09-24` for one date. `npm run ingest -- START END` performs data-core ingestion without materiality evaluation. The watchlist page shows hosted symbols; adding or removing one requires `WATCHLIST_ADMIN_TOKEN` (at least 32 characters) and the token is kept in page memory only. The HTTP monitor endpoint requires a separate `MONITOR_TRIGGER_TOKEN` (at least 32 characters). Unconfigured write endpoints fail closed. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and a deployed `APP_BASE_URL` only when external delivery is intended; without Telegram configuration, material alerts remain queued in the database and the web inbox.

## Automation

[The GitHub Actions workflow](.github/workflows/scheduled-monitor.yml) is configured for weekdays at 10:30, 12:30, 15:30, and 18:30 WIB. Add repository secrets `SECTORS_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Optional push needs `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and repository variable `APP_BASE_URL`. `MAX_FILINGS_PAGES_PER_RUN` defaults to 3 and `MAX_SECTORS_API_ATTEMPTS_PER_RUN` defaults to 15. A page cap can produce a `PARTIAL` run; investigate it before claiming complete coverage. GitHub schedules can be delayed or dropped, so confirm actual `SCHEDULED_CRON` rows in `/runs` before claiming autonomous operation. Manual `workflow_dispatch` is the recovery path.

If the web app is deployed with a durable worker endpoint and a dedicated bearer secret, an external HTTPS scheduler can replace GitHub cron. Use one production scheduler at a time. Never place the Sectors key in a scheduler URL. The web endpoint is not proof of successful background execution until its deployment and runtime are verified.

## Evidence and metrics

The dashboard, `/alerts`, `/suppressed`, `/runs`, and `/alerts/[id]` read persisted records. Suppressed decisions retain their reason codes, source timestamp, and provenance; enrichment status is shown on event detail. A missing result is shown as `N/A`, not a success rate. Interruption reduction is `1 - delivered pushes / eligible evaluated watchlist events` when delivery is available. Duplicate alert rate and explainability coverage are computed from actual sends; zero-delivery runs have no measured rate. Run logs record page count, status, latency, estimated Sectors credits, and any partial/failure reason.

There is currently no independently verified unattended scheduled run or deployed app. The hosted Supabase schema and a bounded live Sectors ingestion have been verified, including a repeat run that produced no duplicate filings, evaluations, or alert rows. Hosted RLS policy and database constraints still require an administrative review; the repository migration is tested locally with PGlite.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The tests cover API schema and pagination, bounded retries, fingerprint deduplication, PostgreSQL migration behavior, all four materiality states, holder escalation and time ordering, worker recovery, route authorization, and metric zero-denominator behavior. There is no lint script. The app is for information and analysis only, not financial, legal, or investment advice.
