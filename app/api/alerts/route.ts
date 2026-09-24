import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ alerts: [] });
  }

  try {
    const query = 'event_evaluations?materiality_state=in.(MATERIAL,STRUCTURAL)&select=*,filings(*)&order=created_at.desc&limit=50';
    const response = await fetch(`${url}/rest/v1/${query}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ alerts: [] });
    }

    const alerts = await response.json();
    return NextResponse.json({ alerts });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
