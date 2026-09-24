#!/usr/bin/env python3
"""
Sectors Hackathon 2026 - Historical filings extraction + materiality distribution preflight.

Purpose:
- Pull real historical /v2/filings/ records from the team's Sectors account.
- Compute explainable materiality states for Track 2 Automation & Workflows.
- Optionally enrich the top ownership-change events with /v2/daily/{symbol}/
  to calculate a liquidity-impact PROXY using close * volume.

IMPORTANT:
- This is a research/monitoring heuristic, not financial advice.
- Materiality thresholds are v1 preflight thresholds, not empirically final.
- close * volume is a turnover proxy, not exact traded value/VWAP turnover.
- Never paste your API key into source code. Set SECTORS_API_KEY in the environment.
"""

import argparse
import csv
import json
import math
import os
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import requests

BASE_URL = "https://api.sectors.app"
FILINGS_PATH = "/v2/filings/"
DAILY_PATH = "/v2/daily/{symbol}/"

def api_get(session, api_key, path, params=None, retries=3, timeout=30):
    url = BASE_URL + path
    headers = {"Authorization": api_key}
    last_error = None
    for attempt in range(retries):
        t0 = time.perf_counter()
        try:
            r = session.get(url, headers=headers, params=params, timeout=timeout)
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            if r.status_code == 429:
                last_error = RuntimeError(f"429 rate limit: {r.text[:200]}")
                time.sleep(min(2 ** attempt, 8))
                continue
            r.raise_for_status()
            return r.json(), latency_ms
        except Exception as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"GET failed {path}: {last_error}")

def safe_float(x):
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None

def compute_base_features(rec):
    before = safe_float(rec.get("share_percentage_before"))
    after = safe_float(rec.get("share_percentage_after"))
    trans_pp = safe_float(rec.get("share_percentage_transaction"))
    holding_before = safe_float(rec.get("holding_before"))
    amount_transaction = safe_float(rec.get("amount_transaction"))
    transaction_value = safe_float(rec.get("transaction_value"))

    if trans_pp is not None:
        delta_pp = trans_pp
        # Preserve direction when possible.
        if before is not None and after is not None:
            delta_pp = after - before
        elif rec.get("transaction_type") == "sell":
            delta_pp = -abs(trans_pp)
        else:
            delta_pp = abs(trans_pp)
    elif before is not None and after is not None:
        delta_pp = after - before
    else:
        delta_pp = None

    abs_delta_pp = abs(delta_pp) if delta_pp is not None else None

    relative_position_change = None
    if holding_before and amount_transaction is not None and holding_before > 0:
        relative_position_change = abs(amount_transaction) / holding_before

    new_position = bool(
        before is not None and after is not None and before <= 1e-9 and after > 0
    )
    near_exit = bool(
        before is not None and after is not None and before > 0 and after / before <= 0.20
    )

    return {
        "before_pct": before,
        "after_pct": after,
        "delta_pp": delta_pp,
        "abs_delta_pp": abs_delta_pp,
        "relative_position_change": relative_position_change,
        "new_position": new_position,
        "near_exit": near_exit,
        "transaction_value_idr": transaction_value,
    }

def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def attach_repeat_counts(records):
    """
    Count same symbol + holder + direction occurrences within 180 days in the pulled sample.
    This is sample-dependent: pulling too few pages may undercount history.
    """
    groups = defaultdict(list)
    for i, r in enumerate(records):
        key = (
            (r.get("symbol") or "").upper(),
            (r.get("holder_name") or "").strip().lower(),
            (r.get("transaction_type") or "").strip().lower(),
        )
        groups[key].append((i, parse_ts(r.get("timestamp"))))

    counts = [1] * len(records)
    for key, items in groups.items():
        for idx, ts in items:
            if ts is None:
                counts[idx] = len(items)
                continue
            c = 0
            for _, ts2 in items:
                if ts2 is not None and abs((ts - ts2).days) <= 180:
                    c += 1
            counts[idx] = max(c, 1)
    return counts

def classify_materiality(features, repeat_count=1, liquidity_ratio=None):
    """
    Explainable v1 classification.
    States are operational monitoring states, NOT investment recommendations.
    """
    absd = features.get("abs_delta_pp")
    relpos = features.get("relative_position_change")
    newpos = features.get("new_position", False)
    nearexit = features.get("near_exit", False)

    reasons = []

    if absd is not None:
        if absd >= 5:
            reasons.append("STRUCTURAL_STAKE_SHIFT_GE_5PP")
        elif absd >= 1:
            reasons.append("LARGE_STAKE_MOVE_GE_1PP")
        elif absd >= 0.25:
            reasons.append("MODERATE_STAKE_MOVE_GE_0_25PP")
        else:
            reasons.append("SMALL_STAKE_MOVE_LT_0_25PP")

    if relpos is not None:
        if relpos >= 0.10:
            reasons.append("RELATIVE_POSITION_CHANGE_GE_10PCT")
        elif relpos >= 0.05:
            reasons.append("RELATIVE_POSITION_CHANGE_GE_5PCT")

    if newpos and (features.get("after_pct") or 0) >= 0.25:
        reasons.append("NEW_NOTABLE_POSITION")

    if nearexit:
        reasons.append("NEAR_EXIT_POSITION")

    if repeat_count >= 3:
        reasons.append("REPEATED_SAME_DIRECTION_GE_3")
    elif repeat_count >= 2:
        reasons.append("REPEATED_SAME_DIRECTION_GE_2")

    if liquidity_ratio is not None:
        if liquidity_ratio >= 0.50:
            reasons.append("TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY")
        elif liquidity_ratio >= 0.20:
            reasons.append("TRANSACTION_VALUE_GE_20PCT_MEDIAN_DAILY_PROXY")

    # State hierarchy
    if nearexit or (absd is not None and absd >= 5):
        state = "STRUCTURAL"
    elif (
        (absd is not None and absd >= 1)
        or ("NEW_NOTABLE_POSITION" in reasons)
        or (relpos is not None and relpos >= 0.10)
        or repeat_count >= 3
        or (liquidity_ratio is not None and liquidity_ratio >= 0.50)
    ):
        state = "MATERIAL"
    elif (
        (absd is not None and absd >= 0.25)
        or (relpos is not None and relpos >= 0.05)
        or repeat_count >= 2
        or (liquidity_ratio is not None and liquidity_ratio >= 0.20)
    ):
        state = "WATCH"
    else:
        state = "SILENT"

    return state, reasons

def fetch_filings(session, api_key, start, end, max_pages=4, page_size=30):
    all_rows = []
    latencies = []
    credit_calls = 0

    for page in range(max_pages):
        params = {
            "start": start,
            "end": end,
            "limit": page_size,
            "offset": page * page_size,
        }
        payload, latency = api_get(session, api_key, FILINGS_PATH, params=params)
        credit_calls += 1
        latencies.append(latency)
        rows = payload.get("results", [])
        all_rows.extend(rows)

        pagination = payload.get("pagination", {})
        if not pagination.get("has_next") or len(rows) == 0:
            break

    return all_rows, credit_calls, latencies

def daily_liquidity_proxy(session, api_key, symbol, event_date, lookback_days=35):
    """
    Returns median(close * volume) for records before/on event date.
    This is intentionally labelled a PROXY, not exact exchange turnover.
    """
    event_dt = datetime.fromisoformat(event_date[:10])
    start_dt = event_dt - timedelta(days=lookback_days)
    params = {
        "start": start_dt.strftime("%Y-%m-%d"),
        "end": event_dt.strftime("%Y-%m-%d"),
    }
    payload, latency = api_get(
        session, api_key, DAILY_PATH.format(symbol=symbol), params=params
    )
    vals = []
    for x in payload:
        close = safe_float(x.get("close"))
        volume = safe_float(x.get("volume"))
        if close is not None and volume is not None:
            vals.append(close * volume)
    if not vals:
        return None, latency
    return statistics.median(vals[-20:]), latency

def percentile(sorted_vals, p):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals)-1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c-k) + sorted_vals[c] * (k-f)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2026-01-01")
    ap.add_argument("--end", default="2026-09-22")
    ap.add_argument("--max-pages", type=int, default=4,
                    help="Each filings page is one API call/credit according to docs.")
    ap.add_argument("--page-size", type=int, default=30)
    ap.add_argument("--enrich-top", type=int, default=10,
                    help="Fetch daily market context for top N abs ownership-delta events. 1 credit each.")
    ap.add_argument("--out-dir", default="preflight_output")
    args = ap.parse_args()

    api_key = os.getenv("SECTORS_API_KEY")
    if not api_key:
        print("ERROR: SECTORS_API_KEY is not set.", file=sys.stderr)
        print("Set it in your local environment. Do NOT hard-code it into this file.", file=sys.stderr)
        sys.exit(2)

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    session = requests.Session()

    records, filing_calls, filing_latencies = fetch_filings(
        session, api_key, args.start, args.end, args.max_pages, args.page_size
    )

    (out / "filings_raw.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    repeat_counts = attach_repeat_counts(records)
    processed = []

    for rec, repeat_count in zip(records, repeat_counts):
        feat = compute_base_features(rec)
        row = {
            "timestamp": rec.get("timestamp"),
            "symbol": rec.get("symbol"),
            "holder_name": rec.get("holder_name"),
            "holder_type": rec.get("holder_type"),
            "transaction_type": rec.get("transaction_type"),
            "holding_before": rec.get("holding_before"),
            "holding_after": rec.get("holding_after"),
            "amount_transaction": rec.get("amount_transaction"),
            **feat,
            "repeat_count_180d_in_sample": repeat_count,
            "liquidity_proxy_idr": None,
            "transaction_to_liquidity_proxy": None,
            "source": rec.get("source"),
            "title": rec.get("title"),
        }
        processed.append(row)

    # Enrich only the largest ownership changes to protect the credit budget.
    eligible = [
        i for i, x in enumerate(processed)
        if x["abs_delta_pp"] is not None and x.get("symbol") and x.get("timestamp")
    ]
    eligible.sort(key=lambda i: processed[i]["abs_delta_pp"], reverse=True)
    enrich_idx = eligible[: max(args.enrich_top, 0)]

    daily_calls = 0
    daily_latencies = []
    for i in enrich_idx:
        row = processed[i]
        try:
            proxy, latency = daily_liquidity_proxy(
                session, api_key, row["symbol"], row["timestamp"]
            )
            daily_calls += 1
            daily_latencies.append(latency)
            row["liquidity_proxy_idr"] = proxy
            tv = row.get("transaction_value_idr")
            if proxy and tv is not None:
                row["transaction_to_liquidity_proxy"] = tv / proxy
        except Exception as exc:
            row["liquidity_enrichment_error"] = str(exc)

    for row in processed:
        state, reasons = classify_materiality(
            row,
            repeat_count=row.get("repeat_count_180d_in_sample", 1),
            liquidity_ratio=row.get("transaction_to_liquidity_proxy"),
        )
        row["materiality_state_v1"] = state
        row["reason_codes"] = "|".join(reasons)

    csv_path = out / "filings_materiality.csv"
    fields = sorted({k for r in processed for k in r.keys()})
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(processed)

    absd = sorted([
        r["abs_delta_pp"] for r in processed if r["abs_delta_pp"] is not None
    ])
    state_counts = Counter(r["materiality_state_v1"] for r in processed)

    summary = {
        "window": {"start": args.start, "end": args.end},
        "records_pulled": len(records),
        "api_calls_estimated": {
            "filings": filing_calls,
            "daily_enrichment": daily_calls,
            "total": filing_calls + daily_calls,
        },
        "latency_ms": {
            "filings_median": statistics.median(filing_latencies) if filing_latencies else None,
            "daily_median": statistics.median(daily_latencies) if daily_latencies else None,
        },
        "abs_ownership_delta_pp": {
            "count": len(absd),
            "min": min(absd) if absd else None,
            "p25": percentile(absd, .25),
            "median": percentile(absd, .50),
            "p75": percentile(absd, .75),
            "p90": percentile(absd, .90),
            "max": max(absd) if absd else None,
        },
        "materiality_state_counts_v1": dict(state_counts),
        "notes": [
            "Thresholds are preflight heuristics, not financial recommendations.",
            "Repeat count is limited by the number/date range of filings pages pulled.",
            "Liquidity context uses close*volume as a proxy, not exact traded value.",
            "Review top MATERIAL/STRUCTURAL and a sample of SILENT events manually before locking thresholds."
        ],
    }

    (out / "materiality_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nSaved: {csv_path}")
    print(f"Saved: {out / 'materiality_summary.json'}")
    print(f"Saved: {out / 'filings_raw.json'}")

if __name__ == "__main__":
    main()
