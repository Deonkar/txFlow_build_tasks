// Health status for all backend services
export interface HealthStatus {
  producer: boolean;
  dlqHandler: boolean;
  redpandaAdmin: boolean;
  timestamp: Date;
}

// Analytics data from the Producer API
export interface AnalyticsData {
  total_payments: number;
  total_volume: number;
  dlq_count: number;
  by_currency: { [currency: string]: number };
}

// Consumer lag information
export interface ConsumerLag {
  group: string;
  state: 'Stable' | 'Rebalancing' | 'Unknown';
  members: number;
  total_lag: number;
  partitions?: number;
}

// DLQ event details
export interface DLQEvent {
  id: string;
  failed_at: Date;
  consumer_group: string;
  event_id: string;
  user_id: string;
  amount: number;
  currency: string;
  error: string;
  original_payload: Record<string, unknown>;
}

// Summary card data
export interface SummaryCard {
  label: string;
  value: string | number;
  warning?: boolean;
  critical?: boolean;
}

// API response wrapper
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  timestamp: Date;
  isStale?: boolean;
}
