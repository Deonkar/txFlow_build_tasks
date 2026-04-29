# TxFlow — Payment Event Orchestrator (Kafka/Redpanda POC)

TxFlow is a locally runnable Kafka POC that teaches the core mental model:

> One `POST /payment` request produces **one** event → **multiple independent consumer groups** process that same event (fraud, wallet, notifications, audit, analytics) without coupling.

This repo currently includes:
- **Phase 1–3 implemented**: infra + producer (outbox) + wallet consumer.
- The remaining consumers (fraud/notifier/audit/analytics), DLQ handler API, and dashboard are planned next.

## Stack
- **Kafka broker**: Redpanda (Kafka-compatible)
- **Kafka UI**: Redpanda Console
- **Producer API**: FastAPI (Python)
- **Database**: PostgreSQL
- **Cache**: Redis (dedup keys + counters later)
- **Consumers**: Python (confluent-kafka)
- **Orchestration**: Docker Compose

## Repo structure
```
txflow/
  docker-compose.yml
  .env.example
  db/init.sql
  producer/                 # FastAPI + Outbox + Kafka publish + poller
  consumers/
    shared/                 # shared consumer framework (manual commit, retry, DLQ)
    wallet/                 # wallet consumer (dedup + DB idempotency)
    fraud/ notifier/ audit/ analytics/ dlq_handler/ dashboard/  # placeholders (next phases)
```

## Prerequisites
- Docker Desktop (Windows/macOS/Linux)
- Git

## Quickstart (run locally)
From the repo root:

1) Create local env file:
```bash
cd txflow
cp .env.example .env
```

2) Start the stack:
```bash
docker compose up -d
```

3) Verify services:
- Redpanda Console: `http://localhost:8080`
- Producer health: `http://localhost:8000/health`

## Key ports
- Redpanda broker: `9092`
- Redpanda Admin API: `9644`
- Redpanda Console: `8080`
- Postgres: `5432`
- Redis: `6379`
- Producer API: `8000`

## What’s implemented (Phase 1–3)

### Phase 1 — Infra
`txflow/docker-compose.yml` brings up:
- Redpanda + Console
- Postgres (init via `txflow/db/init.sql`)
- Redis
- One-shot init container to create topics:
  - `payments.initiated` (3 partitions, retention 7 days)
  - `payments.dlq` (1 partition, retention 30 days)

### Phase 2 — Producer (FastAPI + Outbox)
Producer lives in `txflow/producer/`.

Endpoints:
- `GET /health` → `{ "status": "ok" }`
- `POST /payment` (implemented)
  - writes outbox row first (Outbox pattern)
  - returns **202 Accepted** with `{ event_id, status, message }`
  - returns **409 Conflict** on duplicate `idempotency_key`
  - best-effort publishes to Kafka, and a background poller republishes any outbox rows where `published=false`

### Phase 3 — Wallet consumer
Wallet consumer lives in `txflow/consumers/wallet/`.

Properties:
- manual offset commit (at-least-once)
- Redis dedup key: `wallet:processed:{event_id}` (TTL from `DEDUP_TTL_SECONDS`)
- DB-level idempotency via `wallet_processed_events` to prevent double-debit

## Smoke tests / verification

### 1) Topics exist
```bash
docker compose exec -T redpanda rpk topic list -X brokers=redpanda:9092
```

### 2) Postgres tables exist + wallets seeded
```bash
docker compose exec -T postgres psql -U txflow -d txflow -c "\dt"
docker compose exec -T postgres psql -U txflow -d txflow -c "select user_id, balance from wallets order by user_id;"
```

### 3) Produce one event
PowerShell example:
```powershell
$body = @{ user_id = "user_001"; amount = 50.0; currency = "USD"; idempotency_key = "demo-001" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/payment" -ContentType "application/json" -Body $body
```

Then verify wallet debited:
```bash
docker compose exec -T postgres psql -U txflow -d txflow -c "select user_id, balance from wallets where user_id='user_001';"
```

## Notes / troubleshooting
- If Docker is installed but `docker compose up` fails, confirm the engine is running:
  - `docker info`
- If topic creation fails, rerun the init job:
  - `docker compose run --rm redpanda-init`

## Next steps (planned)
- Add remaining consumers: fraud, notifier, audit, analytics
- Add DLQ handler consumer + `GET /dlq`
- Add producer `GET /analytics`
- Add React dashboard (lag + DLQ + analytics) with 5s refresh and replay button

