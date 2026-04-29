-- TxFlow init schema (runs on first Postgres start)
-- Keep this file idempotent: CREATE TABLE IF NOT EXISTS + safe inserts.

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_published ON outbox_events(published);
CREATE INDEX IF NOT EXISTS idx_outbox_events_event_id ON outbox_events(event_id);

CREATE TABLE IF NOT EXISTS wallets (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  balance NUMERIC(12,2) DEFAULT 10000.00,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

CREATE TABLE IF NOT EXISTS wallet_processed_events (
  event_id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fraud_assessments (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  amount NUMERIC(12,2),
  is_flagged BOOLEAN NOT NULL,
  risk_level TEXT,
  reason TEXT,
  assessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_assessments_event_id ON fraud_assessments(event_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_id ON audit_log(event_id);

CREATE TABLE IF NOT EXISTS dead_letter_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  consumer_group TEXT NOT NULL,
  original_payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INT DEFAULT 3,
  failed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_events_event_id ON dead_letter_events(event_id);

-- Seed wallets (POC users)
INSERT INTO wallets (user_id, balance)
VALUES
  ('user_001', 10000.00),
  ('user_002', 10000.00),
  ('user_003', 10000.00),
  ('user_004', 10000.00),
  ('user_005', 10000.00)
ON CONFLICT (user_id) DO NOTHING;

