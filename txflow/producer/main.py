import os
import threading
import time
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException
import redis

from db import get_connection
from kafka_publisher import KafkaPublisher
from models import PaymentEvent, PaymentRequest
from outbox import (
    DuplicateIdempotencyKeyError,
    get_unpublished_events,
    insert_outbox_event,
    mark_published,
)
from structured_logging import log_json

app = FastAPI(title="TxFlow Producer", version="0.1.0")

_publisher: KafkaPublisher | None = None
_stop_poller = threading.Event()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _get_publisher() -> KafkaPublisher:
    global _publisher
    if _publisher is None:
        _publisher = KafkaPublisher(bootstrap_servers=_require_env("KAFKA_BOOTSTRAP_SERVERS"))
    return _publisher


def _get_redis() -> "redis.Redis":
    url = _require_env("REDIS_URL")
    return redis.from_url(url, decode_responses=True)


def _publish_and_mark_published(event_id: str, user_id: str, payload: dict) -> None:
    topic = _require_env("PAYMENTS_TOPIC")
    publisher = _get_publisher()

    try:
        publisher.publish_json(topic=topic, key=user_id, value=payload)
    except Exception as e:
        log_json(
            service="producer",
            level="error",
            event="kafka_publish_failed",
            event_id=event_id,
            error=str(e),
        )
        return

    try:
        with get_connection() as conn:
            mark_published(conn, event_id=event_id)
    except Exception as e:
        log_json(
            service="producer",
            level="error",
            event="outbox_mark_published_failed",
            event_id=event_id,
            error=str(e),
        )
        return

    log_json(
        service="producer",
        level="info",
        event="outbox_published",
        event_id=event_id,
        topic=topic,
    )


def _poll_outbox_loop(poll_interval_seconds: int = 30, batch_limit: int = 100) -> None:
    while not _stop_poller.is_set():
        try:
            with get_connection() as conn:
                events = get_unpublished_events(conn, limit=batch_limit)
        except Exception as e:
            log_json(service="producer", level="error", event="outbox_poll_failed", error=str(e))
            time.sleep(poll_interval_seconds)
            continue

        if events:
            log_json(
                service="producer",
                level="info",
                event="outbox_poll_found_unpublished",
                count=len(events),
            )

        for row in events:
            event_id = str(row["event_id"])
            payload = row["payload"]
            user_id = payload.get("user_id", "")
            if not user_id:
                log_json(
                    service="producer",
                    level="error",
                    event="outbox_payload_missing_user_id",
                    event_id=event_id,
                )
                continue
            _publish_and_mark_published(event_id=event_id, user_id=user_id, payload=payload)

        time.sleep(poll_interval_seconds)


@app.on_event("startup")
def on_startup() -> None:
    _get_publisher()
    poller = threading.Thread(target=_poll_outbox_loop, name="outbox-poller", daemon=True)
    poller.start()
    log_json(service="producer", level="info", event="startup_complete")


@app.on_event("shutdown")
def on_shutdown() -> None:
    _stop_poller.set()
    log_json(service="producer", level="info", event="shutdown_initiated")


@app.post("/payment", status_code=202)
def create_payment(request: PaymentRequest, background: BackgroundTasks) -> dict:
    now = datetime.now(UTC)
    event = PaymentEvent(
        event_id=str(uuid4()),
        event_type="payment_initiated",
        user_id=request.user_id,
        amount=request.amount,
        currency=request.currency,
        idempotency_key=request.idempotency_key,
        occurred_at=now.isoformat().replace("+00:00", "Z"),
    )

    try:
        with get_connection() as conn:
            insert_outbox_event(conn, event)
    except DuplicateIdempotencyKeyError:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "duplicate_request",
                "message": "This idempotency_key has already been processed",
            },
        )
    except Exception as e:
        log_json(service="producer", level="error", event="outbox_insert_failed", error=str(e))
        raise HTTPException(status_code=500, detail={"error": "internal_error"})

    log_json(service="producer", level="info", event="payment_accepted", event_id=event.event_id)

    background.add_task(
        _publish_and_mark_published,
        event.event_id,
        event.user_id,
        event.model_dump(),
    )

    return {"event_id": event.event_id, "status": "accepted", "message": "Payment event queued for processing"}


@app.get("/analytics")
def analytics() -> dict:
    r = _get_redis()

    total_payments = int(r.get("analytics:total_payments") or 0)
    total_volume = float(r.get("analytics:total_volume") or 0.0)

    by_currency: dict[str, int] = {}
    for key in r.scan_iter("analytics:payments_by_currency:*"):
        currency = key.split(":")[-1]
        by_currency[currency] = int(r.get(key) or 0)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM dead_letter_events")
            dlq_count = int(cur.fetchone()[0])

    return {
        "total_payments": total_payments,
        "total_volume": total_volume,
        "by_currency": by_currency,
        "dlq_count": dlq_count,
    }

