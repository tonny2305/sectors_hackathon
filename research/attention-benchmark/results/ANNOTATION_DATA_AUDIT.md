# Annotation data audit

Date: 2026-09-25

- Current persisted events: 117
- First-persisted future leakage violations: 0
- Prior-history rows with 0 records: 79
- Prior-history rows with 1 record: 17
- Prior-history rows with 2 records: 11
- Prior-history rows with 3 records: 10
- others events with raw source body/purpose context: 12
- Non-zero deltas checked after display formatting: 173
- Non-zero deltas displayed as zero: 0
- Prohibited decision columns: none

The current-event columns contain persisted filing identity, source timestamp and precision, symbol, holder, raw transaction type, raw source title/body when present, source ownership/holding/transaction facts, and source URL. Prior columns contain the same raw factual fields requested for up to three earlier filings for the same symbol and holder.

Prior context was admitted only when its source timestamp was earlier than the current event and its persisted availability time was no later than the current event's first-persisted evaluation time. Same-source-time events were not treated as prior.

The blind files contain no future filings or market outcomes, engine labels, baseline decisions, materiality states, reason codes, episode or cumulative fields, regulatory classifications, or alert flags. The reviewer template adds only blank reviewer label columns.

Status: READY for independent human annotation.
