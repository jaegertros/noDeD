"""Chat request/response schemas."""

from typing import Optional
from pydantic import BaseModel


class SamplingParams(BaseModel):
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40
    rep_pen: float = 1.1
    min_p: float = 0.05
    max_length: int = 300
    top_a: float = 0.0
    tfs: float = 1.0
    typical: float = 1.0
    rep_pen_range: int = 1024
    presence_penalty: float = 0.0


class ChatRequest(BaseModel):
    message: str
    card_name: Optional[str] = None
    session_id: str = "default"
    user_name: str = "User"
    sampling: Optional[dict] = None
    template_override: Optional[str] = None


class ChatSession(BaseModel):
    session_id: str
    card_name: Optional[str] = None
    message_count: int = 0
    last_active: Optional[str] = None
