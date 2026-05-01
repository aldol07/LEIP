from collections import defaultdict
from threading import Lock

_lock = Lock()
_event_connections: dict[int, int] = defaultdict(int)


def connect(event_id: int) -> None:
    with _lock:
        _event_connections[event_id] += 1


def disconnect(event_id: int) -> None:
    with _lock:
        if _event_connections.get(event_id, 0) <= 1:
            _event_connections.pop(event_id, None)
        else:
            _event_connections[event_id] -= 1


def total_connections() -> int:
    with _lock:
        return sum(_event_connections.values())


def per_event_connections() -> dict[int, int]:
    with _lock:
        return dict(_event_connections)
