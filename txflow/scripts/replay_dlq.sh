#!/usr/bin/env bash
set -eu

DLQ_URL="${DLQ_URL:-http://localhost:8001/dlq}"
KAFKA_BROKER="${KAFKA_BROKER:-redpanda:9092}"
PAYMENTS_TOPIC="${PAYMENTS_TOPIC:-payments.initiated}"

echo "Fetching DLQ events from $DLQ_URL ..."

tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT

python - <<PY > "$tmpfile"
import json, sys, urllib.request

dlq_url = "${DLQ_URL}"

with urllib.request.urlopen(dlq_url, timeout=10) as resp:
    data = json.loads(resp.read().decode("utf-8"))

if not data:
    print("No DLQ events to replay.")
    sys.exit(0)

for row in data:
    original = row.get("original_payload") or {}
    # Only replay well-formed payment events.
    if not isinstance(original, dict):
        continue
    if not original.get("user_id") or not original.get("event_id"):
        continue
    print(json.dumps(original, ensure_ascii=False))
PY

if grep -q "^No DLQ events to replay" "$tmpfile"; then
  cat "$tmpfile"
  exit 0
fi

replayed=0
while IFS= read -r line; do
  if [[ -z "$line" ]]; then
    continue
  fi
  user_id="$(python - <<PY
import json
print(json.loads('''$line''').get('user_id',''))
PY
)"
  docker compose exec -T redpanda rpk topic produce "$PAYMENTS_TOPIC" \
    -X brokers="$KAFKA_BROKER" \
    -k "$user_id" \
    -f '%v\n' <<<"$line" >/dev/null
  replayed=$((replayed+1))
done < "$tmpfile"

echo "Replayed $replayed events to $PAYMENTS_TOPIC."

