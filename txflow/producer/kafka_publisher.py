from __future__ import annotations

import json
from typing import Any

from confluent_kafka import KafkaException, Producer


class KafkaPublisher:
    def __init__(self, *, bootstrap_servers: str) -> None:
        self._producer = Producer(
            {
                "bootstrap.servers": bootstrap_servers,
                "acks": "all",
                "retries": 5,
                "enable.idempotence": True,
                "compression.type": "snappy",
            }
        )

    def publish_json(self, *, topic: str, key: str, value: dict[str, Any]) -> None:
        try:
            self._producer.produce(
                topic=topic,
                key=key,
                value=json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
            )
            self._producer.flush()
        except KafkaException:
            raise

