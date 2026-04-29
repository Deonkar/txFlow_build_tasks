import os

import redis


def get_redis() -> redis.Redis:
    url = os.getenv("REDIS_URL")
    if not url:
        raise RuntimeError("Missing required env var: REDIS_URL")
    return redis.from_url(url, decode_responses=True)


def is_processed(client: redis.Redis, key: str) -> bool:
    return client.exists(key) == 1


def mark_processed(client: redis.Redis, key: str, ttl_seconds: int) -> None:
    # SET key if not exists, with TTL — ensures at-least-once processing is safe.
    ok = client.set(name=key, value="1", nx=True, ex=ttl_seconds)
    if ok is None:
        # Already exists; caller should treat as duplicate.
        return

