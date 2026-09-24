# CODEX BUILD PACKET — Sectors Hackathon 2026
## Track 2 · Automation & Workflows
### Status: CONCEPT LOCK v2 — 24 September 2026

**Working concept:** Autonomous Ownership Materiality Sentinel  
**Product category:** Autonomous Materiality Intelligence / Attention Intelligence for ownership disclosures.  
**Primary user:** equity researcher covering a watchlist of Indonesian listed companies.  
**Core job:** automatically triage insider / major-shareholder filings and interrupt the user only when an ownership event deserves human attention.  
**Core insight:** a new filing is not automatically a meaningful filing; significance can emerge from magnitude, context, or repeated behavior over time.  
**Positioning:** information & analysis tool, not investment advice.

### v2 championship-moat changes
This version upgrades four items from nice-to-have to **MUST WORK**:
1. stateful escalation / holder memory;
2. explainable silence;
3. attention metrics;
4. historical holder behavior timeline.

These are core product requirements and must be represented in the data model, tests, UI, automation, and demo.

## 0. Non-negotiable competition constraints
- Core must run autonomously on a schedule/trigger.
- Sectors REST API is core; remove Sectors and the product loses its main function.
- Demo must show schedule config, unattended logs/timestamps, and one end-to-end material event.
- No real-money trade execution.
- No buy/sell/hold recommendations or target prices.
- No secrets in public repo.
- Do not submit before final QA because submission freezes the project.

Official references:
- https://hackathon.sectors.app/tracks/automation-workflows
- https://hackathon.sectors.app/rules
- https://docs.sectors.app/api-references/v2/indonesia/news/filings
- https://docs.sectors.app/api-references/v2/indonesia/transaction/daily

## 1. Product thesis
### Problem
Financial markets do not only have a data problem; they have an **attention-allocation problem**.

An equity researcher monitoring IDX companies should not have to manually inspect every insider or major-shareholder filing just to decide whether anything meaningful happened. A raw disclosure asks for attention, but many disclosures are routine, small, duplicated across polling cycles, or only become meaningful when viewed as part of a repeated pattern.

Raw alert:
`Did a filing appear?`

Product answer:
`Does this ownership change deserve human attention now, and exactly why?`

The product must be valuable both when it **alerts** and when it **chooses to stay silent**.

### One-sentence problem
Equity researchers monitoring IDX companies repeatedly inspect insider and major-shareholder filings to separate routine ownership changes from events that genuinely deserve attention; this product automatically checks new Sectors filings, remembers prior holder behavior, suppresses noise, and alerts only when transparent materiality rules are crossed.

### One-sentence value proposition
Set the companies once; the system remembers holder behavior over time, stays silent on routine filings, and surfaces only material ownership changes with before/after stakes, escalation history, liquidity context, reason codes, timestamps, and Sectors evidence.

### Category narrative
**We are building an autonomous materiality layer between raw ownership disclosures and human attention.**

### Memorable line
**Don't alert me when a filing appears. Alert me when the ownership change deserves attention.**

## 2. Why this is not a generic alert bot
Generic:
`new filing -> notification`

Our workflow:
`scheduled check -> deduplicate -> ownership-state delta -> relative-position change -> new/exit-position logic -> holder memory -> repeated-behavior escalation -> liquidity context -> explainable materiality -> explainable silence OR evidence-backed alert -> persistent run log`

The moat is not the notification channel. It is the combination of:

1. **Stateful escalation** — the same holder's repeated behavior changes how later events are interpreted.
2. **Explainable silence** — routine events are intentionally suppressed and the system can explain why.
3. **Attention metrics** — the product measures how many potential interruptions were avoided without hiding monitored events.
4. **Historical holder timeline** — every important event can be inspected in the context of the holder's prior behavior.

The core product question is:

> **What deserves human attention now?**

not merely:

> **What new data arrived?**

## 3. Core user
Primary user only:
**Equity researcher / serious research analyst covering a small watchlist of IDX companies.**

Do not expand MVP to portfolio management, trading, stock selection, chat, valuation, market news, or optimization.

## 4. MVP flow
### One-time setup
1. Open web app.
2. Add 3–10 IDX tickers.
3. Select alert level: MATERIAL only, or MATERIAL + STRUCTURAL.
4. Optionally connect Telegram.
5. Automation becomes ACTIVE.

### Autonomous cycle
GitHub Actions scheduled job
→ fetch latest Sectors filings
→ normalize + fingerprint
→ deduplicate
→ filter watchlist
→ load prior holder behavior/state
→ compute base materiality
→ compute repeat/escalation features
→ enrich only candidate events
→ recompute final materiality
→ persist ALL decisions, including SILENT and WATCH
→ SILENT/WATCH: no push, but keep explanation
→ MATERIAL/STRUCTURAL: push alert
→ update holder timeline/state
→ persist run statistics + attention metrics

### Dashboard
Show:
- automation ACTIVE
- last run
- next expected run
- scanned
- new
- suppressed from push
- WATCH
- MATERIAL
- STRUCTURAL
- **interruption reduction**
- **duplicate alert rate**
- **explainability coverage**
- estimated credits
- latency

The dashboard must make **silence visible as a deliberate product decision**, not as absence of data.

## 5. Recommended stack
- Next.js + TypeScript
- Supabase Postgres
- GitHub Actions cron
- Node/TypeScript worker in same repo
- Telegram Bot API
- Vitest
- Playwright only if time permits

Do not introduce microservices, Kafka, Redis unless necessary, Kubernetes, ML training, multi-agent systems, or vector DB.

## 6. Scheduler
Recommended weekday WIB schedule:
- 10:30
- 12:30
- 15:30
- 18:30

UTC cron:
`30 3,5,8,11 * * 1-5`

Allow `workflow_dispatch` for development, but final judging evidence must include real scheduled runs.

## 7. Sectors API contracts
### Filings — core
GET `https://api.sectors.app/v2/filings/`
Header: `Authorization: ${SECTORS_API_KEY}`

Documented:
- 1 credit/request
- max limit 30
- pagination via offset
- filters include symbol, dates, transaction_type, holder_type
- holder types include corporate-investor, insider, institution

Required fields:
- title
- body
- source
- timestamp
- sector
- sub_sector
- tags
- symbol
- transaction_type
- holder_type
- holder_name
- holding_before
- holding_after
- amount_transaction
- price
- transaction_value
- price_transaction
- share_percentage_before
- share_percentage_after
- share_percentage_transaction
- idx_investor_slug
- idx_conglomerates_group_slug

### Daily — context
GET `https://api.sectors.app/v2/daily/{symbol}/`

Documented:
- 1 credit/request
- max 90-day range
- fields: symbol, date, close, volume, market_cap

Use only for candidate events needing liquidity context.

## 8. Internal event model
Fields:
- eventFingerprint
- symbol
- sourceUrl
- timestamp
- holderName
- holderType
- transactionType
- holdingBefore
- holdingAfter
- sharesTransacted
- ownershipBeforePct
- ownershipAfterPct
- ownershipDeltaPp
- absOwnershipDeltaPp
- transactionValueIdr
- relativePositionChange
- newPosition
- nearExit
- repeatCount30d
- repeatCount90d
- repeatCount180d
- cumulativeSameDirectionDeltaPp180d
- previousHolderEventTimestamp
- previousMaterialityStateForHolder
- escalatedFromPriorState
- medianDailyLiquidityProxy20d
- transactionToLiquidityProxy
- materialityState
- decisionReasonCodes
- suppressionReasonCodes
- contextUnavailable

The model must support a historical holder timeline without rebuilding the story from free-text descriptions.

## 9. Deduplication
Preferred fingerprint:
1. source URL if stable
2. otherwise SHA-256 of:
   symbol + timestamp + holder_name + transaction_type + amount_transaction + holding_after

Unique DB index required.

Acceptance test:
same filing twice => one stored event and at most one push alert.

## 10. Materiality engine v1
States:
- SILENT
- WATCH
- MATERIAL
- STRUCTURAL

No opaque 0–100 score.

### Derived features
Ownership delta:
`ownership_after_pct - ownership_before_pct`

Absolute delta:
`abs(ownership_delta_pp)`

Relative position change:
`abs(shares_transacted) / holding_before`
only when holding_before > 0.

New position:
before ~= 0 and after > 0.

Near exit:
before > 0 and after/before <= 0.20.

Repeat behavior:
same symbol + normalized holder + same direction, calculated over 30 / 90 / 180-day windows.

Also calculate:
`cumulative_same_direction_delta_pp_180d`

This cumulative value is initially an **observability/calibration feature**, not a hard trigger unless authenticated data supports using it.

### Stateful escalation
Materiality must use prior behavior.

Required behavior example:

```text
Event 1: +0.18 pp, first occurrence
→ SILENT

Event 2: +0.21 pp, second same-direction event
→ WATCH

Event 3: +0.24 pp, third same-direction event
→ MATERIAL
```

The third event is not material because `+0.24 pp` is large in isolation. It is material because a repeated pattern has accumulated over time.

Persist enough state to explain this escalation deterministically.

Liquidity proxy:
`close * volume`

Median context:
median of last 20 valid daily liquidity proxy values.

Transaction-to-liquidity:
`transaction_value / median_daily_liquidity_proxy_20d`

Call this a **liquidity proxy**, never exact traded turnover.

## 11. Decision and suppression reason codes
### Structural
- STRUCTURAL_STAKE_SHIFT_GE_5PP
- NEAR_EXIT_POSITION

### Material
- LARGE_STAKE_MOVE_GE_1PP
- RELATIVE_POSITION_CHANGE_GE_10PCT
- NEW_NOTABLE_POSITION
- REPEATED_SAME_DIRECTION_GE_3
- TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY
- ESCALATED_BY_HOLDER_HISTORY

### Watch
- MODERATE_STAKE_MOVE_GE_0_25PP
- RELATIVE_POSITION_CHANGE_GE_5PCT
- REPEATED_SAME_DIRECTION_GE_2
- TRANSACTION_VALUE_GE_20PCT_MEDIAN_DAILY_PROXY

### Explainable-silence / suppression
Use explicit suppression reason codes so the user can inspect why no push was sent:
- SMALL_ABSOLUTE_CHANGE
- NO_REPEAT_PATTERN
- NO_NEW_OR_EXIT_POSITION
- NO_MATERIAL_LIQUIDITY_CONTEXT
- BELOW_PUSH_THRESHOLD
- INSUFFICIENT_CONTEXT_FOR_ESCALATION

A SILENT event should normally have at least one meaningful suppression reason.

Do not score buy as good or sell as bad.

## 12. Decision rules
STRUCTURAL if:
- abs delta >= 5 pp, OR
- near exit

MATERIAL if:
- any material-level reason, OR
- at least two independent WATCH dimensions

WATCH if:
- exactly one WATCH-level dimension

SILENT if:
- no WATCH/MATERIAL/STRUCTURAL condition is met.

### Stateful escalation rule
History is part of the decision, not merely decorative UI:
- second same-direction event within the configured lookback can create a WATCH-level repetition dimension;
- third same-direction event can create a MATERIAL-level repetition dimension;
- the evaluation must retain whether the event was **escalated by history**.

### Explainable silence rule
Every SILENT/WATCH event is still persisted.
If no external alert is sent, store:
- final state;
- suppression reason codes;
- the exact features evaluated;
- whether contextual enrichment was skipped to save credits.

Do not double-count reasons derived from the same variable.

## 13. Edge cases
Handle:
- null before/after percentages
- null transaction value
- null amount
- holding_before = 0
- holder-name normalization
- transaction_type others
- duplicate returns across cycles
- >30 filings and pagination
- 429
- 400
- timeout/5xx
- missing daily data
- timezone boundaries
- unexpected payloads

Missing context => explicit `contextUnavailable=true`.
Never fabricate.

## 14. Credit-aware routing
Every cycle:
1. fetch filings
2. dedup
3. filter watchlist
4. compute base features from filing only
5. call daily only for WATCH-or-higher candidates or ambiguous high-value events

Track estimated credits, latency, status, cache hits.

## 15. Pagination
Use limit=30.
Follow `pagination.has_next`.
Default hard cap: `MAX_FILINGS_PAGES_PER_RUN=3`.

If cap is reached while has_next=true:
- run status PARTIAL
- log operational warning
- never pretend all records were processed

## 16. Polling
Because filing filters are date-based:
- query current Jakarta date
- re-fetch same-day records if needed
- rely on fingerprint dedup
- optionally include prior Jakarta date on first morning cycle

Always preserve Sectors timestamp.

## 17. Database tables
### watchlists
id, name, created_at

### watchlist_symbols
id, watchlist_id, symbol, enabled

### filings
id, fingerprint UNIQUE, symbol, source_url, source_timestamp, holder_name, holder_type, transaction_type, holding_before, holding_after, shares_transacted, ownership_before_pct, ownership_after_pct, ownership_delta_pp, transaction_value_idr, raw_payload_json, created_at

### event_evaluations
id, filing_id, materiality_state, reason_codes_json, suppression_reason_codes_json, relative_position_change, new_position, near_exit, repeat_count_30d, repeat_count_90d, repeat_count_180d, cumulative_same_direction_delta_pp_180d, previous_materiality_state_for_holder, escalated_from_prior_state, median_daily_liquidity_proxy_20d, transaction_to_liquidity_proxy, context_unavailable, enrichment_skipped, engine_version, created_at

### alerts
id, filing_id, evaluation_id, channel, delivery_status, sent_at, external_message_id

### automation_runs
id, trigger_type, started_at, finished_at, status, pages_fetched, records_scanned, eligible_new_filings, new_events, silent_count, watch_count, material_count, structural_count, suppressed_from_push_count, alerts_sent, interruption_reduction, duplicate_alert_count, duplicate_alert_rate, explainability_coverage, estimated_credits, api_latency_ms_total, error_summary

### holder_activity_state
A compact state table for fast historical behavior lookup:
- id
- symbol
- normalized_holder_name
- last_transaction_type
- last_event_timestamp
- same_direction_count_30d
- same_direction_count_90d
- same_direction_count_180d
- cumulative_same_direction_delta_pp_180d
- latest_materiality_state
- updated_at

This table is a cache/derived state. The authoritative historical record remains `filings` + `event_evaluations`.

### api_call_logs
id, run_id, endpoint, requested_at, status_code, latency_ms, estimated_credit_cost, cache_hit, error

## 18. Alert and silence policy
Push only MATERIAL and STRUCTURAL.
WATCH and SILENT are persisted and visible in the app but generate no external push.

The product must be able to answer both:
- **Why did you alert me?**
- **Why did you stay silent?**

This is a core usability requirement, not a debugging feature.

Telegram format should include:
- state
- symbol
- holder
- factual transaction direction
- before -> after
- delta
- reason codes
- source timestamp
- app link
- disclaimer

Never include buy/sell recommendation, target price, bullish/bearish language, or expected return.

## 19. UI screens
1. Automation Dashboard
2. Material Alerts
3. Event Detail
4. Run History
5. Watchlist Setup
6. Suppressed Events / Attention Log

### Automation Dashboard
Must make attention allocation visible.

Example:
```text
Today
37 eligible ownership events

31 SILENT
4 WATCH
1 MATERIAL
1 STRUCTURAL

35 events did not interrupt you
Interruption Reduction: 94.6%
```

Do not display the percentage until computed from real run data.

Critical run timeline example:
10:30 ✓ 42 scanned · 0 pushed · 42 suppressed
12:30 ✓ 11 new · 0 pushed · 11 suppressed
15:30 ✓ 7 new · 1 MATERIAL · 6 suppressed
18:30 ✓ 4 new · 0 pushed · 4 suppressed

### Event Detail
In addition to the existing evidence, show a **Holder Behavior Timeline**:

```text
12 Aug  +0.18 pp  SILENT
27 Aug  +0.21 pp  WATCH
16 Sep  +0.24 pp  MATERIAL

Escalated because:
3 same-direction ownership increases within 180 days
```

### Suppressed Events / Attention Log
A user must be able to inspect a SILENT/WATCH event and see:
- what changed;
- final state;
- why no push was sent;
- suppression reason codes;
- whether enrichment was intentionally skipped;
- Sectors source timestamp.

This screen is the product proof for **explainable silence**.

## 19A. Attention intelligence metrics

These metrics are part of the product and demo, but **must only be shown after they are measured on real runs**.

### Interruption Reduction

```text
Interruption Reduction
= 1 - (push_alerts_sent / eligible_new_filings)
```

Where:
- `eligible_new_filings` = new, deduplicated filings that match the user's enabled watchlist and were actually evaluated;
- `push_alerts_sent` = MATERIAL + STRUCTURAL events that generated an external notification.

Do not use all market-wide filings as the denominator if the user only monitors a watchlist.

If denominator = 0, display `N/A`, not 100%.

### Duplicate Alert Rate

```text
Duplicate Alert Rate
= duplicate_push_alerts / total_push_alerts
```

Target: **0%**.

Repeated API returns of the same filing are expected; repeated human interruptions are not.

### Explainability Coverage

```text
Explainability Coverage
= explainable_push_alerts / total_push_alerts
```

An alert is explainable only if it has:
- Sectors provenance/source;
- source timestamp;
- at least one quantitative evidence feature;
- deterministic decision reason code(s).

Target: **100%** for MATERIAL/STRUCTURAL alerts.

### Suppressed Event Visibility

Track:
- SILENT count;
- WATCH count;
- how many suppressed decisions have persisted reason codes.

Do not call this "accuracy". There is no universal ground-truth label for financial materiality.

---

## 20. Historical replay
Create clearly labeled `HISTORICAL REPLAY`.

Preferred documented case:
NSSS.JK, 9 Jul 2026, Samuel Sekuritas Indonesia:
40.17% -> 42.73%, +2.56 pp, transaction value IDR 351,225,097,500, documented as fifth purchase in six months.

Replay is NOT proof of autonomous scheduling.
Final video must separately show real scheduled-run evidence.

## 21. Error handling
429:
bounded exponential backoff: 1s, 2s, 4s, max 3 tries.

5xx/network:
same bounded retry.

400:
do not blindly retry.

404 daily:
mark context unavailable, keep event ingestion.

## 22. Caching
Cache:
- 20-day liquidity history per symbol/date
- 180-day repeat-history bootstrap per symbol
- normalized historical filings

Do not refetch immutable history without reason.

## 23. Mandatory tests
Materiality:
1. 0.01 pp isolated => SILENT
2. 0.30 pp single => WATCH
3. 1.00 pp => MATERIAL
4. 5.00 pp => STRUCTURAL
5. 0 -> 0.33% new position => MATERIAL
6. 1.37 -> 0.93% => MATERIAL due to >10% relative reduction
7. repeat 2 + moderate stake change => MATERIAL if two independent WATCH dimensions
8. repeat 3 => MATERIAL
9. near exit => STRUCTURAL
10. missing fields => no fabricated values

Stateful escalation:
11. holder event +0.18 pp first occurrence => SILENT
12. same holder/direction +0.21 pp second occurrence in 180d => WATCH
13. same holder/direction +0.24 pp third occurrence in 180d => MATERIAL
14. different holder must not inherit another holder's repeat history
15. opposite transaction direction must not incorrectly increment same-direction streak
16. events outside lookback must not be counted

Explainable silence:
17. every SILENT event has persisted suppression reason(s)
18. a suppressed event can be reopened from UI/history with source timestamp intact
19. skipped enrichment is explicitly marked, not interpreted as zero context

Attention metrics:
20. interruption reduction uses real eligible-new-filings denominator
21. zero eligible filings does not divide by zero or display misleading percentage
22. duplicate alert rate counts duplicate pushes, not duplicate API records
23. explainability coverage only counts alerts with provenance + quantitative evidence + deterministic reason code

Dedup:
- same filing twice => one event
- same event across scheduled cycles => one alert

Credit routing:
- SILENT event => no daily enrichment
- candidate => daily at most once per symbol/date window

Integration:
- pagination
- 429 then success
- 429 max retries
- 400
- empty results
- malformed response
- partial run due page cap

Real API smoke tests should be controlled and not run on every CI push.

## 24. Acceptance criteria
MVP is not done until:
- scheduled GitHub Action exists
- at least 3 real unattended scheduled runs recorded
- app shows them
- real Sectors ingestion works
- pagination works
- dedup works
- routine filing suppression is demonstrated
- **stateful escalation works across multiple holder events**
- **every SILENT/WATCH decision is inspectable with suppression reasons**
- **holder behavior timeline is visible on relevant event detail**
- **interruption reduction is computed from real run data**
- **duplicate alert rate is measured and target is 0%**
- **explainability coverage is measured**
- one MATERIAL/STRUCTURAL historical event evaluates correctly
- reason codes visible
- provenance visible
- Telegram works or is cleanly optional
- errors do not crash the full run
- no repo secrets
- disclaimer present
- tests pass
- README explains methodology and limitations

## 25. Do not build
Cut unless everything above works:
- LLM chat
- thesis parser
- earnings analysis
- valuation
- foreign flow
- broker flow
- recommendation engine
- portfolio manager
- mobile app
- social feed
- prediction
- custom ML
- multiple alert channels
- elaborate auth

## 26. Suggested repository structure
/
├─ app/
│  ├─ page.tsx
│  ├─ alerts/
│  ├─ alerts/[id]/
│  ├─ runs/
│  └─ watchlist/
├─ components/
├─ lib/
│  ├─ sectors/
│  ├─ materiality/
│  ├─ db/
│  ├─ alerts/
│  └─ observability/
├─ scripts/
│  ├─ monitor.ts
│  ├─ bootstrap-history.ts
│  └─ historical-replay.ts
├─ supabase/migrations/
├─ tests/
├─ fixtures/
├─ .github/workflows/
├─ .env.example
├─ README.md
└─ package.json

## 27. Environment variables
SECTORS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MAX_FILINGS_PAGES_PER_RUN=3
APP_BASE_URL=

Never expose secrets client-side.

## 28. README must explain
- user/problem
- why raw filing alerts are insufficient
- why Sectors is core
- autonomous architecture
- materiality methodology
- **stateful escalation / holder memory**
- **explainable silence**
- **attention metrics and their exact formulas**
- **holder behavior timeline**
- reason codes
- liquidity proxy limitation
- credit-aware routing
- missing-data behavior
- unattended-run proof
- setup
- testing
- security
- disclaimer
- limitations
- screenshots

## 29. Codex implementation order
Phase 1 — Data core:
1. init repo
2. strict TypeScript
3. Sectors client
4. Zod schemas
5. normalized event
6. DB migrations
7. fingerprint/dedup
8. raw filing persistence
STOP + TEST

Phase 2 — Intelligence:
9. feature calculations
10. holder-history queries/state
11. stateful escalation logic
12. materiality engine
13. alert + suppression reason codes
14. attention metrics
15. unit tests
16. sequence tests for repeated holder behavior
17. NSSS fixture/replay
STOP + TEST

Phase 3 — Automation:
18. monitor worker
19. pagination
20. credit-aware enrichment
21. retries/error handling
22. run logging
23. attention-metric aggregation
24. holder-state update
25. scheduled GitHub workflow
STOP + PROVE UNATTENDED RUNS

Phase 4 — Output:
26. Telegram
27. automation/attention dashboard
28. alerts list/detail
29. suppressed-events attention log
30. holder behavior timeline
31. run history
32. watchlist
STOP + E2E

Phase 5 — Submission:
33. observability
34. polish
35. README
36. secret scan
37. screenshots
38. final test suite

## 30. Commit history target
Use incremental commits:
- chore: initialize track-2 monitoring app
- feat: add typed sectors v2 client
- feat: persist and deduplicate ownership filings
- test: add sectors filing contract fixtures
- feat: compute ownership materiality features
- feat: add holder behavior history and repeat-state queries
- feat: add stateful materiality escalation
- feat: add explainable materiality and suppression reasons
- test: cover silent watch material structural states
- test: cover multi-event holder escalation
- feat: add credit-aware daily liquidity enrichment
- feat: record autonomous monitoring runs
- feat: calculate attention and explainability metrics
- ci: schedule unattended weekday monitoring
- feat: deliver material alerts to telegram
- feat: add attention intelligence dashboard
- feat: add explainable silence log
- feat: add holder behavior timeline
- feat: add event evidence detail
- test: add end-to-end duplicate alert protection
- docs: explain methodology limitations and sectors dependency

## 31. Security checklist
- ignore .env
- server-only Sectors key
- GitHub Secrets for worker
- Supabase RLS if browser reads directly
- service role never client-side
- validate external payloads
- secret scan full git history
- safe external links

## 32. Demo requirements
0–20s: **attention problem**, not a technology intro  
Show that many ownership disclosures compete for a researcher's attention.

20–40s: explain why raw filing alerts are insufficient  
`New disclosure ≠ meaningful disclosure.`

40–70s: watchlist + ACTIVE scheduler  
Show the workflow is autonomous.

70–105s: real unattended run history + **explainable silence**  
Show a real run such as:
`37 eligible events → 31 SILENT → 4 WATCH → 1 MATERIAL → 1 STRUCTURAL`
Then briefly open one suppressed event and show why it did not interrupt the user.

105–140s: magic moment — **stateful escalation**  
Show a holder timeline where individually small events become meaningful through repeated behavior:
`SILENT → WATCH → MATERIAL`

140–158s: open the MATERIAL/STRUCTURAL event  
Show exact evidence, reason codes, timestamps, Sectors provenance, and liquidity context if used.

158–170s: architecture  
`schedule → Sectors → dedup → holder memory → materiality → silence/alert → persistent state`

170–177s: measured metrics only  
Use only real measurements such as:
- interruption reduction
- duplicate alert rate
- explainability coverage
- estimated credits
- median run latency

177–180s: memorable line  
**Don't alert me when data changes. Alert me when the change deserves attention.**

## 33. Current threshold-calibration status
Public proxy sanity-check distribution of absolute ownership-change magnitude:
- min 0.01 pp
- P25 ~0.235 pp
- median ~0.94 pp
- P75 ~4.265 pp
- P90 ~5.928 pp
- max 67.74 pp

This proxy is publication-selected, not an unbiased Sectors distribution.

Therefore 0.25 pp, 1 pp, and 5 pp are v1 engineering thresholds, not universal financial truths.
Do not claim false-positive rate, time savings, or alert-reduction percentage until measured on authenticated data.

## 34. Kill/modify conditions
KILL current formulation if:
- almost every filing becomes MATERIAL/STRUCTURAL
- tiny routine changes frequently alert
- stateful history does not change any meaningful decision
- explainable silence is just a cosmetic page with no real suppression logic
- missing fields make classification unreliable
- reason codes do not match human interpretation

MODIFY if:
- authenticated distribution shows thresholds are badly placed
- one feature dominates alerts
- liquidity proxy causes unstable upgrades
- repeat behavior is too sparse or overcounted
- interruption reduction looks high only because the watchlist/filter is artificially narrow
- holder timelines confuse rather than clarify the reason for escalation

Do not rescue weak logic with an LLM.

## 35. Championship definition of done
ONE USER
→ equity researcher

ONE PAINFUL JOB
→ repeated triage of ownership filings

ONE NON-OBVIOUS INSIGHT
→ a new filing is not automatically worthy of attention, and repeated small changes can become meaningful through history

ONE KILLER WORKFLOW
→ scheduled Sectors polling → holder memory → materiality triage → explainable silence/alert

ONE MAGIC MOMENT
→ individually small repeated holder actions escalate from SILENT → WATCH → MATERIAL, while the user can inspect why earlier events were intentionally suppressed

ONE MEMORABLE OUTPUT
→ an attention dashboard showing what the system ignored, what it escalated, and exactly why

## 36. Final instruction to Codex
Build the smallest stable application that satisfies this specification.

When forced to choose:
- reliability over feature count
- deterministic logic over generative AI
- traceable evidence over polished prose
- autonomous execution over manual interaction
- clear reason codes over black-box scores
- **memory over stateless thresholding**
- **explainable silence over notification spam**
- **measured attention savings over vague productivity claims**
- real Sectors calls over fake demo data

Do not broaden scope without explicit approval.
