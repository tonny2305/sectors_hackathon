# Frozen B2 history ablation proof

## Scope and reproducibility

This is a deterministic, offline replay of the sealed `tests/production-b2-sealed.json` fixture. It makes no Sectors or external API calls, changes no B2 code, threshold, fixture, score, or label, and does not use the 900-event archive. Both arms invoke the same frozen `evaluateEvent` path with `enrichmentSkipped: true`; the sole changed input is `priorHolderEvents`.

Run:

```powershell
node --conditions=react-server --experimental-strip-types scripts/history-ablation-proof.ts
```

The script constructs separately cloned copies of the same raw current payload, asserts equality of their JSON byte sequence and normalized values, restores only the fixture's recorded `prior_event_ids` and frozen B2 prior states in the history arm, and prints the terminal summary.

## Identity check

The requested `NSSS.JK` event with an approximately `+0.87pp` move exists in the frozen fixture, but its holder is **Samuel Sekuritas Indonesia**, not Samuel Tumbuh Bersama. The frozen fixture contains no `NSSS.JK` / `Samuel Tumbuh Bersama` event with that delta. This proof therefore does not relabel or manufacture a Tumbuh Bersama case; it proves the genuine frozen `+0.87pp` event below.

## Primary genuine frozen event

- Fixture input ID: `6fac06d9-1aca-4d59-8e02-a89de00dfaaf`
- Source timestamp: `2026-09-24T09:12:50`
- Frozen B2 state: `MATERIAL`; replay matches its state, reasons, suppression reasons, and `repeat_count_180d`.

| Input | Event-only | Event + history |
| --- | --- | --- |
| Symbol | `NSSS.JK` | `NSSS.JK` |
| Holder | `Samuel Sekuritas Indonesia` | `Samuel Sekuritas Indonesia` |
| Timestamp | `2026-09-24T09:12:50` | `2026-09-24T09:12:50` |
| Transaction type | `buy` | `buy` |
| Ownership before / after | `21.64%` / `22.51%` | `21.64%` / `22.51%` |
| Signed / absolute delta | `+0.8700pp` / `0.8700pp` | `+0.8700pp` / `0.8700pp` |
| Holdings before / after | `5,151,407,000` / `5,358,739,600` | `5,151,407,000` / `5,358,739,600` |
| Shares transacted | `207,332,600` | `207,332,600` |
| Reported delta / transaction value | `+0.87pp` / `IDR 157,572,776,000` | `+0.87pp` / `IDR 157,572,776,000` |
| Relative position change | `0.040248` | `0.040248` |
| New position / near exit | `false` / `false` | `false` / `false` |
| Liquidity feature values | median `null`; ratio `null`; context unavailable `true` | median `null`; ratio `null`; context unavailable `true` |
| Enrichment skipped | `true` | `true` |
| Prior holder events supplied | `0` | `5` frozen records |
| Repeat count (30d / 90d / 180d) | `1 / 1 / 1` | `3 / 3 / 3` |
| Cumulative same-direction delta, 180d | `0.8700pp` | `8.7040pp` |
| Previous holder event timestamp | `null` | `2026-09-23T10:48:40` |
| Previous holder B2 state | `null` | `STRUCTURAL` |
| Escalated from prior state | `false` | `true` |
| Final state / decision | `WATCH` / not interrupting | `MATERIAL` / interrupting |
| Exact decision reason codes | `MODERATE_STAKE_MOVE_GE_0_25PP` | `REPEATED_SAME_DIRECTION_GE_3`, `MODERATE_STAKE_MOVE_GE_0_25PP`, `ESCALATED_BY_HOLDER_HISTORY` |
| Exact suppression reason codes | `BELOW_PUSH_THRESHOLD`, `NO_REPEAT_PATTERN`, `NO_NEW_OR_EXIT_POSITION`, `NO_MATERIAL_LIQUIDITY_CONTEXT`, `INSUFFICIENT_CONTEXT_FOR_ESCALATION` | none |

The restored records are the fixture's actual five prior holder-company events: `2026-09-17T17:05:55` sell `-3.8000pp` (`MATERIAL`), `2026-09-18T17:20:54` sell `-2.5600pp` (`MATERIAL`), `2026-09-21T16:41:44` buy `+1.7740pp` (`MATERIAL`), `2026-09-21T16:41:44` sell `-0.2540pp` (`MATERIAL`), and `2026-09-23T10:48:40` buy `+6.0600pp` (`STRUCTURAL`). No record was created or altered. Only the two preceding buys contribute to the same-direction count.

### Verification

1. **Current-event equality:** PASS. The script asserts equal JSON serialization for the cloned raw payloads and fully value-equal normalized events. The table shows all event-derived policy features are equal.
2. **Only historical state differs:** PASS. The only invocation difference is the `priorHolderEvents` array. All changed evaluated features are history features: repeat counts, cumulative same-direction delta, previous timestamp/state, and escalation flag.
3. **Decision differs:** PASS — `WATCH` becomes `MATERIAL`.
4. **Exact escalation cause:** `repeatCount180d` becomes `3`, satisfying the frozen `REPEATED_SAME_DIRECTION_GE_3` branch. That material reason changes the final state and adds `ESCALATED_BY_HOLDER_HISTORY`. The prior materiality state and cumulative delta are recorded context; neither is independently tested by the escalation predicate.

## Two additional genuine fixture examples

The fixed 117-event B2 fixture was replayed offline for this evidence sweep; 17 events change state under the event-only ablation. The following two are reported as genuine examples, not used to tune any decision.

| Fixture ID | Same current facts | Event-only | Event + history | History-only change and causal code |
| --- | --- | --- | --- | --- |
| `9beeb763-ea48-4787-8958-d82200b24893` | `NSSS.JK`, Samuel Sekuritas Indonesia, `2026-09-21T16:41:44`, sell, `15.834% -> 15.58%`, `-0.2540pp`, relative `0.015610`, no lifecycle/liquidity feature | `WATCH`; `MODERATE_STAKE_MOVE_GE_0_25PP` | `MATERIAL`; `REPEATED_SAME_DIRECTION_GE_3`, `MODERATE_STAKE_MOVE_GE_0_25PP`, `ESCALATED_BY_HOLDER_HISTORY` | repeat 180d `1 -> 3`; cumulative `0.2540 -> 6.6140pp`; previous `2026-09-18T17:20:54` / `MATERIAL`; exact cause is the `>=3` repetition branch |
| `67d85a40-1431-48ef-9413-ab664cf74241` | `AKPI.JK`, Henry Liem, `2026-09-23T11:28:47`, sell, `1.256% -> 1.182%`, `-0.0740pp`, relative `0.058555`, no lifecycle/liquidity feature | `WATCH`; `RELATIVE_POSITION_CHANGE_GE_5PCT` | `MATERIAL`; `RELATIVE_POSITION_CHANGE_GE_5PCT`, `REPEATED_SAME_DIRECTION_GE_2`, `ESCALATED_BY_HOLDER_HISTORY` | repeat 180d `1 -> 2`; cumulative `0.0740 -> 0.0790pp`; previous `2026-09-22T10:00:00` / `SILENT`; two active watch dimensions, including holder repetition, trigger escalation |

ABLATION RESULT: PASS

The factual frozen `+0.87pp` NSSS event changes decision solely from restored legitimate holder-company history. The holder-name mismatch in the original request is separately documented above and has not been silently corrected in the data.
