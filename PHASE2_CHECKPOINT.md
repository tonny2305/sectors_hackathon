# Phase 2 Checkpoint — 24 September 2026

## A. Implemented in Phase 2

| Module / File | Responsibility |
| --- | --- |
| `lib/materiality/types.ts` | Complete TypeScript type contracts for materiality states (`SILENT`, `WATCH`, `MATERIAL`, `STRUCTURAL`), all decision reason codes, suppression reason codes, feature interfaces, and attention metrics. |
| `lib/materiality/features.ts` | Deterministic base feature calculations: ownership delta ($\text{pp}$), relative position change ($\%/\text{ratio}$), new notable position ($0 \rightarrow >0$), near exit ($\le 20\%$ remaining), 20-day median daily liquidity proxy (`close * volume`), and transaction-to-liquidity ratio. |
| `lib/materiality/holder-history.ts` | Multi-window holder memory engine (30d, 90d, 180d), same-direction streak isolation, cumulative same-direction delta tracker, and chronological lookback boundaries. |
| `lib/materiality/engine.ts` | Central 4-state evaluation engine implementing multi-dimensional decision rules, automatic stateful escalation, and explainable silence suppression reason assignment. |
| `lib/materiality/metrics.ts` | Strict mathematical computation of attention intelligence metrics: *Interruption Reduction* ($1 - \text{push} / \text{eligible}$), *Duplicate Alert Rate* ($\text{dup} / \text{total}$), *Explainability Coverage*, and suppressed event distribution. |
| `lib/materiality/replay.ts` | Historical replay runner and state accumulator for sequence simulation and case study validation. |
| `lib/db/store.ts` | Extended Supabase PostgREST persistence methods for saving structured event evaluations, querying historical holder records, and recording automated run statistics. |
| `tests/materiality.test.ts` | 13 comprehensive unit tests covering the 4 materiality states, threshold edges, missing/null field safety, and liquidity proxy impact. |
| `tests/escalation.test.ts` | 6 unit tests covering the complete stateful escalation lifecycle (`SILENT` $\rightarrow$ `WATCH` $\rightarrow$ `MATERIAL`), different-holder isolation, direction switching, and 180-day lookback expiration. |
| `tests/metrics.test.ts` | 4 unit tests validating mathematical attention metric formulas, zero-denominator edge cases, and provenance requirements. |
| `tests/replay.test.ts` | End-to-end replay verification of the documented NSSS.JK / Samuel Sekuritas Indonesia 5-event accumulation sequence. |

---

## B. Materiality Classification Matrix

| Dimension | `STRUCTURAL` | `MATERIAL` | `WATCH` | `SILENT` / Suppression |
| :--- | :--- | :--- | :--- | :--- |
| **Stake Magnitude** | $\ge 5.0\,\text{pp}$ | $\ge 1.0\,\text{pp}$ | $\ge 0.25\,\text{pp}$ | $< 0.25\,\text{pp}$ (`SMALL_ABSOLUTE_CHANGE`) |
| **Relative Position** | — | $\ge 10\%$ relative | $\ge 5\%$ relative | $< 5\%$ |
| **Lifecycle** | Near Exit ($\le 20\%$ remain) | New Notable Position ($0 \rightarrow >0$) | — | Routine holding adjustment |
| **Holder Memory** | — | Repeat count $\ge 3$ in 180d | Repeat count $= 2$ in 180d | Single occurrence (`NO_REPEAT_PATTERN`) |
| **Liquidity Context** | — | $\ge 50\%$ 20d median proxy | $\ge 20\%$ 20d median proxy | $< 20\%$ or context unavailable |

### Decision Rules:
1. **`STRUCTURAL`**: Stake shift $\ge 5\,\text{pp}$ OR Near Exit ($\le 20\%$ remaining).
2. **`MATERIAL`**: Any single Material-level dimension, OR $\ge 2$ independent Watch-level dimensions (e.g., Moderate move $\ge 0.25\,\text{pp}$ + Repeat count $= 2$).
3. **`WATCH`**: Exactly 1 Watch-level dimension. Suppressed from external push notification (`BELOW_PUSH_THRESHOLD`).
4. **`SILENT`**: No threshold crossed. Suppressed from external push notification with complete transparent suppression reason codes.

---

## C. Stateful Escalation & Holder Memory Proof

The stateful escalation engine was verified against the exact specification requirements:

```text
Event 1: +0.18 pp (first occurrence in 180d)
  -> Classification: SILENT
  -> Suppression: [BELOW_PUSH_THRESHOLD, SMALL_ABSOLUTE_CHANGE, NO_REPEAT_PATTERN]

Event 2: +0.21 pp (second same-direction event in 180d)
  -> Classification: WATCH
  -> Reason Code: [REPEATED_SAME_DIRECTION_GE_2]
  -> Suppression: [BELOW_PUSH_THRESHOLD, SMALL_ABSOLUTE_CHANGE]

Event 3: +0.24 pp (third same-direction event in 180d)
  -> Classification: MATERIAL (ESCALATED)
  -> Reason Codes: [REPEATED_SAME_DIRECTION_GE_3, ESCALATED_BY_HOLDER_HISTORY]
  -> Features: repeatCount180d=3, cumulativeDelta=0.63 pp, escalatedFromPriorState=true
```

Isolations verified:
- **Holder Isolation**: Different holders never inherit another entity's repeat sequence.
- **Direction Isolation**: Opposite transactions (`sell` after `buy`) do not increment same-direction streaks.
- **Lookback Boundary**: Events older than 180 days from the source date are strictly excluded.

---

## D. Attention Intelligence Metrics Formulas

The metrics module implements the exact formulas required by Track 2:

1. **Interruption Reduction**:
   $$\text{Interruption Reduction} = 1 - \frac{\text{Push Alerts Sent}}{\text{Eligible New Filings}}$$
   *(Returns `null` / `N/A` if `eligible_new_filings = 0` to prevent misleading 100% or divide-by-zero).*

2. **Duplicate Alert Rate**:
   $$\text{Duplicate Alert Rate} = \frac{\text{Duplicate Push Alerts}}{\text{Total Push Alerts}}$$
   *(Target: $0\%$. Measures prevented human interruptions, not raw API deduplication).*

3. **Explainability Coverage**:
   $$\text{Explainability Coverage} = \frac{\text{Explainable Push Alerts}}{\text{Total Push Alerts}}$$
   *(Requires: Sectors provenance + ISO timestamp + $\ge 1$ quantitative evidence feature + deterministic reason code. Target: $100\%$).*

---

## E. Test & Quality Suite Results

Executed on Windows with Node 24:

| Test File | Tests | Result | Coverage |
| :--- | :--- | :--- | :--- |
| `tests/materiality.test.ts` | 13 | PASS | 4 materiality states, boundaries, missing field safety, liquidity enrichment |
| `tests/escalation.test.ts` | 6 | PASS | Stateful sequence escalation, holder isolation, direction reset, 180d lookback |
| `tests/metrics.test.ts` | 4 | PASS | Interruption reduction, duplicate alert rate, explainability coverage, 0 denominator |
| `tests/replay.test.ts` | 1 | PASS | Documented NSSS.JK 5th purchase case study replay |
| `tests/client.test.ts` | 36 | PASS | API schema parsing, 3-attempt bounded retries, 429 backoff, audit logs |
| `tests/security.test.ts` | 3 | PASS | Server-only boundary, secret exclusion, names-only environment template |
| `tests/persistence.test.ts` | 12 | PASS | PostgreSQL WASM (PGlite) migration, RLS, atomic RPC, alert uniqueness |
| **Total** | **75** | **PASS (100%)** | Full test suite passing |

Command verification:
- `npm.cmd test`: **75 passed (7 test files)**
- `npm.cmd run typecheck`: **0 errors (Strict TypeScript)**
- `npm.cmd run build`: **Compiled successfully (Turbopack + Next.js App Router)**

---

## F. Status & Handoff to Phase 3

**Phase 2 is COMPLETE and VERIFIED.**

Next steps for **Phase 3 (Automation Layer)**:
1. Implement the autonomous monitor worker script (`scripts/monitor.ts`) integrating:
   - Polling Sectors filings API for active watchlist symbols.
   - Deduplicating via fingerprint.
   - Loading prior holder activity state from Supabase.
   - Running the Phase 2 materiality engine.
   - Credit-aware conditional `/daily/` enrichment only for candidate events.
   - Persisting evaluations, updating `holder_activity_state`, and writing `automation_runs` metrics.
2. Build the GitHub Actions unattended cron workflow (`.github/workflows/scheduled-monitor.yml`).
