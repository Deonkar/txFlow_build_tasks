# TxFlow — Detailed Project Explanation

## 0) Explain like I’m 12 (why you built this to learn Kafka)

Think of Kafka like a **school mailbox system**.

- A **Producer** is someone who writes a note and drops it in the mailbox.
- A **Topic** is the mailbox name (like “payments”).
- A **Consumer** is a teacher who reads the notes and does a job.
- A **Consumer group** is a “team name” for teachers. Different teams each get their own copy of every note.

### What your project does (the story)
1. Someone presses “Pay” (calls the API).
2. The API writes down one message like: “user_001 paid 50 USD”.
3. The API drops that message into the Kafka mailbox (`payments.initiated`).
4. Five different teachers read the same message and each does their own job:
   - **Fraud**: decide if it’s risky
   - **Wallet**: subtract money
   - **Notify**: pretend to send an email
   - **Audit**: write an “always-keep” record
   - **Analytics**: update counters

### The “safety features” you learned (the real Kafka lessons)
- **Outbox** (Postgres): before the API drops a note in Kafka, it also saves a copy in the DB so the note isn’t lost if the app crashes.
- **Manual commits**: consumers only say “done” after they finish their work.
- **Dedup (idempotency)**: if a note is delivered twice, consumers can safely skip the duplicate.
- **Retries + DLQ**: if a consumer can’t handle a note after a few tries, it moves the note to a special mailbox (`payments.dlq`) so everything doesn’t get stuck.

### How you “see” what Kafka is doing
You built a dashboard (`http://localhost:3000`) that shows:
- **Lag**: how many notes are waiting for each teacher team
- **DLQ**: which notes failed and why
- **Analytics**: counters like total payments and volume

## 1) What this project is

TxFlow is an **event-driven payments workflow** built around Kafka (via Redpanda). A client sends a payment request to an API. The API publishes **one payment event** to Kafka. Multiple independent services (consumers) each process the **same event** for different responsibilities:

- fraud assessment
- wallet debit
- notification
- audit logging
- analytics counters

This architecture is used to **decouple concerns** so that:
- each concern can scale independently,
- failures are isolated,
- the system stays resilient under partial outages,
- and events are replayable (Kafka retention).

This repo is designed to be **locally runnable with Docker Compose**, and to demonstrate production-grade patterns like:
- Outbox pattern
- at-least-once processing with manual offset commits
- idempotency / deduplication
- retries with exponential backoff
- dead-letter queue (DLQ)
- a small monitoring dashboard


## 2) What stack is used

### Backend
- **Kafka-compatible broker**: Redpanda
- **Kafka UI**: Redpanda Console
- **API service**: FastAPI (Python)
- **Database**: PostgreSQL
- **Cache**: Redis
- **Consumers**: Python using `confluent-kafka` (manual commits, retry/DLQ)
- **Orchestration**: Docker Compose

### Frontend
- **Next.js + TypeScript**
- **shadcn/ui + Tailwind** (UI components + styling)
- Uses **Next API routes** (`/api/*`) as a proxy layer so the browser doesn’t need direct cross-origin access to backend services.


## 3) Repo layout (what lives where)

High-level folders:

```
txflow/
  docker-compose.yml          # brings up the entire system
  .env.example                # environment template
  db/init.sql                 # Postgres schema + seed wallets
  producer/                   # FastAPI producer API (outbox + publish + poller)
  consumers/
    shared/                   # shared consumer framework (retry, DLQ, commits, logging)
    wallet/                   # wallet consumer (debit + idempotency)
    fraud/                    # fraud consumer (risk assessment)
    notifier/                 # notifier consumer (simulated email)
    audit/                    # audit consumer (append-only log)
    analytics/                # analytics consumer (Redis counters, no DLQ)
    dlq_handler/              # DLQ handler service (consumer + GET /dlq API)

frontend/
  app/                        # Next.js app router + API routes proxy
  components/                 # dashboard UI components
  lib/                        # client api helpers + types + constants
```


## 4) The “happy path” data flow (end-to-end)

### Step A — Client calls the API
The client calls:
- **`POST http://localhost:8000/payment`**

Example request:

```json
{
  "user_id": "user_001",
  "amount": 12.34,
  "currency": "USD",
  "idempotency_key": "client-generated-key"
}
```

Key point: **`idempotency_key`** prevents duplicate API requests from creating duplicate payment events.

### Step B — Producer writes to Outbox in Postgres
Before sending anything to Kafka, the producer inserts an event row into `outbox_events` in Postgres.

This protects against this failure case:
> API accepted the payment, but crashes before publishing to Kafka.

Because the event is stored in the DB, it can be published later by the poller.

### Step C — Producer publishes to Kafka (best effort) + marks published
After the outbox insert succeeds, the producer tries to publish to Kafka topic:
- `payments.initiated` (3 partitions)

If publish succeeds, it marks the outbox row as published.

### Step D — Consumers process the same event independently

Each consumer runs as its own service and its own **consumer group**:
- `wallet`
- `fraud`
- `notify`
- `audit`
- `analytics`

All groups read from `payments.initiated`. Since they are different groups, they do not share offsets; each one receives all events.


## 5) Kafka topics and partitioning

### `payments.initiated`
- **Purpose**: primary stream of payment events
- **Partitions**: 3
- **Keying**: producer publishes with key = `user_id`

Why key by user?
- Kafka guarantees ordering **per partition**.
- With key=`user_id`, all events for a user go to the same partition, which is helpful if you want wallet balance changes to be applied in order per user.

### `payments.dlq`
- **Purpose**: dead-letter queue for events that fail processing after retries
- **Partitions**: 1 (simpler inspection + replay)


## 6) Database schema (what tables exist and why)

Postgres is the “source of truth” for:
- durable event outbox
- wallet balances
- fraud assessments
- append-only audit logs
- DLQ records (persisted for dashboard + replay)

Key tables:

### `outbox_events`
Used by the producer to store the event payload before publishing to Kafka.

Important columns (conceptually):
- `event_id` (UUID)
- `idempotency_key` (unique)
- `payload` (JSONB)
- `published` (bool)

Why this exists:
- guarantees you never “lose” an accepted event if Kafka publish fails

### `wallets`
Holds wallet balance per user.
- seeded with a few sample users in `txflow/db/init.sql`

### `wallet_processed_events`
Used by the wallet consumer for **DB-level idempotency**.
- primary key: `event_id`

Why this exists even though Redis dedup exists:
- Redis is great for fast dedup, but DB-level uniqueness is the strongest protection against double-debit if the consumer crashes at a bad time.

### `fraud_assessments`
Stores a risk decision for a payment event (ex: LOW_RISK / HIGH_RISK) for later checks.

### `audit_log`
Append-only table for auditability.
- inserts only; never update/delete

### `dead_letter_events`
Stores DLQ items consumed from `payments.dlq` for visibility and dashboard use.


## 7) Redis usage (what keys exist and why)

Redis is used for two separate concerns:

### A) Consumer dedup keys (idempotency)
Each consumer uses keys like:
- `wallet:processed:{event_id}`
- `fraud:processed:{event_id}`
- `notify:processed:{event_id}`
- `audit:processed:{event_id}`
- `analytics:processed:{event_id}`

These keys have a TTL (default: 24h).

Why it matters:
- Kafka consumers are **at-least-once** in this project, meaning duplicates can happen.
- Redis makes duplicates cheap to detect and skip.

### B) Analytics counters
Analytics consumer increments:
- `analytics:total_payments`
- `analytics:total_volume`
- `analytics:payments_by_currency:{CURRENCY}`
- `analytics:payments_by_user:{USER_ID}`


## 8) Processing guarantees (what “correctness” means here)

### At-least-once delivery
Consumers **do not auto-commit offsets**.
They commit offsets **only after** one of these outcomes:
- processed successfully, OR
- routed to DLQ (for DLQ-enabled consumers), OR
- skipped as duplicate

This gives:
- **at-least-once** message processing
- requires idempotency to avoid duplicate side effects

### Idempotency (duplicate safety)
We use two layers:
- **Redis**: fast dedup for all consumers
- **DB uniqueness**: wallet uses `wallet_processed_events` to guarantee no double-debit


## 9) Retries + DLQ (how failures are handled)

### Retries
Each consumer attempts processing up to a configured number of times (default: 3).
It uses **exponential backoff**, so repeated failures pause briefly before retrying.

### DLQ
For DLQ-enabled consumers (wallet/fraud/notify/audit):
- If all retries fail, the consumer publishes a DLQ envelope to `payments.dlq`
- The consumer then commits the offset so the partition is unblocked

Analytics consumer is intentionally configured with **no DLQ** (non-critical metrics).

### DLQ handler service
`dlq-handler` is both:
1) a Kafka consumer of `payments.dlq`
2) a small API server exposing the stored DLQ records

It writes DLQ events into `dead_letter_events` and exposes:
- **`GET http://localhost:8001/dlq`**


## 10) APIs (what endpoints exist)

### Producer (FastAPI) — `http://localhost:8000`
- `GET /health`
  - returns `{ "status": "ok" }`
- `POST /payment`
  - validates request
  - writes outbox row (idempotent)
  - best-effort Kafka publish
  - returns `202` on accept
  - returns `409` if `idempotency_key` already used
- `GET /analytics`
  - reads Redis counters
  - reads DLQ count from Postgres

### DLQ handler — `http://localhost:8001`
- `GET /dlq`
  - returns latest DLQ rows (up to 200)


## 11) Dashboard (what you see in the UI)

The dashboard is served at:
- **`http://localhost:3000`**

What it shows (refresh every 5 seconds):
- **Health pills**: producer, dlq-handler, redpanda admin
- **Summary cards**: total lag, worst group, DLQ count, total payments, total volume
- **Consumer lag table**: lag per consumer group for `payments.initiated`
  - lag is computed from Redpanda `public_metrics`
- **DLQ table**: latest events + search/filter + replay action
- **Analytics panel**: totals and currency breakdown

Important implementation detail:
- The dashboard uses Next.js **API routes** (`/api/*`) as a proxy layer.
  This keeps the browser talking to one origin (`localhost:3000`) and the server routes calls to `producer`, `dlq-handler`, and `redpanda`.


## 12) Why key architectural decisions were made

### Why Outbox pattern?
Because “write to DB” and “publish to Kafka” are two different systems.
Outbox ensures an accepted request is **durably recorded** even if Kafka publish fails.

### Why manual offset commits?
If you commit offsets before you finish work, you can “lose” work (message acknowledged but side effects not done).
Manual commits ensure offsets represent **completed** processing.

### Why Redis dedup + DB idempotency?
At-least-once systems can deliver duplicates.
Redis prevents doing work twice most of the time.
DB uniqueness protects the most critical side effect (wallet debit) even in worst-case crash timing.

### Why DLQ?
Some events will fail permanently (bad data, insufficient funds, downstream outage).
DLQ prevents the consumer from being stuck forever on a poison message and provides visibility.


## 13) How to run the project locally (step-by-step)

### Prerequisites
- Docker Desktop

### Start everything
From repo root:

```bash
cd txflow
cp .env.example .env
docker compose up -d --build
```

### Open UIs / endpoints
- Dashboard: `http://localhost:3000`
- Redpanda Console: `http://localhost:8080`
- Producer: `http://localhost:8000/health`
- Producer analytics: `http://localhost:8000/analytics`
- DLQ handler: `http://localhost:8001/dlq`


## 14) How to test the system (practical checks)

### A) Create a payment event (PowerShell)
```powershell
$body = @{ user_id = "user_001"; amount = 50.0; currency = "USD"; idempotency_key = ("demo-"+(Get-Date -Format "HHmmssfff")) } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/payment" -ContentType "application/json" -Body $body
```

Expected results:
- wallet balance decreases (unless flagged / insufficient)
- audit log gets a new row
- analytics counters increase
- notifier logs a “sent” message

### B) Force a DLQ event quickly
Send invalid JSON to the topic:
```powershell
'{bad json' | docker compose exec -T redpanda rpk topic produce payments.initiated -X brokers=redpanda:9092 -k user_999 -f '%v\n'
```

Then verify DLQ:
```powershell
Invoke-RestMethod http://localhost:8001/dlq
```

### C) Replay from dashboard
Open `http://localhost:3000`, go to DLQ table, click **Replay**.


## 15) Common questions (quick explanations)

### “Why do we have both Postgres and Redis?”
- Postgres = durable truth (balances, outbox, DLQ records)
- Redis = fast dedup + fast counters

### “If Kafka is durable, why do we need outbox?”
Kafka is durable **after publish**. Outbox protects the gap between accepting a request and successfully publishing.

### “Can this architecture scale?”
Yes: add partitions, run more consumer instances per group, and scale services independently.


## 16) What to improve next (optional)

Not required to understand the project, but common next steps:
- add stronger schema governance (Avro + Schema Registry as a stretch)
- add proper replay semantics (re-publish to Kafka instead of `POST /payment`)
- add dashboard charts for throughput over time
- add alerting rules based on lag/DLQ growth
