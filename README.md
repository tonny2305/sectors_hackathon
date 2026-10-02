# SIGNALKEEPER

> SIGNALKEEPER turns Indonesian ownership disclosures into understandable ownership changes, holder history, transaction context, and stateful attention triage.

**Sectors Hackathon 2026 — Track 02: Automation & Workflows**

Built for equity researchers, financial journalists, governance researchers, and engaged minority shareholders. A raw filing list makes readers compare stake percentages, reconstruct a holder's activity, and inspect transaction context one disclosure at a time. SIGNALKEEPER brings those facts and the observed holder-company history together so people can decide what merits review. It provides information and analysis, not investment, legal, or compliance advice.

Sectors is fundamental: its ownership-disclosure API supplies the filings that the production monitoring workflow validates, deduplicates, evaluates against holder history, persists, and may route to Telegram. The historical product archive is also derived from Sectors disclosures.

## Product

- **Signals Feed (`/`)** — browse a frozen, historical archive of ownership disclosures with factual change badges and before/after percentages.
- **Event Detail (`/signals/[id]`)** — inspect the source disclosure, reported transaction fields, ownership change, provenance, and factual context.
- **Holder Timeline (`/holders/[pairId]`)** — review the observed chronological disclosures for a holder-company pair within the archive.
- **Configured Monitoring (`/watchlist`)** — view the operator-configured symbols. The public interface does not let visitors edit the watchlist. Those symbols can enter the separate monitoring workflow below.

### Two distinct systems

**A. Historical exploration.** The Feed, Event Detail, and Holder Timeline read a frozen Sectors archive: **900 observed disclosures**, **179 symbols**, covering **3 Jul–30 Sep 2026**. It contains **85** crossings of the 5% line, **90** ownership changes of at least 5 percentage points, and **343** observed holder-company timelines. This is a bounded archive slice, not the entire Sectors corpus, not live coverage, and not an input to or calibration set for B2.

**B. Autonomous monitoring.** The production path is:

```text
weekday schedule → Sectors API → filing deduplication → holder memory
→ sealed B2 triage → persisted evaluation/alert → optional Telegram delivery
```

The recurring weekday schedule is configured in [`.github/workflows/scheduled-monitor.yml`](.github/workflows/scheduled-monitor.yml). A schedule is configuration, not proof of continuous or current coverage; Sectors availability, API credits, watchlist configuration, and run outcomes affect what is monitored. Do not infer live coverage from the historical archive.

### Stateful triage example

For the same frozen `NSSS.JK` event, **Samuel Sekuritas Indonesia** moved from **21.64% to 22.51% (+0.87 pp)**. With only the current event, B2 evaluates it as `WATCH`; with its actual frozen holder history restored, it becomes `MATERIAL`. The current event is identical in both evaluations; only legitimate historical context changes. This is a reproducible ablation, not the archive's separate Samuel Tumbuh Bersama example.

### Sealed attention evaluation

On the sealed set of **117 persisted filings**, alert-all produces **117 interruptions**; B2 produces **64**, a **45.30% reduction**, while retaining **18/18** human-consensus immediate-attention cases.

**This result applies to the sealed 117-filing evaluation and is not a claim about all IDX disclosures.**

The measured result and methodology are recorded on the [`attention-benchmark` branch](https://github.com/tonny2305/sectors_hackathon/tree/attention-benchmark/research/attention-benchmark/results), including [`SEALED_HUMAN_EVALUATION.md`](https://github.com/tonny2305/sectors_hackathon/blob/attention-benchmark/research/attention-benchmark/results/SEALED_HUMAN_EVALUATION.md). It is separate from the 900-event archive.

## Architecture

The monitoring worker obtains bounded filing pages from the Sectors API, validates and normalizes the responses, atomically deduplicates filings in Supabase, loads prior events for configured holder-company pairs, and evaluates eligible new filings with the frozen B2 engine. Evaluations, reasons, alerts, run records, and API-call logs are persisted. Eligible alerts may then be delivered to Telegram.

The archive is a separate static JSON artifact compiled offline from a frozen archival Git ref. The public archive routes read this artifact; they do not call Sectors, write to Supabase, or run the B2 engine. No archive events are imported into the sealed 117-filing evaluation.

### Verified operating evidence

- **Scheduled unattended evidence:** the [documented scheduled GitHub Actions run](https://github.com/tonny2305/sectors_hackathon/actions/runs/36023434752) completed on 24 September 2026 and persisted as `SCHEDULED_CRON`. It scanned 8 filings, found 1 eligible `STRUCTURAL` event, made 1 Sectors API attempt, and queued 1 alert. The run began about 4 hours 23 minutes after its scheduled slot. This proves one unattended execution, not schedule punctuality or continuous coverage.
- **Manual functional evidence:** the two 30 September 2026 runs in [`FINAL_SECTORS_LIVE_EVIDENCE.md`](docs/evidence/FINAL_SECTORS_LIVE_EVIDENCE.md) were manually triggered with `workflow_dispatch`. They scanned 18 records, first producing 9 new / 9 deduplicated and 1 `MATERIAL` evaluation, then 0 new / 18 deduplicated. These are ingestion, deduplication, and rerun evidence—not scheduled unattended evidence.
- **Separate Telegram proof:** [`TELEGRAM_DELIVERY_EVIDENCE.md`](docs/evidence/TELEGRAM_DELIVERY_EVIDENCE.md) documents a persisted `SENT` delivery and a repeated attempt recorded `SKIPPED`. The exact source filing is not established in this repository evidence. This proof is not claimed to be the archive NSSS examples, the history-ablation event, or the manual live-run alert. An ambiguous network outcome may be recorded as `UNKNOWN`; the system does not promise formal exactly-once delivery.
- **Statefulness proof:** [`HISTORY_ABLATION_PROOF.md`](docs/evidence/HISTORY_ABLATION_PROOF.md) reproduces the `WATCH` → `MATERIAL` result offline from the frozen B2 fixture.

The public product deployment URL has not been verified.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Historical Signals Feed |
| `/signals/[id]` | Historical Event Detail |
| `/holders/[pairId]` | Historical Holder Timeline |
| `/watchlist` | Operator-configured monitoring symbols and workflow evidence |
| `/runs` | Operational run log and trigger/coverage evidence |
| `/alerts`, `/alerts/[id]`, `/suppressed` | Persisted operational evidence routes |
| `/api/health` | Configuration and database health endpoint |

The operational routes are not the historical archive and do not turn archive disclosures into live monitoring results.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

The historical archive pages use the checked-in artifact and need no Sectors API call. The Watchlist and operational views require a configured Supabase project. Copy [`.env.example`](.env.example) to `.env` and configure only the environment values needed for the local service:

```text
SECTORS_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
MAX_FILINGS_PAGES_PER_RUN
MAX_SECTORS_API_ATTEMPTS_PER_RUN
APP_BASE_URL
MONITOR_TRIGGER_TOKEN
WATCHLIST_ADMIN_TOKEN
```

Keep credentials in the local environment or platform secret store; never commit them. The service-role key and bot token must remain server-side. Public watchlist administration is disabled.

Useful local checks:

```sh
npm test
npm run typecheck
npm run build
node --conditions=react-server --experimental-strip-types scripts/history-ablation-proof.ts
```

`npm run monitor` and `npm run ingest` access the configured Sectors API and persistence service; run them only when intentionally performing an authorized monitoring or ingestion operation. They are not needed to browse the frozen archive.

## Limitations and eligibility

- The archive is only the observed 3 Jul–30 Sep 2026 slice; it is not complete endpoint history or live coverage.
- Scheduled runs can be delayed or skipped. Bounded page/request limits can yield partial coverage, and upstream availability or credits are not guaranteed.
- Telegram may be unconfigured. A persisted alert is not proof of successful delivery; ambiguous outcomes may be `UNKNOWN`.
- B2 thresholds are deterministic engineering rules, not calibrated investment signals. The sealed evaluation is limited to its 117 filings.
- The product does not predict prices, recommend trades, or make legal, compliance, misconduct, or control determinations.
- The official build period begins **19 Aug 2026**. Repository history's first commit is dated **24 Sep 2026**; Git history does not establish team onboarding chronology. **Team onboarding before code creation must be confirmed by the team before submission.**

## Evidence map

- [`PIVOT_PRODUCT_SPEC_V2.md`](docs/PIVOT_PRODUCT_SPEC_V2.md) — archive/product boundaries and factual badge definitions.
- [`FINAL_SECTORS_LIVE_EVIDENCE.md`](docs/evidence/FINAL_SECTORS_LIVE_EVIDENCE.md) — manual `workflow_dispatch` runs and deduplication evidence.
- [`HISTORY_ABLATION_PROOF.md`](docs/evidence/HISTORY_ABLATION_PROOF.md) — reproducible statefulness proof.
- [`TELEGRAM_DELIVERY_EVIDENCE.md`](docs/evidence/TELEGRAM_DELIVERY_EVIDENCE.md) — separate persisted delivery/idempotency evidence.
- [Sealed human evaluation](https://github.com/tonny2305/sectors_hackathon/blob/attention-benchmark/research/attention-benchmark/results/SEALED_HUMAN_EVALUATION.md) — benchmark methodology and results on the `attention-benchmark` branch.
- [`supabase/verify_security.sql`](supabase/verify_security.sql) — read-only hosted database security verification; hosted policies still require operator verification.

The submission repository also contains earlier project checkpoints and preflight research files. Read the evidence scope and date before treating any artifact as current product, live monitoring, or sealed evaluation evidence.
