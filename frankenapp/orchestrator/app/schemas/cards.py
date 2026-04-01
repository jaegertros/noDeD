"""Character card schemas — SillyTavern V2 format."""

from typing import Optional
from pydantic import BaseModel


class CharacterCard(BaseModel):
    name: str
    description: str
    personality: str = ""
    first_mes: str = ""
    mes_example: str = ""
    scenario: str = ""
    system_prompt: str = ""
    creator_notes: str = ""
    tags: list[str] = []
    character_book: Optional[dict] = None
    extensions: dict = {}
    # Our additions
    expression_map: dict[str, dict] = {}  # emotion -> {positive, negative, ...comfy params}
