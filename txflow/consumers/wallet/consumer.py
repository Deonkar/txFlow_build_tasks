from __future__ import annotations

import os
from typing import Any

from psycopg2 import errors

from shared.db import get_connection
from shared.dedup import get_redis, is_processed, mark_processed
from shared.kafka_consumer import BaseConsumer
from shared.structured_logging import log_json


class WalletConsumer(BaseConsumer):
    def __init__(self) -> None:
        super().__init__(group_id="wallet", service="consumer-wallet")
        self._redis = get_redis()
        self._dedup_ttl = int(os.getenv("DEDUP_TTL_SECONDS", "86400"))

    def process(self, event: dict[str, Any]) -> None:
        event_id = event["event_id"]
        user_id = event["user_id"]
        amount = float(event["amount"])

        dedup_key = f"wallet:processed:{event_id}"
        if is_processed(self._redis, dedup_key):
            log_json(service=self.service, level="info", event="dedup_skip", consumer_group=self.group_id, event_id=event_id)
            return

        with get_connection() as conn:
            # Fraud gate: do not process if HIGH_RISK.
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT risk_level, is_flagged FROM fraud_assessments WHERE event_id = %s",
                    (event_id,),
                )
                row = cur.fetchone()
                if row is not None:
                    risk_level, is_flagged = row[0], row[1]
                    if is_flagged and (risk_level == "HIGH_RISK" or risk_level == "HIGH"):
                        log_json(
                            service=self.service,
                            level="warn",
                            event="fraud_flagged_skip",
                            consumer_group=self.group_id,
                            event_id=event_id,
                            user_id=user_id,
                        )
                        mark_processed(self._redis, dedup_key, ttl_seconds=self._dedup_ttl)
                        return

            # Ensure wallet exists.
            with conn.cursor() as cur:
                cur.execute("SELECT balance FROM wallets WHERE user_id = %s", (user_id,))
                row = cur.fetchone()
                if row is None:
                    cur.execute(
                        "INSERT INTO wallets (user_id, balance) VALUES (%s, %s)",
                        (user_id, 10000.00),
                    )
                    balance = 10000.00
                else:
                    balance = float(row[0])

            if balance < amount:
                raise RuntimeError("insufficient_funds")

            # DB-level idempotency: insert processed event first (unique by PK).
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO wallet_processed_events (event_id, user_id) VALUES (%s, %s)",
                        (event_id, user_id),
                    )
            except errors.UniqueViolation:
                log_json(
                    service=self.service,
                    level="info",
                    event="db_idempotency_skip",
                    consumer_group=self.group_id,
                    event_id=event_id,
                )
                mark_processed(self._redis, dedup_key, ttl_seconds=self._dedup_ttl)
                return

            # Apply debit
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE wallets SET balance = balance - %s, updated_at = NOW() WHERE user_id = %s",
                    (amount, user_id),
                )

        mark_processed(self._redis, dedup_key, ttl_seconds=self._dedup_ttl)
        log_json(
            service=self.service,
            level="info",
            event="wallet_debited",
            consumer_group=self.group_id,
            event_id=event_id,
            user_id=user_id,
            amount=amount,
        )


def main() -> None:
    WalletConsumer().start()


if __name__ == "__main__":
    main()

