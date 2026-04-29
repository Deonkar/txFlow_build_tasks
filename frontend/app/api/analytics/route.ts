import { NextRequest, NextResponse } from 'next/server';
const PRODUCER_API_URL = process.env.PRODUCER_API_URL ?? 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${PRODUCER_API_URL}/analytics`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          total_payments: 0,
          total_volume: 0,
          dlq_count: 0,
          by_currency: {},
          error: `Backend returned ${response.status}`,
        },
        { status: 200 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        total_payments: 0,
        total_volume: 0,
        dlq_count: 0,
        by_currency: {},
        error: String(error),
      },
      { status: 200 }
    );
  }
}
