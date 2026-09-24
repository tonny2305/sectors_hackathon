import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ runs: [] });
  }

  try {
    const response = await fetch(`${url}/rest/v1/automation_runs?order=started_at.desc&limit=20`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ runs: [] });
    }

    const runs = await response.json();
    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}
