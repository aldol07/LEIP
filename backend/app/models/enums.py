from enum import Enum


class UserRole(str, Enum):
    analyst = "analyst"
    viewer = "viewer"


class EventStatus(str, Enum):
    scheduled = "Scheduled"
    live = "Live"
    final = "Final"


class StageStatus(str, Enum):
    pending = "pending"
    active = "active"
    done = "done"


class TrendDirection(str, Enum):
    momentum = "momentum"
    stable = "stable"
    reversal = "reversal"


class AlertRuleType(str, Enum):
    keyword_detected = "keyword_detected"
    score_threshold = "score_threshold"
    trend_change = "trend_change"
