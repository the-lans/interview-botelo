from collections import defaultdict, deque
from time import time

WINDOW_SEC = 60 * 5
MAX_ATTEMPTS = 5

_attempts: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str) -> bool:
    now = time()
    q = _attempts[key]
    while q and now - q[0] > WINDOW_SEC:
        q.popleft()
    if len(q) >= MAX_ATTEMPTS:
        return False
    q.append(now)
    return True
