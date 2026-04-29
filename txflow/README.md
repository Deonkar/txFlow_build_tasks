# TxFlow — Payment Event Orchestrator (Kafka POC)

TxFlow is a locally runnable, production-patterned Kafka/Redpanda POC: one `POST /payment` request produces one event, and five independent consumer groups process it (fraud, wallet, notify, audit, analytics) with retries + DLQ + dedup.

## Quickstart
1. Copy env:
   - `cp .env.example .env`
2. Start everything:
   - `docker compose up -d --build`
3. Open:
   - Redpanda Console: `http://localhost:8080`
   - Producer API: `http://localhost:8000/health`
    - Producer analytics: `http://localhost:8000/analytics`
    - DLQ handler API: `http://localhost:8001/dlq`

## Endpoints
- Producer
  - `POST /payment` (202 or 409)
  - `GET /health`
  - `GET /analytics` (Redis counters + DLQ count)
- DLQ handler
  - `GET /dlq` (latest DLQ rows from Postgres)

## Scripts
- `scripts/fire_event.sh`: send one fake payment
- `scripts/fire_bulk.sh`: send ~20 payments quickly
- `scripts/replay_dlq.sh`: replay DLQ events (re-publish to `payments.initiated`)

Note (Windows): run scripts via `bash scripts/<name>.sh` (Git Bash / WSL).

## Verification (smoke)
- Fire one event (PowerShell):
  - `Invoke-RestMethod -Method Post -Uri "http://localhost:8000/payment" -ContentType "application/json" -Body (@{ user_id="user_001"; amount=12.34; currency="USD"; idempotency_key=("smoke-"+(Get-Date -Format "HHmmssfff")) } | ConvertTo-Json)`
- Confirm analytics updates:
  - `Invoke-RestMethod http://localhost:8000/analytics`
- Confirm DLQ handler works (forced poison message):
  - `'{bad json' | docker compose exec -T redpanda rpk topic produce payments.initiated -X brokers=redpanda:9092 -k user_999 -f '%v\n'`
  - `Invoke-RestMethod http://localhost:8001/dlq`

