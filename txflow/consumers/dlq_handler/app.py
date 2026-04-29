from __future__ import annotations

import os
import threading
from typing import Any

from fastapi import FastAPI

from dlq_handler.consumer import DlqConsumer
from dlq_handler.db import get_connection
from dlq_handler.structured_logging import log_json

app = FastAPI(title="TxFlow DLQ Handler", version="0.1.0")


@app.on_event("startup")
def _startup() -> None:
    t = threading.Thread(target=DlqConsumer().start, name="dlq-consumer", daemon=True)
    t.start()
    log_json(service="dlq-handler", level="info", event="startup_complete")


@app.get("/dlq")
def list_dlq() -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, consumer_group, original_payload, error_message, retry_count, failed_at
                FROM dead_letter_events
                ORDER BY failed_at DESC
                LIMIT 200
                """
            )
            rows = cur.fetchall()

    results: list[dict[str, Any]] = []
    for row in rows:
        results.append(
            {
                "event_id": str(row[0]) if row[0] is not None else None,
                "consumer_group": row[1],
                "original_payload": row[2],
                "error_message": row[3],
                "retry_count": row[4],
                "failed_at": row[5].isoformat().replace("+00:00", "Z") if hasattr(row[5], "isoformat") else row[5],
            }
        )
    return results


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8001")))

