# Sealed human evaluation

Evaluation date: 2026-09-30  
Frozen algorithm checkpoint: `925465b`  
Annotation commit: `bf2cc11`  
Dataset/clock/config: `sectors_persisted` / `first_persisted` / `default`

This evaluation reads the frozen `events.csv`; it does not replay or alter thresholds, baseline decisions, materiality rules, or production code. Consensus label 2 is the only positive interruption target. Labels 0 and 1 are negative for immediate push, while label 1 remains review-later/watch evidence.

## Validation

PASS: 117 rows, 117 unique input IDs, 351 complete labels restricted to {0,1,2}, exact input identity/order preserved against the blind factual file and every frozen system, and frozen evidence blob `13c42b8573054ffa5ae1f26d4f68a57cf10f836f` matches checkpoint `925465b`.

## Annotation reliability

| Reviewer | Label 0 | Label 1 | Label 2 |
| --- | ---: | ---: | ---: |
| reviewer_1 | 67 (57.27%) | 26 (22.22%) | 24 (20.51%) |
| reviewer_2 | 38 (32.48%) | 59 (50.43%) | 20 (17.09%) |
| reviewer_3 | 53 (45.30%) | 43 (36.75%) | 21 (17.95%) |

Exact 3-way agreement: **69/117 (58.97%)**.  
Fleiss kappa: **0.56593**.  
Disagreements spanning 0↔2: **0 events** and **0 pairwise occurrences**.

| Reviewer pair | Raw agreement | Cohen κ | Ordinal weighted κ (quadratic) | Weighted κ (linear, supplementary) | 0↔2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| reviewer_1-reviewer_2 | 78/117 (66.67%) | 0.500164 | 0.712748 | 0.599069 | 0 |
| reviewer_1-reviewer_3 | 84/117 (71.79%) | 0.546618 | 0.766749 | 0.655114 | 0 |
| reviewer_2-reviewer_3 | 93/117 (79.49%) | 0.677908 | 0.803526 | 0.734493 | 0 |

## Consensus

Simple-majority distribution: label 0 = **51**, label 1 = **48**, label 2 = **18**. Resolved = **117**; unresolved 0/1/2 ties = **0**.

Unresolved ties are excluded from TP/FP/FN/TN, precision, recall, and F1. They remain included in each frozen system’s total interruption count and are reported separately.

## Frozen-system evaluation

| System | Interruptions | TP | FP | FN | TN | Recall | Precision | F1 | Reduction vs B0 | Consensus-0 alerts | Consensus-1 alerts | Tie alerts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 | 117 | 18 | 99 | 0 | 0 | 100.00% | 15.38% | 0.266666 | 0.00% | 51 | 48 | 0 |
| B1 | 56 | 17 | 39 | 1 | 60 | 94.44% | 30.36% | 0.459459 | 52.14% | 13 | 26 | 0 |
| B2 | 64 | 18 | 46 | 0 | 53 | 100.00% | 28.13% | 0.439024 | 45.30% | 17 | 29 | 0 |
| B3 | 78 | 17 | 61 | 1 | 38 | 94.44% | 21.79% | 0.354167 | 33.33% | 24 | 37 | 0 |
| B3C | 59 | 17 | 42 | 1 | 57 | 94.44% | 28.81% | 0.441559 | 49.57% | 14 | 28 | 0 |

### Duplicate episode alerts

| System | Total | Legitimate MATERIAL→STRUCTURAL | Repeated same-state | Other same-episode re-alert |
| --- | ---: | ---: | ---: | ---: |
| B0 | 13 | 0 | 13 | 0 |
| B1 | 1 | 0 | 1 | 0 |
| B2 | 3 | 0 | 2 | 1 |
| B3 | 4 | 1 | 0 | 3 |
| B3C | 1 | 1 | 0 | 0 |

A duplicate is descriptive: another interruption in the same episode. Only `MATERIAL→STRUCTURAL` is classified here as the explicitly legitimate escalation; unchanged-state repeats are reported separately.

## Paired B1 vs B3C

Decision differences: **3**.

| input_id | Symbol | Current factual event | Reviewer labels | Consensus | B1 | B3C |
| --- | --- | --- | --- | ---: | --- | --- |
| 73119842-4640-4bf0-a7d0-cf32e5b103e9 | WINR.JK | Pemenang Nusantara Internasional sells shares of Winner Nusantara Jaya | 0/0/0 | 0 | SUPPRESS | INTERRUPT |
| 040e84f4-1613-4631-9409-8b71702b9f70 | SRTG.JK | Edwin Soeryadjaya buys shares of Saratoga Investama Sedaya | 0/1/1 | 1 | SUPPRESS | INTERRUPT |
| 06be04c1-e6f2-4828-b3c5-2bfd0cf8326b | IMPC.JK | Tunggal Jaya Investama buys shares of Impack Pratama Industri | 0/1/1 | 1 | SUPPRESS | INTERRUPT |

## Evidence-based dispositions

Predefined primary criterion: KEEP requires 100% consensus-class-2 recall and fewer interruptions than B0; MODIFY means non-zero but below-100% recall while reducing interruptions; KILL means zero recall or no interruption reduction. Precision and duplicate diagnostics are reported but do not override that criterion.

- **B1: MODIFY** — recall 94.44%, 56 interruptions, 52.14% reduction versus B0.
- **B2: KEEP** — recall 100.00%, 64 interruptions, 45.30% reduction versus B0.
- **B3: MODIFY** — recall 94.44%, 78 interruptions, 33.33% reduction versus B0.
- **B3C: MODIFY** — recall 94.44%, 59 interruptions, 49.57% reduction versus B0.

No thresholds, replay logic, baseline decisions, materiality rules, or production behavior were changed. No B4 was created.

Reproduce with `node --conditions=react-server --experimental-strip-types research/attention-benchmark/human-evaluation.ts`.
