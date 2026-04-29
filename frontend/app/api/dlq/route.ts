import { NextRequest, NextResponse } from 'next/server';
import { DLQ_LIMIT } from '@/lib/constants';

const DLQ_HANDLER_API_URL = process.env.DLQ_HANDLER_API_URL ?? 'http://localhost:8001';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const group = searchParams.get('group');
  const search = searchParams.get('search');

  try {
    const response = await fetch(`${DLQ_HANDLER_API_URL}/dlq`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json([], { status: 200 });
    }

    let events = await response.json();
    events = Array.isArray(events) ? events : [];

    // Client-side filtering by group
    if (group) {
      events = events.filter((e: any) => e.consumer_group === group);
    }

    // Client-side filtering by search (event_id, user_id, error text)
    if (search) {
      const searchLower = search.toLowerCase();
      events = events.filter((e: any) => {
        return (
          String(e.event_id).toLowerCase().includes(searchLower) ||
          String(e.user_id).toLowerCase().includes(searchLower) ||
          String(e.error).toLowerCase().includes(searchLower)
        );
      });
    }

    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json([], { status: 200 });
  }
}
