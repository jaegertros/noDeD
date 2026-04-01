"""Context budget response models and request schemas."""

from typing import Optional
from pydantic import BaseModel


class ContextBreakdown(BaseModel):
    system_prompt: int = 0
    character_card: int = 0
    example_messages: int = 0
    conversation_history: int = 0
    template_overhead: int = 0
    reserved_for_generation: int = 300


class ContextBudget(BaseModel):
    total_context: int
    breakdown: ContextBreakdown
    used: int
    available: int
    overflow: int  # >0 means conversation will be truncated
    utilization_percent: float
    template_name: str
    quant_type: Optional[str] = None
    warnings: list[str] = []


class ContextBudgetRequest(BaseModel):
    system_prompt: Optional[str] = None
    card_name: Optional[str] = None
    session_id: Optional[str] = None
    max_length: int = 300
