import {
  HealthStatus,
  AnalyticsData,
  ConsumerLag,
  DLQEvent,
  ApiResponse,
} from './types';
import { DLQ_LIMIT } from './constants';

// Fetch health status from health check endpoint
export async function fetchHealth(): Promise<ApiResponse<HealthStatus>> {
  const timestamp = new Date();
  try {
    const response = await fetch('/api/health', { 
      method: 'GET',
      cache: 'no-store'
    });
    const data = await response.json();
    return {
      data,
      error: null,
      timestamp,
    };
  } catch (error) {
    return {
      data: null,
      error: String(error),
      timestamp,
    };
  }
}

// Fetch analytics data
export async function fetchAnalytics(): Promise<ApiResponse<AnalyticsData>> {
  const timestamp = new Date();
  try {
    const response = await fetch('/api/analytics', {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      data,
      error: null,
      timestamp,
    };
  } catch (error) {
    return {
      data: null,
      error: String(error),
      timestamp,
    };
  }
}

// Fetch consumer lag data
export async function fetchConsumerLag(): Promise<ApiResponse<ConsumerLag[]>> {
  const timestamp = new Date();
  try {
    const response = await fetch('/api/consumer-lag', {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      data: Array.isArray(data) ? data : [],
      error: null,
      timestamp,
    };
  } catch (error) {
    return {
      data: null,
      error: String(error),
      timestamp,
    };
  }
}

// Fetch DLQ events with optional filtering
export async function fetchDLQEvents(
  group?: string,
  search?: string
): Promise<ApiResponse<DLQEvent[]>> {
  const timestamp = new Date();
  try {
    const params = new URLSearchParams();
    if (group) params.append('group', group);
    if (search) params.append('search', search);
    
    const url = `/api/dlq${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      data: Array.isArray(data) ? data.slice(0, DLQ_LIMIT) : [],
      error: null,
      timestamp,
    };
  } catch (error) {
    return {
      data: null,
      error: String(error),
      timestamp,
    };
  }
}

// Replay a DLQ event to the payment topic
export async function replayDLQEvent(
  eventId: string,
  originalPayload: Record<string, unknown>
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const timestamp = new Date();
  try {
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, original_payload: originalPayload }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      data: data || { success: true, message: 'Event replayed successfully' },
      error: null,
      timestamp,
    };
  } catch (error) {
    return {
      data: null,
      error: String(error),
      timestamp,
    };
  }
}
