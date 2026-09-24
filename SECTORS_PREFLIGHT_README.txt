# Sectors historical materiality preflight

Files:
- `historical_proxy_ownership_events_2026.csv`: 27 public Indonesian ownership-change events used only as a threshold sanity-check. This sample is publication-selected and must NOT be treated as the true Sectors filing distribution.
- `sectors_materiality_preflight.py`: authenticated extractor for real Sectors `/v2/filings/` data plus optional `/v2/daily/{symbol}/` enrichment.

Run locally:
1. Set `SECTORS_API_KEY` in your environment. Never commit the key.
2. Install `requests`.
3. Run:
   `python sectors_materiality_preflight.py --start 2026-01-01 --end 2026-09-22 --max-pages 4 --enrich-top 10`

Default estimated API budget:
- Up to 4 filing-page calls.
- Up to 10 daily enrichment calls.
- About 14 credits total, before retries, based on current public documentation.

Outputs:
- `preflight_output/filings_raw.json`
- `preflight_output/filings_materiality.csv`
- `preflight_output/materiality_summary.json`
