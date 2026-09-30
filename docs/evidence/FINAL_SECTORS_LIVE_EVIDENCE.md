# Final Sectors Live Evidence

Captured 2026-09-30. All timestamps below are UTC.

## Execution

The existing `.github/workflows/scheduled-monitor.yml` `workflow_dispatch` path was used. Both runs checked out `master` at `d0b34b626394eb99cc2670305e868f8fa8389454`. No code, thresholds, benchmarks, UI, or workflow configuration were changed for these runs. With no date inputs, the monitor used its default Jakarta date window, 2026-09-30.

The first run was the controlled production evidence run. One additional run was used for the requested idempotency proof. No other live Sectors monitoring runs were triggered.

| | Initial run | Idempotency rerun |
|---|---|---|
| GitHub Actions | [36745019877](https://github.com/tonny2305/sectors_hackathon/actions/runs/36745019877) | [36745471876](https://github.com/tonny2305/sectors_hackathon/actions/runs/36745471876) |
| Trigger | `workflow_dispatch` / `MANUAL_DISPATCH` | `workflow_dispatch` / `MANUAL_DISPATCH` |
| Head SHA | `d0b34b626394eb99cc2670305e868f8fa8389454` | `d0b34b626394eb99cc2670305e868f8fa8389454` |
| Actions start | 2026-09-30T16:33:02Z | 2026-09-30T16:36:47Z |
| Worker start / finish | 2026-09-30T16:33:24Z / 2026-09-30T16:33:32Z | 2026-09-30T16:37:06Z / 2026-09-30T16:37:11Z |
| Actions job finish | 2026-09-30T16:33:35Z | 2026-09-30T16:37:13Z |
| Persisted run ID | `510c7eb0-ee40-4943-993d-e690fab2acbb` | `75736994-4281-437d-abcc-922ca85ba7c5` |
| Persisted run interval | 2026-09-30T16:33:26.381039Z to 2026-09-30T16:33:31.604Z | 2026-09-30T16:37:07.653507Z to 2026-09-30T16:37:11.107Z |
| Run status | `COMPLETE`; Actions `success` | `COMPLETE`; Actions `success` |
| Sectors calls | 1; `/v2/filings/`; HTTP 200; 1 estimated credit | 1; `/v2/filings/`; HTTP 200; 1 estimated credit |
| API-call log ID | `b25f6c6b-4ae6-4d62-9ba7-23c03bc2aeda` | `c24b9ca7-d174-4c33-8343-6031223ae315` |
| Pages / scanned | 1 / 18 | 1 / 18 |
| New / deduplicated filings | 9 / 9 | 0 / 18 |
| Eligible evaluations | 1 | 0 |
| SILENT / WATCH / MATERIAL / STRUCTURAL | 0 / 0 / 1 / 0 | 0 / 0 / 0 / 0 |
| Alert rows created / alerts sent | 1 / 0 | 0 / 0 |
| Run error | none | none |

Deduplicated counts are `records_scanned - new_events`. The rerun returned the same 18 filing records and inserted none.

## Persisted Evidence

The initial run inserted these nine filing rows (filing ID, symbol, source timestamp):

- `e166703f-33e3-4c24-b41d-d1dc3dec8c20` — `PKPK.JK` — `2026-09-30T15:01:11`
- `afd6f813-4965-4ec3-86aa-0d6ec1652acc` — `BACH.JK` — `2026-09-30T19:18:52`
- `b2108218-9b89-4fb2-b94c-105a83dbd465` — `TRIN.JK` — `2026-09-30T17:11:51`
- `408f75db-4caa-49a2-ac22-ac5b9efb2266` — `TRIN.JK` — `2026-09-30T17:07:11`
- `9f90f11c-c401-4625-a250-670f5162c857` — `NSSS.JK` — `2026-09-30T16:44:45`
- `df4b7d0b-3eb8-4c3d-8d03-f44aa38c5be3` — `PEGE.JK` — `2026-09-30T16:31:23`
- `9e3e9bb9-ad51-4a8f-b270-a4ecc6555bae` — `SRTG.JK` — `2026-09-30T16:18:23`
- `53694c19-6f83-49f2-9994-ae4b83a47b33` — `RLCO.JK` — `2026-09-30T15:59:24`
- `3ffe24db-803d-4a8e-ba2c-93f7f4a98b9f` — `PKPK.JK` — `2026-09-30T15:01:11`

The sole eligible evaluation is `561bb2fe-3620-4276-8748-51716ee59fc0`, for filing `9f90f11c-c401-4625-a250-670f5162c857` (`NSSS.JK`). It persisted as `MATERIAL`, engine version `v2.0.0-materiality-sentinel`, with reasons `LARGE_STAKE_MOVE_GE_1PP`, `RELATIVE_POSITION_CHANGE_GE_10PCT`, `REPEATED_SAME_DIRECTION_GE_3`, and `ESCALATED_BY_HOLDER_HISTORY`.

Its alert row is `5bcadd2d-a96f-4f1d-9659-d7d29baca4f7`, channel `telegram`, status `PENDING`, `sent_at = null`. Telegram delivery was not required for this evidence run and no Telegram success is claimed.

## Idempotency

For the nine filings inserted during the initial run, persisted counts before and after the rerun were unchanged:

| Record type | Before | After |
|---|---:|---:|
| Filing rows | 9 (9 unique fingerprints) | 9 (9 unique fingerprints) |
| Current-engine evaluation rows | 1 | 1 |
| Alert rows | 1 | 1 |

The filing ID, evaluation ID, and alert ID remained the same. The rerun reported `new_events = 0` and `eligible_new_filings = 0`; its single Sectors request returned HTTP 200. Idempotency was demonstrated. Database constraints also enforce unique filing fingerprints, one evaluation per filing and engine version, and one alert per filing.

## SEALED-B2 Policy Lineage

Both Actions runs checked out the same production `master` SHA, `d0b34b626394eb99cc2670305e868f8fa8389454`. The sealed-B2 commit `e798f8727f4b90cb0c7d368510c92851c3d46737` is an ancestor of that SHA (`git merge-base --is-ancestor` exit code `0`). The persisted evaluation records `v2.0.0-materiality-sentinel` and the materiality decision/reason codes above. This ties the live evidence to the sealed-B2 production lineage; no policy code was changed for the run.

## Telegram Work Preservation

Before the live runs, existing Telegram hardening was committed separately as `8f0c1e9` (`Hold Telegram delivery hardening`) on branch `telegram-hardening-hold`. It was not merged or deployed. `AGENTS.md` and `CLAUDE.md` remain untracked and untouched.
