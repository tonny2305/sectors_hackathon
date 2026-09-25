# Pre-annotation audit

Date: 2026-09-25
Dataset: `sectors_persisted`, first-persisted clock, default configuration
Scope: B1/B3C comparison and blind annotation readiness

## Comparison definitions

`b3c_worse_than_b1` contains an event ID when the same persisted event has `B1.interrupt = true` and `B3C.interrupt = false`. It means B3C would omit an interruption that B1 would send. It does not mean the event is human-labeled as bad, and it does not measure precision, recall, or investment significance.

`b3c_better_than_b1` contains an event ID when `B1.interrupt = false` and `B3C.interrupt = true`. It means B3C would interrupt on an event that B1 would suppress. It does not mean the interruption is human-validated as useful.

The generated results contain 0 B3C-worse-than-B1 events and 3 B3C-better-than-B1 events. These are decision-set differences only; no human labels are present.

## Three additional B3C interruptions

These are the exact three IDs in `b3c_better_than_b1`:

| Event ID | Filing facts available at evaluation | B3C transition and deterministic reason |
| --- | --- | --- |
| `v1:e48020c9c16e402c54b391cd65810631fd8b532b0fb5aa228eb612d8fb056bd5` | `WINR.JK`, Pemenang Nusantara Internasional, sell, 2026-09-22 16:41:17; ownership 47.14% -> 46.91%; delta -0.23 pp | Third same-direction event in the continuing episode; cumulative absolute movement 0.81 pp; `WATCH -> MATERIAL`. |
| `v1:0a26f51d437f306ef4aa676bb534d6ffd72357a19b6067748a2cc1296ff61b2a` | `SRTG.JK`, Edwin Soeryadjaya, buy, 2026-09-24 15:07:34; ownership 35.950% -> 35.956%; delta +0.006 pp | Third same-direction event in the continuing episode; cumulative absolute movement 0.021 pp; `WATCH -> MATERIAL`. |
| `v1:9531f5a7e98c315c481add32b75d6d06c0d1405acdc36b29fbff2c0bd3ba8899` | `IMPC.JK`, Tunggal Jaya Investama, buy, 2026-09-24 18:15:42; ownership 38.43% -> 38.46%; delta +0.03 pp | Third same-direction event in the continuing episode; cumulative absolute movement 0.04 pp; `WATCH -> MATERIAL`. |

The individual filings are small or below B1's static push threshold. B3C's additional interruptions are therefore stateful repeat-pattern escalations, not threshold changes.

## Duplicate episode audit

The single B3C row with `duplicate_interruption = true` is:

`v1:ea507351fc97bc004a02bfc5865739720fb83720e7a96a957789c4e4b72f2259`

It is the second event for `NSSS.JK` / Samuel Sekuritas Indonesia in the same episode:

- 2026-09-17: 20.42% -> 16.62%, -3.80 pp, `SILENT -> MATERIAL`, first alert.
- 2026-09-18: 16.62% -> 14.06%, -2.56 pp, `MATERIAL -> STRUCTURAL`, second alert, `episode_reset = CONTINUE`.

Classification: **intended escalation**. B3C explicitly permits a new interruption for `MATERIAL -> STRUCTURAL`. It is not a deterministic episode reset, and no implementation bug was found. The `duplicate_interruption` field is a descriptive same-episode re-alert flag; it does not assert that the second alert was erroneous.

## Blind annotation audit

`human-annotation.csv` has 117 rows and these fields only:

- filing identifiers and source timestamp/precision
- symbol, holder, direction, source URL
- ownership percentages and normalized ownership delta
- holdings, shares transacted, and transaction value

The normalized ownership delta is a factual arithmetic normalization of the filing's before/after percentages. It is not an engine classification or decision output.

The file contains no future timestamps or later outcomes, engine states, reason codes, episode IDs/counts, interrupt flags, escalation flags, baseline decisions, configuration IDs, system names, duplicate flags, or market outcomes. `human-annotations-template.csv` adds only three blank reviewer-label columns.

## Audit conclusion

No benchmark decisions, thresholds, or production behavior were changed. No implementation bug was found, so no fix was applied.

**Dataset status: READY for independent annotation.**

This readiness decision is limited to annotation blinding and data integrity. It does not establish that B3C is a good production policy; that requires independent labels and the planned evaluation.
