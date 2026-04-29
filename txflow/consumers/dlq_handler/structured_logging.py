import json
from datetime import UTC, datetime
from typing import Any


def log_json(*, service: str, level: str, event: str, **fields: Any) -> None:
    payload: dict[str, Any] = {
        "service": service,
        "level": level,
        "event": event,
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    payload.update(fields)
    print(json.dumps(payload, ensure_ascii=False), flush=True)

