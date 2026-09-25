import 'server-only';

// ponytail: bounded page reads; add pagination when the research view needs older records.
export async function readEvidence<T>(query: string): Promise<{ rows: T[]; error: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { rows: [], error: 'Evidence is unavailable. The database connection is not configured.' };
  try {
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store',
    });
    if (!res.ok) throw new Error('Read failed');
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('Invalid response');
    return { rows, error: null };
  } catch {
    return { rows: [], error: 'Evidence could not be loaded. Refresh to retry; no conclusion can be drawn from this view.' };
  }
}
