// Lag thresholds for color coding
export const LAG_WARNING_THRESHOLD = 50;
export const LAG_CRITICAL_THRESHOLD = 200;

// Polling interval in milliseconds
export const POLL_INTERVAL_MS = 5000; // 5 seconds

// DLQ limit
export const DLQ_LIMIT = 200;

// Consumer group names for DLQ filters
export const CONSUMER_GROUPS = ['wallet', 'fraud', 'audit', 'notify'];

// Backend base URLs (hardcoded for internal tool)
export const PRODUCER_API_URL = 'http://localhost:8000';
export const DLQ_HANDLER_API_URL = 'http://localhost:8001';
export const REDPANDA_ADMIN_URL = 'http://localhost:9644';
