# SIGNALKEEPER Product V2 — Minimum Viable Delta

## Decision

**Proceed with an archive-backed ownership-intelligence surface, while leaving the production monitoring core sealed.**

The production checkpoint is `645abca`. Its autonomous monitor, Supabase persistence, B2 materiality engine, sealed 117-event evaluation, idempotency, watchlist, and Telegram delivery are retained as-is. Product V2 does **not** change a production table, migration, engine threshold, alert rule, or scheduler.

The V2 public exploration experience uses the frozen archival holdout only. It is visibly labeled:

> Historical Sectors archive — 900 observed ownership disclosures, 3 Jul–30 Sep 2026. Not live coverage; not used to operate or calibrate monitoring.

This is accurate for the harvested, bounded 30-page slice: 900 unique events across 179 symbols, observed date coverage 2026-07-03 through 2026-09-30. It is not the entire endpoint corpus and must not be presented as such.

## Product

### Primary user

An Indonesian equity researcher, journalist, governance researcher, or engaged minority shareholder who needs to inspect disclosed ownership changes without turning every disclosure into an investment call.

### Job to be done

When an ownership disclosure changes, help me understand who gained or lost ownership influence in an Indonesian public company, what the disclosed records say changed, whether the holder-company pair has repeated activity, and whether I should give it immediate attention.

### Problem statement

Sectors ownership disclosures contain the facts, but a raw filing list makes the researcher reconstruct before/after stakes, compare events, recognize recurring holder activity, and read the disclosure context manually. The current product instead foregrounds internal B2 states (`SILENT`, `WATCH`, `MATERIAL`, `STRUCTURAL`), interruption accounting, and run evidence. Those are useful operations evidence, but they are not the clearest ownership-intelligence product.

### Value proposition

**Understand who is gaining or losing ownership influence — and what actually happened behind the percentage change.**

SIGNALKEEPER turns raw ownership disclosures into understandable ownership changes, remembers holder behavior, and escalates only what deserves attention. It provides factual disclosure analysis, not a prediction, recommendation, sentiment judgment, misconduct accusation, legal-violation score, or reporting-lateness judgment.

## Exact information architecture

Only these four destinations are in the public navigation.

| Route | Capability | Data source | Required behavior |
|---|---|---|---|
| `/` | Ownership Signals Feed | Static archive artifact | Show the historical/archive banner, signal badges, symbol/company, holder, before → after, signed delta, disclosed date, and links to detail. Filter only by native URL search parameters if needed (`badge`, `symbol`); no new client state library. |
| `/signals/[id]` | Event Detail | Static archive artifact | Show company/symbol, holder, before → after, signed delta, factual badges, raw disclosed transaction context, templated factual explanation, link to the holder timeline, and source/provenance. |
| `/holders/[pairId]` | Holder Timeline | Static archive artifact | Show every observed event for one normalized holder + symbol pair in chronological order, including each before → after, signed delta, and badges. State observed archive coverage; do not imply earlier or live history. |
| `/watchlist` | Personal Monitoring + Telegram | Existing Supabase reads and existing delivery architecture | Show watched symbols and a concise statement that watched live disclosures continue through the existing monitor and may be sent to Telegram when the sealed B2 triage queues an alert. This is personal monitoring, not a feed ranking or advice screen. |

`/alerts`, `/alerts/[id]`, `/suppressed`, and `/runs` remain deployed but unlinked operational/evidence routes. They are not part of the V2 information architecture. Keeping them avoids breaking existing Telegram inspection links and preserves production evidence.

## Reused baseline

- Reuse the existing root layout, responsive CSS conventions, accessibility affordances (skip link, focus styling, semantic lists), `percent`, `delta`, `number`, and Jakarta-time formatting helpers.
- Reuse the visual chronology structure in `HolderTimeline`, but remove B2 state language from the V2 timeline. V2 shows source-derived badges instead.
- Reuse `WatchlistClient`, the server-only `readEvidence` helper, the guarded watchlist API, and the existing Supabase read path for `/watchlist`.
- Keep `normalizeHolder` only for deterministic holder-pair keys in archive compilation. Do not change its production behavior.
- Keep all Sectors client, monitor, store, B2, delivery, Telegram, security, workflow, migration, and sealed-evaluation code untouched.

## New derived-data layer

### Artifact decision

Compile the frozen archive into **one checked-in static derived JSON artifact**: `public/data/signalkeeper-archive.v1.json`.

This is the lowest-risk Vercel option. A static file requires no database migration, no ingestion job, no runtime Sectors call, no Vercel cron, and no service role to render the three archive routes. The source JSONL is about 1.04 MB; a necessary-detail projection is estimated at about 0.95 MB before formatting. That is a modest static asset for a 900-event championship demo and safer than duplicating a frozen corpus into production Supabase tables.

Do **not** import the archive into Supabase. Doing so would create a provenance/source-separation problem, could be mistaken for live monitoring data, and adds an avoidable migration/import/rollback surface. No new migration is necessary.

### Compiler and artifact contract

Add a one-purpose offline compiler, `scripts/build-signalkeeper-archive.ts`. It accepts the read-only archive JSONL from the archival ref and writes the artifact; it is not invoked by the monitor, Vercel runtime, tests for B2, or CI production workflow. The committed artifact is what Vercel serves.

The artifact shape is:

```ts
type ArchiveArtifact = {
  schemaVersion: 'signalkeeper-archive.v1';
  provenance: {
    corpusClass: 'POST_FREEZE_ARCHIVAL_HOLDOUT';
    sourceRef: 'sectors-archive-20260930';
    sourcePath: 'research/sectors-archive/ownership-unique.jsonl';
    rawSha256: string;
    observedStart: '2026-07-03';
    observedEnd: '2026-09-30';
    eventCount: 900;
    live: false;
  };
  events: ArchiveSignalEvent[];
  timelines: Record<string, { pairId: string; symbol: string; holderName: string; eventIds: string[] }>;
};

type ArchiveSignalEvent = {
  id: string;                 // stable content hash prefixed archive:v1:
  pairId: string;             // stable hash of normalized holder + symbol
  companyName: string | null; // parsed only from the disclosure title grammar
  title: string;
  body: string;
  sourceUrl: string;
  timestamp: string;          // preserved source timestamp; no invented timezone
  sourceDate: string;
  symbol: string;
  holderName: string;
  holderType: string;
  transactionType: 'buy' | 'sell' | 'others';
  holdingBefore: number;
  holdingAfter: number;
  ownershipBeforePct: number;
  ownershipAfterPct: number;
  signedDeltaPp: number;
  sharesTransacted: number;
  price: number | null;
  transactionValueIdr: number | null;
  priceTransactions: Array<{ date: string; type: string; price: number | null; amountTransacted: number }>;
  tags: string[];
  sector: string;
  subSector: string;
  badges: SignalBadge[];
  specialContextMatches: string[];
  pairEventCount: number;
};
```

`companyName` is extracted only from the two observed Sectors title grammars, `… shares of {company}` and `Change in {holder}'s position in {company}`. The compiler must set it to `null` if neither parser matches; the detail view then shows the source title and symbol rather than inventing a company name. The audit found these two grammars cover the archive’s titles.

At runtime, a small server-only archive reader exposes only `listSignals`, `getSignal`, and `getTimeline`. It reads the artifact; it has no Supabase, Sectors, or B2 dependency. This is intentionally a presentation data layer, not another materiality engine.

### Required guardrail

The compiler’s only runnable check is an assertion-based test that verifies: 900 events; the exact observed dates; unique event and pair IDs; signed delta equals `after - before`; each event’s badge list matches the definitions below; and the artifact provenance says `live: false`. The B2 sealed test remains unchanged and is run alongside it.

## Exact factual badge definitions

Badges are independently computed, non-exclusive labels. They are not priority scores, recommendations, or new B2 states. A badge is shown only when all fields in its definition are present and satisfy it.

| Badge | Exact definition | Detail copy |
|---|---|---|
| Crossed 5% | `(before < 5 && after >= 5) || (before >= 5 && after < 5)` | “The disclosed stake crossed the 5% ownership line.” |
| Large Shift | `abs(after - before) >= 5` percentage points | “The disclosed ownership percentage changed by at least 5 percentage points.” |
| New Position | `holdingBefore === 0 && holdingAfter > 0` | “The disclosure records a move from zero to a positive holding.” |
| Full Exit | `holdingBefore > 0 && holdingAfter === 0` | “The disclosure records a move from a positive holding to zero.” |
| Near Exit | `holdingBefore > holdingAfter && holdingAfter > 0 && after < 1` | “The holding declined and the disclosed post-event ownership is below 1%.” |
| Repeated Activity | The archive contains at least two events for the exact `(symbol, normalizeHolder(holderName))` pair, including this event. | “This holder-company pair has {pairEventCount} observed archive disclosures.” |
| Special Context | At least one approved raw tag is present, or title/body contains an approved raw phrase (case-insensitive). | “The disclosure includes the shown raw context label; it is not an inference about intent or legality.” |

Approved Special Context tags: `repurchase-agreement`, `takeover`, `capital-restructuring`, `free_float_compliance`, `placement`, `share-transfer`, `mesop`.

Approved raw phrases: `share borrowing`, `securities borrowing`, `securities lending`, `return of borrowed shares`, `repo`, `collateral`, `voluntary tender offer`, `controlling`.

The compiler stores which tag/phrase matched. The UI must display those exact matches, not broaden them to claims such as “controller,” “pledged,” “manipulative,” or “late.” `transaction_type: others` alone never receives Special Context.

## Event-detail content contract

The factual explanation is template-based and derived from rendered fields, for example:

> On 30 Sep 2026, Budi Kurniawan disclosed a buy in BACH.JK. The reported holding moved from 1.70% to 1.78% (+0.08 pp). This holder-company pair has 2 observed archive disclosures.

Append badge sentences only when their predicates are true, and quote/label raw context as “The disclosure states: …” or “Sectors tag: …”. Never generate prose with an LLM.

The detail must also display the preserved disclosure title and body, transaction type, holder type, shares transacted, reported price/value where present, individual disclosed transaction rows, tags, original source URL, source timestamp as provided, archive coverage, artifact version, and event ID. This gives the user the raw context behind the percentage change.

## Copy changes

| Surface | Replace with |
|---|---|
| Brand | `SIGNALKEEPER` / `Ownership intelligence` |
| Main heading | `Understand who is gaining or losing ownership influence.` |
| Feed support | `What actually changed in the disclosed stake — with holder history and source context.` |
| Archive label | `Historical Sectors archive · 900 observed disclosures · 3 Jul–30 Sep 2026 · Not live monitoring coverage` |
| Watchlist heading | `Your monitored companies` |
| Watchlist support | `Personal monitoring stays active for these symbols. Telegram may deliver the existing B2-triaged alerts; it is a delivery channel, not an ownership recommendation.` |
| Footer | `Sectors-sourced ownership disclosures. Historical archive shown where labeled. Information only; no investment, legal, or compliance judgment.` |

Remove from V2 navigation and product copy: “attention desk,” “priority queue,” “silence has its reasons,” “interruption reduction,” “material/structural,” “engine learns,” and any claim that a schedule proves live coverage. Retain delivery and run evidence only on unlinked operational routes.

## Telegram and watchlist

The current chain remains unchanged:

```text
Personal watchlist → existing scheduled monitor → sealed B2 evaluation → persisted alert → atomic Telegram claim → SENT / FAILED / UNKNOWN evidence
```

`/watchlist` should reuse its persisted watched-symbol list and add an unambiguous delivery note. It should not show archive events as live watchlist matches, compute new alert thresholds, or expose an admin token in the public UI. Existing Telegram links continue targeting `/alerts/[id]`; that legacy route remains hidden rather than being rewritten during this two-day delta.

## Implementation tasks

| # | Task | Depends on | Estimate | Failure risk | Rollback |
|---:|---|---|---:|---|---|
| 1 | Freeze the archive input reference/hash in the compiler header; compile and inspect the one static artifact. | none | 2 h | Low — wrong source/ref or accidental live labeling. | Delete artifact and compiler; no data was written. |
| 2 | Add pure archive reader/types plus the assertion test for provenance, IDs, deltas, badges, and timelines. | 1 | 2.5 h | Low — deterministic projection bug. | Remove V2 reader/routes; B2 is untouched. |
| 3 | Replace `/` with the archive-labeled Signals Feed and native query-string filters. | 2 | 2 h | Medium — confusing archive/live presentation. | Restore current `app/page.tsx` from `645abca`; legacy routes still work. |
| 4 | Add archive Event Detail and Holder Timeline routes; reuse presentation and timeline layout primitives. | 2 | 3.5 h | Medium — missing/raw-field rendering or unsafe source link. | Remove both routes and their links; artifact is inert. |
| 5 | Modify navigation, layout metadata, footer, and CSS only enough to expose the four-destination IA and badge styles. | 3, 4 | 2 h | Low — navigation regression. | Restore the four shell files from checkpoint. |
| 6 | Reframe `/watchlist` as personal monitoring + Telegram, without touching APIs or delivery. | none | 1 h | Low — copy could imply delivery certainty. | Restore page copy; delivery remains unchanged. |
| 7 | Hide operational links; retain old routes; run archive assertion, sealed B2, typecheck, full tests, and production build. | 1–6 | 2 h | Medium — static bundle/route build issue. | Revert V2 files only; checkpoint behavior remains. |

**Total: 15 hours** (one engineer, within a two-day 16-hour budget). Reserve the remaining hour for visual QA on a mobile-width feed and a deployed Vercel preview.

### Dependency graph

```text
frozen archival ref + raw hash
             │
             ▼
static archive compiler ──► static JSON artifact ──► archive reader + assertion
                                                        ├─► Signals Feed (/)
                                                        ├─► Event Detail (/signals/[id])
                                                        └─► Holder Timeline (/holders/[pairId])

existing watchlist read ───────────────────────────────────► Watchlist + Telegram (/watchlist)

existing monitor/B2/store/Telegram ─────────────────────────► unchanged, hidden operational routes
```

## Strict implementation table

| Change | KEEP/MODIFY/ADD/HIDE/KILL | User value | Engineering cost | Risk | Decision |
|---|---|---|---:|---|---|
| `app/page.tsx` attention dashboard | MODIFY | Becomes the single ownership signals feed users came to inspect. | M | Archive/live confusion | Replace its body; do not call B2 data. |
| `app/alerts/page.tsx` priority-alert feed | HIDE | Preserves operational evidence without presenting B2 states as the product. | S | Existing bookmark expectation | Remove navigation only. |
| `app/alerts/[id]/page.tsx` legacy event evidence | HIDE | Keeps existing Telegram inspection links valid. | S | Two event-detail presentations briefly coexist | Do not change in V2. |
| `app/suppressed/page.tsx` | HIDE | Removes internal silence triage from public IA. | S | None; route remains direct-accessible | Unlink, do not delete. |
| `app/runs/page.tsx` | HIDE | Removes operations evidence from the product narrative. | S | None; route remains direct-accessible | Unlink, do not delete. |
| `app/watchlist/page.tsx` | MODIFY | Frames watchlist and Telegram as personal monitoring. | S | Overclaiming delivery | Copy-only plus optional existing-status read. |
| `app/watchlist/WatchlistClient.tsx` | KEEP | Existing list and disabled-public-admin behavior are sufficient. | S | Legacy unused editor code remains | Do not expand admin controls. |
| `app/layout.tsx` | MODIFY | Brand/metadata reflect SIGNALKEEPER. | S | Metadata regression | Copy and title only. |
| `app/manifest.ts` | MODIFY | Installed-app identity matches the product. | S | Stale client manifest cache | Name/description only. |
| `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` | KEEP | Existing route safety and loading behavior remain useful. | S | Brand wording stale | Only edit wording if visibly legacy. |
| `components/Navbar.tsx` | MODIFY | Exposes exactly Feed, Watchlist; timeline/detail are contextual routes. | S | Missed legacy link | Remove alerts/suppressed/runs links. |
| `components/Footer.tsx` | MODIFY | Accurate archive/provenance disclaimer. | S | Misleading live claim | Use approved copy only. |
| `components/Evidence.tsx` `Empty`/`ReadError` | KEEP | Reuses accessible empty/error states. | S | None | Reuse unchanged. |
| `components/Evidence.tsx` B2 `State`, `EventList`, `Reasons`, run components | HIDE | Keeps legacy evidence routes intact without exposing B2 as V2 logic. | S | Shared import coupling | Do not delete/refactor now. |
| `components/HolderTimeline.tsx` | MODIFY | Delivers chronological holder-company history. | M | B2 labels leak into V2 | Reuse structure; drive only archive badges and coverage copy. |
| `app/globals.css` | MODIFY | Adds badge and archive-banner styling using existing responsive system. | M | Mobile layout regression | Small additive rules; visual QA. |
| `lib/presentation.ts` number/percent/delta/timestamp | KEEP | Correct signed deltas and display values without duplicate formatting code. | S | Timestamp source lacks timezone | Preserve source timestamp where required. |
| `app/read-evidence.ts` | KEEP | Continues safe server-side watchlist reads. | S | Service-role availability | Do not use for archive routes. |
| `app/api/watchlist/route.ts` | KEEP | Existing guarded personal monitoring management remains. | S | Existing implementation behavior | No V2 change. |
| `app/api/alerts`, `app/api/suppressed`, `app/api/runs` | HIDE | Retains existing integrations/evidence with no public navigation. | S | External caller change if deleted | Keep unchanged. |
| `app/api/health/route.ts` | KEEP | Operations health remains available to operators. | S | Public configuration leakage is existing scope | No V2 change. |
| `app/api/monitor/run/route.ts` | KEEP | Manual recovery path remains protected. | S | Scope creep | No V2 change. |
| `lib/sectors/schemas.ts`, `client.ts`, `normalize.ts` | KEEP | Retains validated upstream ingestion and normalization. | S | Archive compiler accidentally couples to live client | Compiler reads frozen raw only. |
| `lib/db/store.ts` and all existing Supabase tables | KEEP | Preserves persistence, idempotency, and audit evidence. | S | Archive contamination | No archive import or table write. |
| `supabase/migrations/202609240001_data_core.sql` | KEEP | Existing production schema stays stable. | 0 | Schema drift | No new migration. |
| `supabase/verify_security.sql` | KEEP | Existing security review remains applicable. | 0 | None | No change. |
| `lib/materiality/engine.ts`, `features.ts`, `holder-history.ts`, `metrics.ts`, `types.ts`, `replay.ts` | KEEP | Preserves frozen B2 behavior and 117-event result. | 0 | Accidental use by V2 | V2 has a separate artifact reader only. |
| `lib/automation/monitor.ts` and `scripts/monitor.ts`/`ingest.ts` | KEEP | Autonomous upstream monitoring continues. | 0 | Scope creep | No change. |
| `lib/alerts/delivery.ts`, `telegram.ts`, `scripts/deliver-telegram.ts` | KEEP | Keeps atomic, evidence-backed personal delivery. | 0 | Broken old detail link if rewritten | Do not rewrite URLs in V2. |
| `lib/auth/bearer.ts` | KEEP | Preserves protected writes/triggers. | 0 | None | No change. |
| `.github/workflows/scheduled-monitor.yml` | KEEP | Keeps the one existing scheduler; avoids duplicate Vercel scheduling. | 0 | Duplicate monitor if changed | No change. |
| Existing tests, especially `production-b2.test.ts` and sealed fixture | KEEP | Proves V2 did not destabilize frozen core. | S | Unnoticed regression if skipped | Run unchanged. |
| `scripts/build-signalkeeper-archive.ts` | ADD | Reproducible archival projection and provenance. | M | Wrong derivation or input ref | Assertion test + raw hash; never production runtime. |
| `public/data/signalkeeper-archive.v1.json` | ADD | Fast, fully labeled, demo-ready exploration dataset. | M | Large or stale asset | Versioned filename and metadata; remove to roll back. |
| `lib/archive/signalkeeper.ts` (reader/types) | ADD | One deterministic archive access seam for three routes. | M | Over-abstraction | Limit exports to list/detail/timeline reads. |
| `app/signals/[id]/page.tsx` | ADD | Required factual event detail. | M | Wrong provenance/details | Render artifact fields verbatim; test known event. |
| `app/holders/[pairId]/page.tsx` | ADD | Required chronological holder timeline. | M | Claims pre-archive history | Coverage banner and exact artifact event count. |
| Archive assertion test | ADD | Detects badge/provenance/timeline corruption. | S | Test drift | Keep it data-contract-only, no B2 dependency. |
| Importing archive into Supabase | KILL | None beyond an unnecessary duplicate store. | L | Highest: provenance confusion, migration/import failure | Static artifact replaces it. |
| Vercel cron/Sectors fetch for V2 | KILL | None; GitHub Actions already owns monitoring. | M | Duplicate live monitoring/cost | Keep Vercel read-only. |
| Chatbot, LLM summary, prediction, sentiment, advice, accusation, legal score, lateness score | KILL | Violates product constraints and adds unverifiable claims. | 0 | Product/safety risk | Do not add. |

## Acceptance checks

1. The V2 navigation exposes only Feed and Watchlist; detail and timeline are reachable contextually.
2. Every archive page carries the historical coverage label and never says live, current, learned, predicted, suspicious, compliant, or late.
3. Every event detail has symbol, company name or source title fallback, holder, before → after, signed delta, badges, raw context, factual template text, timeline link, and source/provenance.
4. The watchlist page says Telegram is a delivery channel and never promises a delivery.
5. `npm test`, including the unchanged sealed `production-b2.test.ts`; `npm run typecheck`; and `npm run build` pass.
6. No new migration, no change under `supabase/migrations`, no B2 source/test fixture modification, no Sectors runtime call from archive routes, and no production data write occur.

IMPLEMENTATION GO
