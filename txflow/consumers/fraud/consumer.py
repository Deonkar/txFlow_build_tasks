from __future__ import annotations

import os
from typing import Any

from psycopg2 import errors

from shared.db import get_connection
from shared.dedup import get_redis, is_processed, mark_processed
from shared.kafka_consumer import BaseConsumer
from shared.structured_logging import log_json


def _risk_for_amount(amount: float, threshold: float) -> tuple[bool, str, str]:
    if amount > threshold:
        return True, "HIGH_RISK", "amount_exceeds_threshold"
    if amount > (threshold / 2):
        return True, "MEDIUM_RISK", "large_transaction"
    return False, "CLEAR", ""


class FraudConsumer(BaseConsumer):
    def __init__(self) -> None:
        super().__init__(group_id="fraud", service="consumer-fraud")
        self._redis = get_redis()
        self._dedup_ttl = int(os.getenv("DEDUP_TTL_SECONDS", "86400"))
        self._threshold = float(os.getenv("FRAUD_THRESHOLD", "10000"))

    def process(self, event: dict[str, Any]) -> None:
        event_id = event["event_id"]
        user_id = event["user_id"]
        amount = float(event["amount"])

        dedup_key = f"fraud:processed:{event_id}"
        if is_processed(self._redis, dedup_key):
            log_json(service=self.service, level="info", event="dedup_skip", consumer_group=self.group_id, event_id=event_id)
            return

        is_flagged, risk_level, reason = _risk_for_amount(amount, self._threshold)

        with get_connection() as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO fraud_assessments (event_id, user_id, amount, is_flagged, risk_level, reason, assessed_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (event_id, user_id, amount, is_flagged, risk_level, reason),
                    )
            except errors.UniqueViolation:
                # Already assessed; treat as idempotent success.
                log_json(
                    service=self.service,
                    level="info",
                    event="db_idempotency_skip",
                    consumer_group=self.group_id,
                    event_id=event_id,
                )

        mark_processed(self._redis, dedup_key, ttl_seconds=self._dedup_ttl)
        log_json(
            service=self.service,
            level="info",
            event="fraud_assessed",
            consumer_group=self.group_id,
            event_id=event_id,
            user_id=user_id,
            amount=amount,
            is_flagged=is_flagged,
            risk_level=risk_level,
        )


def main() -> None:
    FraudConsumer().start()


if __name__ == "__main__":
    main()

