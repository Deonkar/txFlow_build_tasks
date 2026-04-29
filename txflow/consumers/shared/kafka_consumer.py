from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Callable

from confluent_kafka import Consumer, KafkaException, Message, Producer

from shared.structured_logging import log_json


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


@dataclass(frozen=True)
class RetryConfig:
    max_attempts: int
    base_delay_ms: int


class BaseConsumer:
    def __init__(self, *, group_id: str, service: str, enable_dlq: bool = True) -> None:
        self.group_id = group_id
        self.service = service
        self.enable_dlq = enable_dlq

        self.topic = _require_env("PAYMENTS_TOPIC")
        self.dlq_topic = _require_env("DLQ_TOPIC")
        self.retry = RetryConfig(
            max_attempts=int(_require_env("MAX_RETRY_ATTEMPTS")),
            base_delay_ms=int(_require_env("RETRY_BASE_DELAY_MS")),
        )

        self._consumer = Consumer(
            {
                "bootstrap.servers": _require_env("KAFKA_BOOTSTRAP_SERVERS"),
                "group.id": self.group_id,
                "enable.auto.commit": False,
                "auto.offset.reset": "earliest",
            }
        )

        self._dlq_producer = Producer(
            {
                "bootstrap.servers": _require_env("KAFKA_BOOTSTRAP_SERVERS"),
                "acks": "all",
                "retries": 5,
                "enable.idempotence": True,
                "compression.type": "snappy",
            }
        )

    def start(self) -> None:
        log_json(service=self.service, level="info", event="consumer_starting", consumer_group=self.group_id)
        self._consumer.subscribe([self.topic])
        try:
            self._poll_loop()
        finally:
            self._consumer.close()

    def _poll_loop(self) -> None:
        while True:
            msg = self._consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                log_json(service=self.service, level="error", event="kafka_poll_error", error=str(msg.error()))
                continue
            self._handle_message(msg)

    def _handle_message(self, msg: Message) -> None:
        raw = msg.value()
        if raw is None:
            log_json(service=self.service, level="error", event="message_missing_value")
            self._consumer.commit(message=msg, asynchronous=False)
            return

        try:
            event = json.loads(raw.decode("utf-8"))
        except Exception as e:
            log_json(service=self.service, level="error", event="message_json_decode_failed", error=str(e))
            if self.enable_dlq:
                self._publish_to_dlq(original_event={"_raw": raw.decode("utf-8", errors="replace")}, error_message=str(e))
            self._consumer.commit(message=msg, asynchronous=False)
            return

        event_id = event.get("event_id")

        for attempt in range(self.retry.max_attempts):
            try:
                self.process(event)
                self._consumer.commit(message=msg, asynchronous=False)
                log_json(
                    service=self.service,
                    level="info",
                    event="message_processed",
                    consumer_group=self.group_id,
                    event_id=event_id,
                    offset=msg.offset(),
                    partition=msg.partition(),
                )
                return
            except Exception as e:
                if attempt == self.retry.max_attempts - 1:
                    log_json(
                        service=self.service,
                        level="error",
                        event="message_failed_exhausted_retries",
                        consumer_group=self.group_id,
                        event_id=event_id,
                        error=str(e),
                        attempt=attempt + 1,
                    )
                    if self.enable_dlq:
                        self._publish_to_dlq(original_event=event, error_message=str(e))
                    self._consumer.commit(message=msg, asynchronous=False)
                    return

                delay_ms = self.retry.base_delay_ms * (2**attempt)
                log_json(
                    service=self.service,
                    level="warn",
                    event="message_processing_retry",
                    consumer_group=self.group_id,
                    event_id=event_id,
                    error=str(e),
                    attempt=attempt + 1,
                    backoff_ms=delay_ms,
                )
                time.sleep(delay_ms / 1000.0)

    def _publish_to_dlq(self, *, original_event: dict[str, Any], error_message: str) -> None:
        envelope = {
            "original_event": original_event,
            "failure_metadata": {
                "consumer_group": self.group_id,
                "error_message": error_message,
                "retry_count": self.retry.max_attempts,
                "failed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        }

        key = None
        if isinstance(original_event, dict):
            key = original_event.get("user_id")

        self._dlq_producer.produce(
            topic=self.dlq_topic,
            key=str(key) if key is not None else None,
            value=json.dumps(envelope, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
        )
        self._dlq_producer.flush()
        log_json(
            service=self.service,
            level="error",
            event="dlq_published",
            consumer_group=self.group_id,
            event_id=(original_event.get("event_id") if isinstance(original_event, dict) else None),
        )

    def process(self, event: dict[str, Any]) -> None:
        raise NotImplementedError

