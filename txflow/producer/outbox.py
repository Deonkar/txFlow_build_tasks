from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from psycopg2 import errors
from psycopg2.extensions import connection as Connection
from psycopg2.extras import RealDictCursor

from models import PaymentEvent


class DuplicateIdempotencyKeyError(Exception):
    pass


def insert_outbox_event(conn: Connection, event: PaymentEvent) -> None:
    sql = """
        INSERT INTO outbox_events (event_id, event_type, idempotency_key, payload, published)
        VALUES (%s, %s, %s, %s::jsonb, false)
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                (
                    event.event_id,
                    event.event_type,
                    event.idempotency_key,
                    event.model_dump_json(),
                ),
            )
    except errors.UniqueViolation as e:
        raise DuplicateIdempotencyKeyError() from e


def mark_published(conn: Connection, *, event_id: str) -> None:
    sql = "UPDATE outbox_events SET published = true WHERE event_id = %s"
    with conn.cursor() as cur:
        cur.execute(sql, (event_id,))


def get_unpublished_events(conn: Connection, *, limit: int = 100) -> list[dict[str, Any]]:
    sql = """
        SELECT event_id, payload
        FROM outbox_events
        WHERE published = false
        ORDER BY created_at
        LIMIT %s
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, (limit,))
        return list(cur.fetchall())

