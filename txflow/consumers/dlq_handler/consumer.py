from __future__ import annotations

import json
import os
from typing import Any

from confluent_kafka import Consumer, Message

from dlq_handler.db import get_connection
from dlq_handler.structured_logging import log_json


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


class DlqConsumer:
    def __init__(self) -> None:
        self.service = "dlq-handler"
        self.group_id = "dlq"
        self.topic = _require_env("DLQ_TOPIC")

        self._consumer = Consumer(
            {
                "bootstrap.servers": _require_env("KAFKA_BOOTSTRAP_SERVERS"),
                "group.id": self.group_id,
                "enable.auto.commit": False,
                "auto.offset.reset": "earliest",
            }
        )

    def start(self) -> None:
        log_json(service=self.service, level="info", event="consumer_starting", consumer_group=self.group_id)
        self._consumer.subscribe([self.topic])
        try:
            while True:
                msg = self._consumer.poll(1.0)
                if msg is None:
                    continue
                if msg.error():
                    log_json(service=self.service, level="error", event="kafka_poll_error", error=str(msg.error()))
                    continue
                self._handle(msg)
        finally:
            self._consumer.close()

    def _handle(self, msg: Message) -> None:
        raw = msg.value()
        if raw is None:
            self._consumer.commit(message=msg, asynchronous=False)
            return

        try:
            envelope = json.loads(raw.decode("utf-8"))
        except Exception as e:
            log_json(service=self.service, level="error", event="dlq_json_decode_failed", error=str(e))
            self._consumer.commit(message=msg, asynchronous=False)
            return

        original_event = envelope.get("original_event", {})
        failure = envelope.get("failure_metadata", {})

        event_id = original_event.get("event_id")
        if not event_id:
            # Some DLQ events may wrap an unparseable original payload under _raw.
            # Keep DB constraint satisfied with a sentinel UUID (not production-safe; fine for learning POC).
            event_id = "00000000-0000-0000-0000-000000000000"
        consumer_group = failure.get("consumer_group")
        error_message = failure.get("error_message")
        retry_count = int(failure.get("retry_count", 3))

        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO dead_letter_events (event_id, consumer_group, original_payload, error_message, retry_count, failed_at)
                        VALUES (%s, %s, %s::jsonb, %s, %s, NOW())
                        """,
                        (event_id, consumer_group, json.dumps(original_event), error_message, retry_count),
                    )
        except Exception as e:
            log_json(
                service=self.service,
                level="error",
                event="dlq_db_insert_failed",
                consumer_group=consumer_group,
                event_id=event_id,
                error=str(e),
            )
            # Still commit to avoid reprocessing a poison DLQ record forever.
            self._consumer.commit(message=msg, asynchronous=False)
            return

        log_json(
            service=self.service,
            level="info",
            event="dlq_received",
            consumer_group=consumer_group,
            event_id=event_id,
            error=error_message,
        )
        self._consumer.commit(message=msg, asynchronous=False)


def main() -> None:
    DlqConsumer().start()


if __name__ == "__main__":
    main()

