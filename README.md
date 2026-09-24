# Autonomous Ownership Materiality Sentinel

> **Sectors Hackathon 2026 — Track 2: Automation & Workflows**  
> *An autonomous materiality & attention intelligence layer between raw IDX ownership disclosures and human attention.*

---

## 1. Product Thesis & Problem

### The Problem
Financial markets do not only have a data problem; they have an **attention-allocation problem**.

An equity researcher covering Indonesian listed companies (IDX) should not have to manually inspect dozens of routine insider and major-shareholder filings every day just to determine whether anything meaningful occurred. Raw alerts notify whenever a filing appears (`New filing -> notification`), causing alert fatigue because most disclosures represent routine, small, or administrative holding changes.

### The Solution: Autonomous Materiality Sentinel
The Sentinel acts as an autonomous triage layer:
$$\text{Scheduled Sectors Polling} \longrightarrow \text{Fingerprint Dedup} \longrightarrow \text{Holder Memory (180d)} \longrightarrow \text{Multi-Dimensional Materiality} \longrightarrow \text{Explainable Silence} \text{ OR } \text{Evidence-Backed Alert}$$

The product is valuable both when it **alerts** and when it **chooses to stay silent**.

---

## 2. Championship Moats (v2 Core Features)

1. **Stateful Escalation (Holder Memory)**:
   Per-holder activity is tracked across 30, 90, and 180-day lookback windows. Small, routine events that are negligible in isolation escalate automatically when repeated in the same direction:
   $$\text{Event 1: } +0.18\,\text{pp} \rightarrow \mathbf{SILENT} \quad\Longrightarrow\quad \text{Event 2: } +0.21\,\text{pp} \rightarrow \mathbf{WATCH} \quad\Longrightarrow\quad \text{Event 3: } +0.24\,\text{pp} \rightarrow \mathbf{MATERIAL}$$

2. **Explainable Silence**:
   Routine filings ($\text{SILENT}$ and $\text{WATCH}$) are intentionally suppressed from external notifications, but every decision is persisted in the database with transparent suppression reason codes (`SMALL_ABSOLUTE_CHANGE`, `NO_REPEAT_PATTERN`, `BELOW_PUSH_THRESHOLD`, etc.) so researchers can inspect why no alert was sent.

3. **Attention Intelligence Metrics (Measured on Real Runs)**:
   - **Interruption Reduction**: $1 - (\text{Push Alerts Sent} / \text{Eligible New Filings})$ (Target: $\ge 90\%$).
   - **Duplicate Alert Rate**: $\text{Duplicate Push Alerts} / \text{Total Push Alerts}$ (Target: $0\%$).
   - **Explainability Coverage**: $\text{Explainable Push Alerts} / \text{Total Push Alerts}$ (Target: $100\%$).

4. **Historical Holder Behavior Timeline**:
   Every material alert detail view includes an interactive chronological timeline showing the entity's sequential disclosures, volume changes, and state transitions over the preceding 180 days.

---

## 3. Architecture & Data Flow

```
                     ┌────────────────────────────────────────┐
                     │    GitHub Actions Scheduled Cron       │
                     │  (10:30, 12:30, 15:30, 18:30 WIB)      │
                     └──────────────────┬─────────────────────┘
                                        │
                                        ▼
                     ┌────────────────────────────────────────┐
                     │    Sectors Filings API (/v2/filings/)  │
                     └──────────────────┬─────────────────────┘
                                        │
                                        ▼
                     ┌────────────────────────────────────────┐
                     │  Atomic Ingest & Fingerprint Dedup     │
                     │   (SHA-256 Tuple in PostgreSQL RPC)    │
                     └──────────────────┬─────────────────────┘
                                        │
                                        ▼
                     ┌────────────────────────────────────────┐
                     │      Watchlist Scope Filtering         │
                     └──────────────────┬─────────────────────┘
                                        │
                                        ▼
                     ┌────────────────────────────────────────┐
                     │   Stateful Holder Memory Evaluation    │
                     │   (30d / 90d / 180d Lookback Query)    │
                     └──────────────────┬─────────────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │ Credit-Aware Routing          │
                        ▼                               ▼
            [SILENT (Skip /daily/)]       [WATCH/Candidate (Fetch /daily/)]
                        │                               │
                        └───────────────┬───────────────┘
                                        │
                                        ▼
                     ┌────────────────────────────────────────┐
                     │     4-State Materiality Classifier     │
                     │   SILENT | WATCH | MATERIAL | STRUCT   │
                     └──────────────────┬─────────────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                        ▼                               ▼
           [SILENT / WATCH (Suppressed)]    [MATERIAL / STRUCTURAL]
                        │                               │
                        ▼                               ▼
           [Explainable Silence Log]       [Telegram Push Dispatcher]
                        │                               │
                        └───────────────┬───────────────┘
                                        │
                                        ▼
                     ┌────────────────────────────────────────┐
                     │   Persist Runs & Attention Metrics     │
                     └────────────────────────────────────────┘
```

---

## 4. Materiality Decision Matrix & Reason Codes

| Level | Criteria | Reason Codes | Action |
| :--- | :--- | :--- | :--- |
| **`STRUCTURAL`** | Absolute stake shift $\ge 5.0\,\text{pp}$ OR Near Exit ($\le 20\%$ remaining). | `STRUCTURAL_STAKE_SHIFT_GE_5PP`, `NEAR_EXIT_POSITION` | Push Notification + Detail View |
| **`MATERIAL`** | Stake move $\ge 1.0\,\text{pp}$, relative shift $\ge 10\%$, new notable position, repeat $\ge 3$ in 180d, liquidity $\ge 50\%$, OR $\ge 2$ independent WATCH dimensions. | `LARGE_STAKE_MOVE_GE_1PP`, `RELATIVE_POSITION_CHANGE_GE_10PCT`, `NEW_NOTABLE_POSITION`, `REPEATED_SAME_DIRECTION_GE_3`, `TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY`, `ESCALATED_BY_HOLDER_HISTORY` | Push Notification + Detail View |
| **`WATCH`** | Exactly 1 moderate dimension: move $\ge 0.25\,\text{pp}$, relative $\ge 5\%$, repeat $= 2$, or liquidity $\ge 20\%$. | `MODERATE_STAKE_MOVE_GE_0_25PP`, `RELATIVE_POSITION_CHANGE_GE_5PCT`, `REPEATED_SAME_DIRECTION_GE_2`, `TRANSACTION_VALUE_GE_20PCT_MEDIAN_DAILY_PROXY` | Persisted in App; Suppressed from Push |
| **`SILENT`** | Routine disclosure below all thresholds. | `SMALL_ABSOLUTE_CHANGE`, `NO_REPEAT_PATTERN`, `NO_NEW_OR_EXIT_POSITION`, `NO_MATERIAL_LIQUIDITY_CONTEXT`, `BELOW_PUSH_THRESHOLD` | Persisted in Explainable Silence Log |

---

## 5. Setup & Running Locally

### Prerequisites
- Node.js 24+
- PGlite (for local PostgreSQL testing without Docker) or Supabase PostgreSQL instance

### Installation
```bash
# Clone repository
git clone https://github.com/tonny2305/sectors_hackathon.git
cd sectors_hackathon

# Install locked dependencies
npm ci

# Verify type safety and full test suite
npm run typecheck
npm test

# Build production bundle
npm run build
```

### Environment Configuration
Copy `.env.example` to `.env` and provide your credentials:
```env
SECTORS_API_KEY=your_sectors_api_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
MAX_FILINGS_PAGES_PER_RUN=3
APP_BASE_URL=http://localhost:3000
```

### Running the Autonomous Monitor
```bash
# Run single monitoring cycle
npm run monitor

# Run for specific date window
npm run monitor -- 2026-09-01 2026-09-24

# Start local Next.js dashboard
npm run dev
```

---

## 6. Automated Test Suite (100% Passing)

The project includes **82 automated tests** across 9 test files covering all requirements:

| Test Suite | Coverage |
| :--- | :--- |
| `tests/materiality.test.ts` | 4 materiality states, edge thresholds, null safety, liquidity proxy |
| `tests/escalation.test.ts` | Multi-event stateful escalation, holder isolation, lookback boundary |
| `tests/metrics.test.ts` | Interruption reduction, duplicate alert rate, explainability coverage |
| `tests/replay.test.ts` | NSSS.JK / Samuel Sekuritas 5-step historical replay verification |
| `tests/monitor.test.ts` | End-to-end monitoring cycle, credit savings, page cap partial runs |
| `tests/telegram.test.ts` | Telegram alert formatting, reason code serialization, and delivery |
| `tests/api.test.ts` | REST API routes for runs, alerts, suppressed log, and watchlist |
| `tests/client.test.ts` | Sectors API client, 3-attempt bounded retries, 429 backoff, audit logs |
| `tests/persistence.test.ts` | PostgreSQL WASM migration, RLS policies, atomic RPC, alert uniqueness |
| `tests/security.test.ts` | Server-only boundary, secret exclusion, names-only environment template |

---

## 7. Security & Server Isolation

- All data clients and database modules import `server-only` to guarantee API keys and database service role credentials cannot leak to browser bundles.
- All 8 database tables have Row Level Security (RLS) enabled.
- Audit logs sanitize sensitive authorization headers, request bodies, and database connection strings.

---

## 8. Disclaimer

*This application is an information and analysis tool designed to triage ownership disclosures. It does not provide buy/sell/hold investment recommendations, price targets, or financial advice. All ownership data is sourced from public disclosures via the Sectors API.*
