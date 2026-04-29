#!/usr/bin/env bash
set -eu

N="${N:-20}"
SLEEP_MS="${SLEEP_MS:-50}"

for i in $(seq 1 "$N"); do
  ./scripts/fire_event.sh >/dev/null
  # sleep supports seconds; convert ms to fractional seconds
  python - <<PY
import time
time.sleep(${SLEEP_MS}/1000)
PY
done

echo "Fired $N events."

