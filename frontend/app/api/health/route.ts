import { NextRequest, NextResponse } from 'next/server';

const PRODUCER_API_URL = process.env.PRODUCER_API_URL ?? 'http://localhost:8000';
const DLQ_HANDLER_API_URL = process.env.DLQ_HANDLER_API_URL ?? 'http://localhost:8001';
const REDPANDA_ADMIN_URL = process.env.REDPANDA_ADMIN_URL ?? 'http://localhost:9644';

export async function GET(request: NextRequest) {
  const healthStatus = {
    producer: false,
    dlqHandler: false,
    redpandaAdmin: false,
  };

  // Check Producer API health
  try {
    const response = await fetch(`${PRODUCER_API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    healthStatus.producer = response.ok;
  } catch {
    healthStatus.producer = false;
  }

  // Check DLQ Handler API health (try to reach /dlq endpoint)
  try {
    const response = await fetch(`${DLQ_HANDLER_API_URL}/dlq`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    healthStatus.dlqHandler = response.ok || response.status === 200;
  } catch {
    healthStatus.dlqHandler = false;
  }

  // Check Redpanda Admin API health
  try {
    const response = await fetch(`${REDPANDA_ADMIN_URL}/v1/status/ready`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    healthStatus.redpandaAdmin = response.ok;
  } catch {
    healthStatus.redpandaAdmin = false;
  }

  return NextResponse.json(healthStatus);
}
