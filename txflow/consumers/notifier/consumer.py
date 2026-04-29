from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

from shared.dedup import get_redis, is_processed, mark_processed
from shared.kafka_consumer import BaseConsumer
from shared.structured_logging import log_json


class NotifierConsumer(BaseConsumer):
    def __init__(self) -> None:
        super().__init__(group_id="notify", service="consumer-notifier")
        self._redis = get_redis()
        self._dedup_ttl = int(os.getenv("DEDUP_TTL_SECONDS", "86400"))

    def process(self, event: dict[str, Any]) -> None:
        event_id = event["event_id"]
        user_id = event["user_id"]
        amount = event["amount"]
        currency = event.get("currency")

        dedup_key = f"notify:processed:{event_id}"
        if is_processed(self._redis, dedup_key):
            log_json(service=self.service, level="info", event="dedup_skip", consumer_group=self.group_id, event_id=event_id)
            return

        # POC: simulate email send as structured stdout log.
        log_json(
            service=self.service,
            level="info",
            event="notification_sent",
            consumer_group=self.group_id,
            event_id=event_id,
            user_id=user_id,
            amount=amount,
            currency=currency,
        )

        mark_processed(self._redis, dedup_key, ttl_seconds=self._dedup_ttl)


def main() -> None:
    NotifierConsumer().start()


if __name__ == "__main__":
    main()

