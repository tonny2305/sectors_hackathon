# SIGNALKEEPER

> Understand the change. Remember the context.

An ownership change can be factually correct and still be easy to misread.

**4.11% → 8.86%.** At first glance, that looks like major accumulation. But in the NSSS / Samuel Tumbuh Bersama disclosure, the context was a **return of borrowed shares**.

The numbers were real. What the change means looks very different once the transaction context is considered.
## Why this matters

There are two different NSSS examples, and they should not be conflated.

### Case A — transaction context

**NSSS / Samuel Tumbuh Bersama**

- **4.11% → 8.86%**
- crossed the 5% threshold
- context: **return of borrowed shares**

This case shows that a large jump can look aggressive when the underlying transaction is a share return rather than fresh accumulation.

### Case B — stateful holder memory

**NSSS / Samuel Sekuritas Indonesia**

- **21.64% → 22.51%**
- change: **+0.87 percentage points**
- without holder history: **WATCH**
- with actual frozen holder history: **MATERIAL**

> The event is the same. The numbers are the same. What changes is the historical context.

This is the stateful insight behind SIGNALKEEPER: the same filing can deserve different attention once prior holder behavior is restored.

## SIGNALKEEPER helps answer four questions

- Who gained or lost ownership influence?
- What actually happened behind the percentage change?
- Has this holder done something similar before?
- Does this disclosure deserve attention now?

It is not:

- a stock-price predictor
- financial advice
- an auto-trading system
- a wrongdoing or manipulation detector

## Verified sealed evaluation

This project belongs in **Sectors Hackathon 2026 — Track 2 — Automation & Workflows** because the system is not just a static archive. It combines live filing ingestion, normalization, deduplication, stateful ownership analysis, and attention triage into a recurring monitoring pipeline.

Sectors API
↓
Ingest + normalize
↓
Deduplicate
↓
Ownership / transaction context
↓
Stateful holder memory
↓
Attention triage
↓
Persist evidence
↓
Notify when appropriate

The live workflow runs through **GitHub Actions scheduling** and preserves evidence for review.

| Policy | Interruptions |
|---|---:|
| Alert every filing | 117 |
| SIGNALKEEPER deployed stateful policy | 64 |

**45.3% fewer interruptions** while retaining **18 / 18 human-consensus immediate-attention events**.

> On our sealed 117-filing evaluation, the deployed stateful policy retained all 18 human-consensus immediate-attention events while reducing interruptions by 45.3% compared with alerting on every filing.

## Frozen archive, not a live feed

Verified frozen archive:

- 900 disclosures
- 179 symbols
- 343 holder-symbol timelines
- 85 crossings around the 5% threshold
- 90 ownership changes of at least 5 percentage points
- 53 new positions
- 26 full exits
- 64 near exits

This is a **historical, frozen, partial archive**. It is not the entire Sectors universe and it is not live monitoring coverage.

## Product

The public product is intentionally small and clear:

- `/` — Signals Feed
- `/signals/[id]` — Event Detail
- `/holders/[pairId]` — Holder Timeline
- `/watchlist` — monitoring configuration and notification bridge

Operational evidence routes are kept accessible below the main product surface:

- `/runs`
- `/alerts`
- `/suppressed`

## Telegram

Telegram is a delivery channel, not the product itself.

The system is designed for **duplicate-resistant**, **at-most-once-oriented** delivery behavior. A successful `SENT` alert is not automatically resent. The repository does not claim formal exactly-once delivery.

No Telegram evidence is tied to either NSSS case unless the specific evidence explicitly proves it.

## Run locally

Requires Node.js 24 or newer.

```bash
npm ci
npm run dev
```

For local monitoring or ingestion, copy [.env.example](.env.example) to `.env` and add only the required values. Keep secrets out of version control.

```bash
npm test
npm run typecheck
npm run build
```

Useful operational commands:

```bash
npm run ingest
npm run monitor
npm run telegram:deliver
```

Use those only when intentionally performing an authorized monitoring or delivery action.

## Repository layout

- [app](app) — product routes and UI
- [components](components) — presentation components
- [lib](lib) — materiality engine, monitoring logic, Sectors client, storage, and delivery code
- [scripts](scripts) — archive-generation and operational scripts
- [tests](tests) — archive, materiality, monitor, and delivery checks
- [docs/evidence](docs/evidence) — live-run and history-ablation evidence
- [supabase](supabase) — schema and migration files

## Notes

This project is for technical review and evaluation. It is not investment, legal, or compliance advice.
