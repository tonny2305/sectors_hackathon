begin;

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table public.watchlist_symbols (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id),
  symbol text not null check (symbol ~ '^[A-Z]{4}\.JK$'),
  enabled boolean not null default true,
  unique (watchlist_id, symbol)
);

create table public.filings (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (fingerprint ~ '^v1:[a-f0-9]{64}$'),
  symbol text not null check (symbol ~ '^[A-Z]{4}\.JK$'),
  source_url text check (source_url ~ '^https?://'),
  -- Preserve the exact source string, including timezone absence; never invent UTC.
  source_timestamp text not null,
  source_date date not null,
  holder_name text,
  normalized_holder_name text not null check (length(normalized_holder_name) > 0),
  holder_type text,
  transaction_type text not null check (transaction_type in ('buy', 'sell', 'others')),
  holding_before numeric check (holding_before >= 0),
  holding_after numeric check (holding_after >= 0),
  shares_transacted numeric check (shares_transacted >= 0),
  ownership_before_pct numeric check (ownership_before_pct between 0 and 100),
  ownership_after_pct numeric check (ownership_after_pct between 0 and 100),
  ownership_delta_pp numeric,
  reported_ownership_change_pp numeric,
  transaction_value_idr numeric,
  raw_payload_json jsonb not null check (jsonb_typeof(raw_payload_json) = 'object'),
  created_at timestamptz not null default now(),
  check (shares_transacted is not null or holding_after is not null),
  check (source_date::text = left(source_timestamp, 10))
);
create index filings_holder_history on public.filings (symbol, normalized_holder_name, transaction_type, source_date);

create table public.event_evaluations (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid not null references public.filings(id),
  materiality_state text not null check (materiality_state in ('SILENT', 'WATCH', 'MATERIAL', 'STRUCTURAL')),
  reason_codes_json jsonb not null check (jsonb_typeof(reason_codes_json) = 'array'),
  suppression_reason_codes_json jsonb not null check (jsonb_typeof(suppression_reason_codes_json) = 'array'),
  relative_position_change numeric,
  new_position boolean,
  near_exit boolean,
  repeat_count_30d integer,
  repeat_count_90d integer,
  repeat_count_180d integer,
  cumulative_same_direction_delta_pp_180d numeric,
  previous_holder_event_timestamp text,
  previous_materiality_state_for_holder text,
  escalated_from_prior_state boolean,
  median_daily_liquidity_proxy_20d numeric,
  transaction_to_liquidity_proxy numeric,
  context_unavailable boolean not null,
  enrichment_skipped boolean not null,
  engine_version text not null,
  created_at timestamptz not null default now(),
  unique (id, filing_id),
  unique (filing_id, engine_version)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid not null unique references public.filings(id),
  evaluation_id uuid not null,
  channel text not null,
  delivery_status text not null check (delivery_status in ('PENDING', 'SENT', 'FAILED', 'UNKNOWN')),
  sent_at timestamptz,
  external_message_id text,
  foreign key (evaluation_id, filing_id) references public.event_evaluations(id, filing_id)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED')),
  pages_fetched integer not null default 0,
  records_scanned integer not null default 0,
  eligible_new_filings integer,
  new_events integer not null default 0,
  silent_count integer,
  watch_count integer,
  material_count integer,
  structural_count integer,
  suppressed_from_push_count integer,
  alerts_sent integer,
  interruption_reduction numeric,
  duplicate_alert_count integer,
  duplicate_alert_rate numeric,
  explainability_coverage numeric,
  estimated_credits integer not null default 0,
  api_latency_ms_total integer not null default 0,
  error_summary text
);

create table public.holder_activity_state (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  normalized_holder_name text not null,
  last_transaction_type text,
  last_event_timestamp text,
  same_direction_count_30d integer,
  same_direction_count_90d integer,
  same_direction_count_180d integer,
  cumulative_same_direction_delta_pp_180d numeric,
  latest_materiality_state text,
  updated_at timestamptz not null default now(),
  unique (symbol, normalized_holder_name)
);

create table public.api_call_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.automation_runs(id),
  endpoint text not null,
  requested_at timestamptz not null,
  status_code integer check (status_code between 100 and 599),
  latency_ms integer not null check (latency_ms >= 0),
  estimated_credit_cost integer not null check (estimated_credit_cost >= 0),
  cache_hit boolean not null default false,
  error text
);
create index api_call_logs_run on public.api_call_logs (run_id, requested_at);

-- One transaction; concurrent/replayed requests cannot create another event.
create function public.ingest_filings(p_events jsonb)
returns table (id uuid, fingerprint text)
language sql security invoker set search_path = '' as $$
  insert into public.filings (
    fingerprint, symbol, source_url, source_timestamp, source_date, holder_name,
    normalized_holder_name, holder_type, transaction_type, holding_before, holding_after,
    shares_transacted, ownership_before_pct, ownership_after_pct, ownership_delta_pp,
    reported_ownership_change_pp, transaction_value_idr, raw_payload_json
  )
  select r.fingerprint, r.symbol, r.source_url, r.source_timestamp, r.source_date, r.holder_name,
    r.normalized_holder_name, r.holder_type, r.transaction_type, r.holding_before, r.holding_after,
    r.shares_transacted, r.ownership_before_pct, r.ownership_after_pct, r.ownership_delta_pp,
    r.reported_ownership_change_pp, r.transaction_value_idr, r.raw_payload_json
  from jsonb_populate_recordset(null::public.filings, p_events) as r
  on conflict (fingerprint) do nothing
  returning filings.id, filings.fingerprint;
$$;

-- No browser access in Phase 1. Later UI needs explicit read policies.
alter table public.watchlists enable row level security;
alter table public.watchlist_symbols enable row level security;
alter table public.filings enable row level security;
alter table public.event_evaluations enable row level security;
alter table public.alerts enable row level security;
alter table public.automation_runs enable row level security;
alter table public.holder_activity_state enable row level security;
alter table public.api_call_logs enable row level security;

revoke all on public.watchlists, public.watchlist_symbols, public.filings,
  public.event_evaluations, public.alerts, public.automation_runs,
  public.holder_activity_state, public.api_call_logs from public, anon, authenticated;
grant all on public.watchlists, public.watchlist_symbols, public.filings,
  public.event_evaluations, public.alerts, public.automation_runs,
  public.holder_activity_state, public.api_call_logs to service_role;
revoke all on function public.ingest_filings(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_filings(jsonb) to service_role;

commit;
