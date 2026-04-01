"""Chat router — SSE streaming chat endpoint."""

import asyncio
import json
import logging
import os
from typing import AsyncGenerator

import aiosqlite
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.schemas.chat import ChatRequest, ChatSession

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------

DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    emotion TEXT,
    card_name TEXT,
    token_count INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id, timestamp);
"""


async def get_db(request: Request) -> AsyncGenerator:
    import os

    db_path = os.path.join(settings.state_dir, "frankenapp.db")
    os.makedirs(settings.state_dir, exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(DB_SCHEMA)
        await db.commit()
        yield db


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/message")
async def send_message(body: ChatRequest, request: Request):
    """Stream a chat response via SSE."""

    kobold = request.app.state.kobold
    templates = request.app.state.templates
    budget_calc = request.app.state.budget

    async def event_stream() -> AsyncGenerator[str, None]:
        # 1. Load card
        from app.services.cards import CardLibrary

        card_lib = CardLibrary(settings.cards_dir)
        card = None
        if body.card_name:
            try:
                card = await card_lib.load_card(body.card_name)
            except Exception:
                card = None

        # 2. Auto-detect template
        model_info: dict = {}
        try:
            model_info = await kobold.get_model_info()
        except Exception:
            pass

        template_name = body.template_override or (model_info.get("model_name", "") if model_info else "")
        template = templates.detect_template(template_name)

        # 3. Load history
        db_path = os.path.join(settings.state_dir, "frankenapp.db")
        history: list[dict] = []
        try:
            async with aiosqlite.connect(db_path) as db:
                await db.executescript(DB_SCHEMA)
                await db.commit()
                async with db.execute(
                    "SELECT role, content FROM messages WHERE session_id=? ORDER BY timestamp ASC",
                    (body.session_id,),
                ) as cursor:
                    rows = await cursor.fetchall()
                    history = [{"role": r[0], "content": r[1]} for r in rows]
        except Exception:
            history = []

        # 4. Build messages list
        messages: list[dict] = []
        if card:
            system_parts = []
            if card.system_prompt:
                system_parts.append(card.system_prompt)
            if card.description:
                system_parts.append(card.description)
            if card.personality:
                system_parts.append(f"Personality: {card.personality}")
            if card.scenario:
                system_parts.append(f"Scenario: {card.scenario}")
            if system_parts:
                messages.append({"role": "system", "content": "\n\n".join(system_parts)})
            if card.mes_example:
                messages.append({"role": "system", "content": card.mes_example})

        messages.extend(history)
        messages.append({"role": "user", "content": body.message})

        # 5. Build prompt
        prompt = templates.build_prompt(template, messages)

        # 6. Calculate context budget and emit
        try:
            card_desc = card.description if card else ""
            card_personality = card.personality if card else ""
            card_scenario = card.scenario if card else ""
            card_examples = card.mes_example if card else ""
            system_prompt_text = card.system_prompt if card else ""

            budget = await budget_calc.calculate_budget(
                model_info=model_info or {"loaded_context": 8192},
                template=template,
                system_prompt=system_prompt_text,
                card_description=card_desc,
                card_personality=card_personality,
                card_scenario=card_scenario,
                card_examples=card_examples,
                message_count=len(messages),
                last_messages_text="\n".join(m["content"] for m in history[-10:]),
            )
            yield sse_event(
                "context",
                {
                    "tokens_used": budget.used,
                    "tokens_remaining": budget.available,
                    "utilization_percent": budget.utilization_percent,
                },
            )
        except Exception:
            pass

        # 7. Stream generation
        sampling = body.sampling or {}
        full_response = ""
        try:
            async for token in kobold.generate(prompt, **sampling):
                full_response += token
                yield sse_event("token", {"text": token})

                # Mid-stream emotion detection (every ~50 chars)
                if len(full_response) % 50 < 5:
                    emotion = card_lib.detect_emotion(full_response) if card else None
                    if emotion:
                        yield sse_event("expression", {"emotion": emotion})
        except Exception:
            logger.exception("Error during generation for session %s", body.session_id)
            yield sse_event("error", {"message": "Generation failed"})
            return

        # 8. Final emotion
        emotion = card_lib.detect_emotion(full_response) if card else None

        # 9. Save to history
        try:
            async with aiosqlite.connect(db_path) as db:
                await db.executescript(DB_SCHEMA)
                await db.execute(
                    "INSERT INTO messages (session_id, role, content, card_name) VALUES (?,?,?,?)",
                    (body.session_id, "user", body.message, body.card_name),
                )
                await db.execute(
                    "INSERT INTO messages (session_id, role, content, emotion, card_name) VALUES (?,?,?,?,?)",
                    (body.session_id, "assistant", full_response, emotion, body.card_name),
                )
                await db.commit()
        except Exception:
            pass

        yield sse_event("done", {"full_response": full_response, "emotion": emotion})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/history/{session_id}")
async def get_history(session_id: str, request: Request):
    db_path = __import__("os").path.join(settings.state_dir, "frankenapp.db")
    try:
        async with aiosqlite.connect(db_path) as db:
            await db.executescript(DB_SCHEMA)
            await db.commit()
            async with db.execute(
                "SELECT id, role, content, emotion, timestamp FROM messages WHERE session_id=? ORDER BY timestamp ASC",
                (session_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [
                    {"id": r[0], "role": r[1], "content": r[2], "emotion": r[3], "timestamp": r[4]}
                    for r in rows
                ]
    except Exception:
        logger.exception("Error fetching chat history for session %s", session_id)
        raise HTTPException(status_code=500, detail="Failed to fetch chat history")


@router.delete("/history/{session_id}")
async def delete_history(session_id: str):
    db_path = os.path.join(settings.state_dir, "frankenapp.db")
    try:
        async with aiosqlite.connect(db_path) as db:
            await db.executescript(DB_SCHEMA)
            await db.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
            await db.commit()
        return {"deleted": session_id}
    except Exception:
        logger.exception("Error deleting chat history for session %s", session_id)
        raise HTTPException(status_code=500, detail="Failed to delete chat history")


@router.get("/sessions")
async def list_sessions():
    db_path = os.path.join(settings.state_dir, "frankenapp.db")
    try:
        async with aiosqlite.connect(db_path) as db:
            await db.executescript(DB_SCHEMA)
            await db.commit()
            async with db.execute(
                "SELECT session_id, COUNT(*) as count, MAX(timestamp) as last_active FROM messages GROUP BY session_id ORDER BY last_active DESC"
            ) as cursor:
                rows = await cursor.fetchall()
                return [{"session_id": r[0], "message_count": r[1], "last_active": r[2]} for r in rows]
    except Exception:
        logger.exception("Error listing sessions")
        raise HTTPException(status_code=500, detail="Failed to list sessions")
