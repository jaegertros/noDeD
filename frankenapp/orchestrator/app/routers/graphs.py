"""Graphs router — save/load litegraph configurations."""

import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_\-]{0,127}$")


def _graphs_root() -> Path:
    root = Path(settings.graphs_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _find_graph_file(name: str) -> Path:
    """Find an existing graph JSON file by exact stem match from directory listing.

    Uses directory enumeration (not user input) as the final path source,
    preventing path traversal. Raises HTTPException if invalid or not found.
    """
    clean = os.path.basename(name)
    if not _SAFE_NAME_RE.match(clean):
        raise HTTPException(status_code=400, detail="Invalid graph name")
    root = _graphs_root()
    expected = f"{clean}.json"
    for entry in root.iterdir():
        if entry.name == expected:
            return entry
    raise HTTPException(status_code=404, detail="Graph not found")


def _new_graph_path(name: str) -> Path:
    """Return a safe path for a new graph file (does not need to exist yet).

    Validates the name and confirms containment within the graphs directory.
    """
    clean = os.path.basename(name)
    if not _SAFE_NAME_RE.match(clean):
        raise HTTPException(status_code=400, detail="Invalid graph name")
    root = _graphs_root()
    candidate = (root / f"{clean}.json").resolve()  # lgtm[py/path-injection]
    if not str(candidate).startswith(str(root) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid graph name")
    return candidate


class GraphSaveRequest(BaseModel):
    name: str
    graph_data: dict


@router.post("")
async def save_graph(body: GraphSaveRequest):
    safe_path = _new_graph_path(body.name)
    with open(safe_path, "w") as f:  # lgtm[py/path-injection]
        json.dump(body.graph_data, f, indent=2)
    return {"saved": safe_path.stem}


@router.get("")
async def list_graphs():
    root = _graphs_root()
    result = []
    for entry in root.iterdir():
        if entry.suffix != ".json":
            continue
        stat = entry.stat()
        try:
            with open(entry) as f:
                data = json.load(f)
            node_count = len(data.get("nodes", []))
        except Exception:
            node_count = 0
        result.append(
            {
                "name": entry.stem,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "node_count": node_count,
            }
        )
    return sorted(result, key=lambda x: x["modified"], reverse=True)


@router.get("/{name}")
async def load_graph(name: str):
    safe_entry = _find_graph_file(name)
    with open(safe_entry) as f:
        return json.load(f)


@router.delete("/{name}")
async def delete_graph(name: str):
    safe_entry = _find_graph_file(name)
    safe_entry.unlink()
    return {"deleted": safe_entry.stem}


@router.post("/{name}/export")
async def export_graph(name: str):
    """Export graph with embedded card data for portability."""
    from app.services.cards import CardLibrary

    safe_entry = _find_graph_file(name)
    with open(safe_entry) as f:
        graph_data = json.load(f)

    card_lib = CardLibrary(settings.cards_dir)
    cards_embedded: dict = {}
    for node in graph_data.get("nodes", []):
        card_name = node.get("properties", {}).get("card_name")
        if card_name and card_name not in cards_embedded:
            try:
                card = await card_lib.load_card(card_name)
                cards_embedded[card_name] = card.model_dump()
            except Exception:
                pass

    return {"graph": graph_data, "cards": cards_embedded, "exported_at": datetime.utcnow().isoformat()}


@router.post("/import")
async def import_graph(body: dict):
    """Import a graph export, copying embedded cards to /cards/."""
    from app.services.cards import CardLibrary
    from app.schemas.cards import CharacterCard

    graph_data = body.get("graph", {})
    cards_data = body.get("cards", {})

    card_lib = CardLibrary(settings.cards_dir)
    saved_cards = []
    for card_name, card_dict in cards_data.items():
        try:
            card = CharacterCard(**card_dict)
            safe_name = re.sub(r"[^A-Za-z0-9_\-]", "_", card.name)[:64] or "card"
            filename = f"{safe_name}.json"
            await card_lib.save_card(card, filename)
            saved_cards.append(filename)
        except Exception:
            pass

    # Derive safe name from graph data, not from path param
    raw_name = graph_data.get("name", f"imported_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    safe_graph_name = re.sub(r"[^A-Za-z0-9_\-]", "_", str(raw_name))[:64] or "imported"
    safe_path = _new_graph_path(safe_graph_name)
    with open(safe_path, "w") as f:  # lgtm[py/path-injection]
        json.dump(graph_data, f, indent=2)

    return {"imported_graph": safe_path.stem, "imported_cards": saved_cards}
