from __future__ import annotations

import json
import os
from typing import Any

from shared.db import get_connection
from shared.dedup import get_redis, is_processed, mark_processed
from shared.kafka_consumer import BaseConsumer
from shared.structured_logging import log_json


class AuditConsumer(BaseConsumer):
    def __init__(self) -> None:
        super().__init__(group_id="audit", service="consumer-audit")
        self._redis = get_redis()
        self._dedup_ttl = int(os.getenv("DEDUP_TTL_SECONDS", "86400"))

    def process(self, event: dict[str, Any]) -> None:
        event_id = event["event_id"]
        user_id = event["user_id"]
        event_type = event.get("event_type", "payment_initiated")

        dedup_key = f"audit:processed:{event_id}"
        if is_processed(self._redis, dedup_key):
            log_json(service=self.service, level="info", event="dedup_skip", consumer_group=self.group_id, event_id=event_id)
            return

        # Append-only audit row; never update/delete.
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_log (event_id, event_type, user_id, payload, logged_at)
                    VALUES (%s, %s, %s, %s::jsonb, NOW())
                    """,
                    (event_id, event_type, user_id, json.dumps(event)),
                )

        mark_processed(self._redis, dedup_key, ttl_seconds=self._dedup_ttl)
        log_json(service=self.service, level="info", event="audit_logged", consumer_group=self.group_id, event_id=event_id)


def main() -> None:
    AuditConsumer().start()


if __name__ == "__main__":
    main()

