"""Models router — model info, sampling, context budget."""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.schemas.context import ContextBudgetRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/info")
async def get_model_info(request: Request):
    try:
        return await request.app.state.kobold.get_model_info()
    except Exception:
        logger.exception("Error fetching model info")
        raise HTTPException(status_code=502, detail="Unable to reach model backend")


@router.get("/performance")
async def get_performance(request: Request):
    try:
        return await request.app.state.kobold.get_performance()
    except Exception:
        logger.exception("Error fetching performance stats")
        raise HTTPException(status_code=502, detail="Unable to reach model backend")


@router.put("/endpoint")
async def update_endpoint(body: dict, request: Request):
    """Update the KoboldCpp endpoint URL."""
    new_url = body.get("url")
    if not new_url:
        raise HTTPException(status_code=400, detail="url is required")
    try:
        ok = await request.app.state.kobold.update_endpoint(new_url)
        return {"success": ok, "url": request.app.state.kobold.base_url}
    except Exception:
        logger.exception("Error updating endpoint")
        raise HTTPException(status_code=500, detail="Failed to update endpoint")


@router.post("/context-budget")
async def calculate_context_budget(body: ContextBudgetRequest, request: Request):
    """Calculate the full context budget breakdown."""
    from app.services.cards import CardLibrary
    from app.config import settings

    kobold = request.app.state.kobold
    templates = request.app.state.templates
    budget_calc = request.app.state.budget

    try:
        model_info = await kobold.get_model_info()
    except Exception:
        model_info = {"loaded_context": 8192, "model_name": "", "quant_type": None}

    template = templates.detect_template(model_info.get("model_name", ""))

    card_desc = card_personality = card_scenario = card_examples = ""
    if body.card_name:
        try:
            card_lib = CardLibrary(settings.cards_dir)
            card = await card_lib.load_card(body.card_name)
            card_desc = card.description
            card_personality = card.personality
            card_scenario = card.scenario
            card_examples = card.mes_example
        except Exception:
            pass

    last_messages_text = ""
    if body.session_id:
        import aiosqlite, os
        from app.routers.chat import DB_SCHEMA

        db_path = os.path.join(settings.state_dir, "frankenapp.db")
        try:
            async with aiosqlite.connect(db_path) as db:
                await db.executescript(DB_SCHEMA)
                await db.commit()
                async with db.execute(
                    "SELECT content FROM messages WHERE session_id=? ORDER BY timestamp DESC LIMIT 20",
                    (body.session_id,),
                ) as cursor:
                    rows = await cursor.fetchall()
                    last_messages_text = "\n".join(r[0] for r in reversed(rows))
        except Exception:
            pass

    try:
        budget = await budget_calc.calculate_budget(
            model_info=model_info,
            template=template,
            system_prompt=body.system_prompt or "",
            card_description=card_desc,
            card_personality=card_personality,
            card_scenario=card_scenario,
            card_examples=card_examples,
            message_count=20,
            last_messages_text=last_messages_text,
        )
        return budget
    except Exception:
        logger.exception("Error calculating context budget")
        raise HTTPException(status_code=500, detail="Failed to calculate context budget")


@router.get("/context-budget/quick")
async def quick_context_budget(session_id: str, request: Request):
    """Lightweight context budget for real-time polling."""
    try:
        model_info = await request.app.state.kobold.get_model_info(force_refresh=False)
        return {
            "total_context": model_info.get("loaded_context", 8192),
            "model_name": model_info.get("model_name", ""),
            "quant_type": model_info.get("quant_type"),
        }
    except Exception:
        logger.exception("Error fetching quick context budget")
        raise HTTPException(status_code=502, detail="Unable to reach model backend")
