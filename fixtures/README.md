These are public documentation examples, NOT authenticated API captures:

- `filings.documented.json`: [Sectors filings](https://docs.sectors.app/api-references/v2/indonesia/news/filings), inspected 2026-09-24. Pagination intentionally preserves the documented example, including `limit=2` and one result.
- `daily.documented.json`: [Sectors daily](https://docs.sectors.app/api-references/v2/indonesia/transaction/daily), inspected 2026-09-24.

Tests alter these examples to exercise failures and overlapping windows. Those variants are synthetic.
The root CSV/JSON files supplied by the user are publication-selected public proxies, not Sectors contracts or live data. Their materiality labels are not used by Phase 1.
