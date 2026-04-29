import { NextRequest, NextResponse } from 'next/server';
const PRODUCER_API_URL = process.env.PRODUCER_API_URL ?? 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { original_payload } = body;

    if (!original_payload) {
      return NextResponse.json(
        { success: false, message: 'Missing original_payload' },
        { status: 400 }
      );
    }

    // Map a DLQ original payload back into the producer's POST /payment contract.
    // Producer expects: { user_id, amount, currency, idempotency_key }
    const user_id = original_payload.user_id;
    const amount = original_payload.amount;
    const currency = original_payload.currency;
    const event_id = original_payload.event_id;

    if (!user_id || amount === undefined || !currency) {
      return NextResponse.json(
        { success: false, message: 'original_payload missing user_id/amount/currency' },
        { status: 400 }
      );
    }

    const idempotency_key = `replay-${event_id ?? Date.now()}`;

    const response = await fetch(`${PRODUCER_API_URL}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, amount, currency, idempotency_key }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `Backend returned ${response.status}` },
        { status: 200 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      message: 'Event replayed successfully',
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 200 }
    );
  }
}
