-- Read-only hosted audit. Run in Supabase SQL Editor; do not paste credentials.
-- Expected: RLS true, anon/authenticated SELECT/INSERT/UPDATE/DELETE false,
-- service_role access true for each application table.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
  has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') as anon_write,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_read,
  has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as authenticated_write,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_read,
  has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE') as service_write
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('watchlists', 'watchlist_symbols', 'filings', 'event_evaluations',
    'alerts', 'automation_runs', 'holder_activity_state', 'api_call_logs')
order by c.relname;

-- Expected: unique(fingerprint), unique(filing_id) on alerts,
-- unique(filing_id, engine_version), and unique(watchlist_id, symbol).
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.filings'::regclass, 'public.alerts'::regclass,
  'public.event_evaluations'::regclass, 'public.watchlist_symbols'::regclass)
  and contype = 'u'
order by table_name, conname;

-- Expected: SECURITY INVOKER, anon/authenticated execute false, service_role true.
select p.oid::regprocedure as function_name, p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'ingest_filings';

-- Review any policies added after the repository migration.
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename in ('watchlists', 'watchlist_symbols',
  'filings', 'event_evaluations', 'alerts', 'automation_runs',
  'holder_activity_state', 'api_call_logs')
order by tablename, policyname;
