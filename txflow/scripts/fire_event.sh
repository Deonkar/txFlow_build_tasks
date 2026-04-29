#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"

users=("user_001" "user_002" "user_003" "user_004" "user_005")
user_id="${users[$((RANDOM % ${#users[@]}))]}"

amount="${AMOUNT:-$(( (RANDOM % 15000) + 10 ))}"
currency="${CURRENCY:-USD}"
idempotency_key="${IDEMPOTENCY_KEY:-$(date +%s%N)}"

payload="$(cat <<EOF
{"user_id":"$user_id","amount":$amount,"currency":"$currency","idempotency_key":"$idempotency_key"}
EOF
)"

curl -sS -X POST "$API_URL/payment" \
  -H "Content-Type: application/json" \
  -d "$payload"

