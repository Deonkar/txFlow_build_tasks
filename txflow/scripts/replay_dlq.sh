#!/usr/bin/env bash
set -euo pipefail

DLQ_URL="${DLQ_URL:-http://localhost:8001/dlq}"
API_URL="${API_URL:-http://localhost:8000}"

echo "Fetching DLQ events from $DLQ_URL ..."

python - <<PY
import json, sys, urllib.request

dlq_url = "${DLQ_URL}"
api_url = "${API_URL}"

with urllib.request.urlopen(dlq_url, timeout=10) as resp:
    data = json.loads(resp.read().decode("utf-8"))

if not data:
    print("No DLQ events to replay.")
    sys.exit(0)

replayed = 0
for row in data:
    original = row.get("original_payload") or {}
    # Replaying via POST /payment is not production-safe; for learning only.
    req = urllib.request.Request(
        api_url + "/payment",
        data=json.dumps(original).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        replayed += 1
    except Exception as e:
        print(f"Replay failed for event_id={row.get('event_id')}: {e}")

print(f"Replayed {replayed} events.")
PY

