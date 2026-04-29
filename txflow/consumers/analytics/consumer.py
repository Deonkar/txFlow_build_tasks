from __future__ import annotations

import os
from typing import Any

from shared.dedup import get_redis, is_processed, mark_processed
from shared.kafka_consumer import BaseConsumer
from shared.structured_logging import log_json


class AnalyticsConsumer(BaseConsumer):
    def __init__(self) -> None:
        # No DLQ requirement for analytics (non-critical).
        super().__init__(group_id="analytics", service="consumer-analytics", enable_dlq=False)
        self._redis = get_redis()
        self._dedup_ttl = int(os.getenv("DEDUP_TTL_SECONDS", "86400"))

    def process(self, event: dict[str, Any]) -> None:
        event_id = event["event_id"]
        user_id = event["user_id"]
        currency = str(event.get("currency", "")).upper()
        amount = float(event.get("amount", 0))

        dedup_key = f"analytics:processed:{event_id}"
        if is_processed(self._redis, dedup_key):
            log_json(service=self.service, level="info", event="dedup_skip", consumer_group=self.group_id, event_id=event_id)
            return

        pipe = self._redis.pipeline()
        pipe.incr("analytics:total_payments")
        # Keep total_volume as float sum.
        pipe.incrbyfloat("analytics:total_volume", amount)
        if currency:
            pipe.incr(f"analytics:payments_by_currency:{currency}")
        pipe.incr(f"analytics:payments_by_user:{user_id}")
        pipe.execute()

        mark_processed(self._redis, dedup_key, ttl_seconds=self._dedup_ttl)
        log_json(
            service=self.service,
            level="info",
            event="analytics_updated",
            consumer_group=self.group_id,
            event_id=event_id,
            user_id=user_id,
            currency=currency,
            amount=amount,
        )


def main() -> None:
    AnalyticsConsumer().start()


if __name__ == "__main__":
    main()

