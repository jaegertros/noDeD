"""Character card parser — SillyTavern V2 format."""

import base64
import json
import re
from pathlib import Path
from typing import Optional

from app.schemas.cards import CharacterCard


class CardLibrary:
    def __init__(self, cards_dir: str):
        self.cards_dir = Path(cards_dir)

    async def load_card(self, filename: str) -> CharacterCard:
        path = self.cards_dir / filename
        if not path.exists():
            raise FileNotFoundError(f"Card not found: {filename}")

        if filename.lower().endswith(".png"):
            return await self._load_png_card(path)
        elif filename.lower().endswith(".json"):
            return await self._load_json_card(path)
        else:
            raise ValueError(f"Unsupported card format: {filename}")

    async def _load_json_card(self, path: Path) -> CharacterCard:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Handle SillyTavern V2 wrapper
        if "data" in data and isinstance(data["data"], dict):
            data = data["data"]
        return self._parse_card_data(data)

    async def _load_png_card(self, path: Path) -> CharacterCard:
        """Extract chara metadata from PNG tEXt chunk."""
        try:
            from PIL import Image

            img = Image.open(path)
            meta = img.info
            chara_b64 = meta.get("chara")
            if not chara_b64:
                raise ValueError("No 'chara' tEXt chunk in PNG")
            card_json = base64.b64decode(chara_b64).decode("utf-8")
            data = json.loads(card_json)
            if "data" in data and isinstance(data["data"], dict):
                data = data["data"]
            return self._parse_card_data(data)
        except ImportError as exc:
            raise RuntimeError("Pillow is required for PNG card parsing") from exc

    def _parse_card_data(self, data: dict) -> CharacterCard:
        # Parse expression_map from extensions if present
        extensions = data.get("extensions", {})
        expression_map = extensions.get("expression_map", {})
        return CharacterCard(
            name=data.get("name", ""),
            description=data.get("description", ""),
            personality=data.get("personality", ""),
            first_mes=data.get("first_mes", ""),
            mes_example=data.get("mes_example", ""),
            scenario=data.get("scenario", ""),
            system_prompt=data.get("system_prompt", ""),
            creator_notes=data.get("creator_notes", ""),
            tags=data.get("tags", []),
            character_book=data.get("character_book"),
            extensions=extensions,
            expression_map=expression_map,
        )

    async def list_cards(self) -> list[dict]:
        self.cards_dir.mkdir(parents=True, exist_ok=True)
        result = []
        for path in sorted(self.cards_dir.iterdir()):
            if path.suffix.lower() not in (".json", ".png"):
                continue
            try:
                card = await self.load_card(path.name)
                result.append(
                    {
                        "filename": path.name,
                        "name": card.name,
                        "description_preview": card.description[:120] if card.description else "",
                        "has_expressions": bool(card.expression_map),
                    }
                )
            except Exception:
                result.append(
                    {
                        "filename": path.name,
                        "name": path.stem,
                        "description_preview": "",
                        "has_expressions": False,
                    }
                )
        return result

    async def save_card(self, card: CharacterCard, filename: str) -> None:
        self.cards_dir.mkdir(parents=True, exist_ok=True)
        path = self.cards_dir / filename
        with open(path, "w", encoding="utf-8") as f:
            json.dump(card.model_dump(), f, indent=2, ensure_ascii=False)

    # ------------------------------------------------------------------
    # Emotion detection
    # ------------------------------------------------------------------

    _EMOTION_MAP: list[tuple[re.Pattern, str]] = [
        (re.compile(r"\b(smil|laugh|grin|chuckl|giggl)", re.I), "happy"),
        (re.compile(r"\b(cr(y|ies|ied)|sob|tear|weep)", re.I), "sad"),
        (re.compile(r"\b(glar|scowl|frown|furi|angr|rage)", re.I), "angry"),
        (re.compile(r"\b(blush|sh(y|ies|ied)|embarrass)", re.I), "embarrassed"),
        (re.compile(r"\b(shock|gasp|surpris|jolt|startl)", re.I), "surprised"),
        (re.compile(r"\b(fear|trembl|shiver|terrif|scared)", re.I), "afraid"),
    ]

    def detect_emotion(self, text: str) -> Optional[str]:
        """Detect emotion from *action text* between asterisks."""
        # Extract action text (between asterisks)
        action_texts = re.findall(r"\*([^*]+)\*", text)
        if not action_texts:
            return None
        combined = " ".join(action_texts)
        for pattern, emotion in self._EMOTION_MAP:
            if pattern.search(combined):
                return emotion
        return None
