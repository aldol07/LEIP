from typing import Literal

from pydantic import BaseModel, Field


class GeminiAnalysis(BaseModel):
    updated_summary: str
    key_moments: list[str]
    trend: Literal["momentum", "stable", "reversal"]
    prediction: str
    confidence: float = Field(ge=0.0, le=1.0)
