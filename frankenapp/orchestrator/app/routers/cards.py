"""Character card CRUD router."""

import logging
import os
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from typing import Optional

from app.config import settings
from app.services.cards import CardLibrary
from app.schemas.cards import CharacterCard

logger = logging.getLogger(__name__)

router = APIRouter()

# Only allow safe filename characters
_SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9_\-][A-Za-z0-9_\-. ]*\.(json|png)$")


def _cards_root() -> Path:
    root = Path(settings.cards_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _find_card_file(filename: str) -> Path:
    """Find an existing card file by exact name match from the directory listing.

    Uses directory enumeration (not user input) as the final path source,
    preventing path traversal even if filename validation is bypassed.
    Raises HTTPException if the filename is invalid or the file is not found.
    """
    base = os.path.basename(filename)
    if not _SAFE_FILENAME_RE.match(base):
        raise HTTPException(status_code=400, detail="Invalid filename")
    root = _cards_root()
    for entry in root.iterdir():
        if entry.name == base:
            return entry
    raise HTTPException(status_code=404, detail="Card not found")


def _lib(request: Request) -> CardLibrary:
    return CardLibrary(settings.cards_dir)


@router.get("")
async def list_cards(request: Request):
    lib = _lib(request)
    return await lib.list_cards()


@router.get("/{filename}")
async def get_card(filename: str, request: Request):
    safe_entry = _find_card_file(filename)
    lib = _lib(request)
    try:
        card = await lib.load_card(safe_entry.name)
        return card
    except Exception:
        logger.exception("Error loading card %s", safe_entry.name)
        raise HTTPException(status_code=500, detail="Failed to load card")


@router.post("")
async def create_card(
    card_json: str = Form(...),
    png_file: Optional[UploadFile] = File(None),
    request: Request = None,
):
    import json

    lib = _lib(request)
    try:
        card_data = json.loads(card_json)
        card = CharacterCard(**card_data)
        # Build filename from card name using only safe characters (not from URL param)
        safe_name = re.sub(r"[^A-Za-z0-9_\-]", "_", card.name)[:64] or "card"
        filename = f"{safe_name}.json"
        await lib.save_card(card, filename)
        return {"saved": filename}
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Error saving card")
        raise HTTPException(status_code=500, detail="Failed to save card")


@router.delete("/{filename}")
async def delete_card(filename: str):
    safe_entry = _find_card_file(filename)
    safe_entry.unlink()
    return {"deleted": safe_entry.name}
