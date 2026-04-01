from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import cards, chat, comfyui, graphs, models

# ---------------------------------------------------------------------------
# Event bus (simple in-process pub/sub for WebSocket broadcasts)
# ---------------------------------------------------------------------------

_ws_clients: list[WebSocket] = []


async def broadcast(message: dict) -> None:
    """Broadcast a JSON message to all connected WebSocket clients."""
    disconnected: list[WebSocket] = []
    for ws in list(_ws_clients):
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _ws_clients.remove(ws)


# ---------------------------------------------------------------------------
# Lifespan: create shared httpx client and wire up services
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=30.0) as http_client:
        app.state.http_client = http_client
        app.state.broadcast = broadcast

        # Lazy-import service singletons that need the http client
        from app.services.kobold import KoboldClient
        from app.services.comfy import ComfyClient
        from app.services.template_detect import TemplateDetector
        from app.services.context_budget import ContextBudgetCalculator

        kobold_client = KoboldClient(settings.kobold_url, http_client)
        comfy_client = ComfyClient(settings.comfy_url, http_client)
        template_detector = TemplateDetector()
        budget_calculator = ContextBudgetCalculator(kobold_client, template_detector)

        app.state.kobold = kobold_client
        app.state.comfy = comfy_client
        app.state.templates = template_detector
        app.state.budget = budget_calculator

        yield


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="frankenapp orchestrator",
    description="RP/chat orchestration backend for the frankenapp litegraph UI",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(comfyui.router, prefix="/api/comfy", tags=["comfyui"])
app.include_router(cards.router, prefix="/api/cards", tags=["cards"])
app.include_router(graphs.router, prefix="/api/graphs", tags=["graphs"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    kobold_ok = False
    comfy_ok = False

    if hasattr(app.state, "kobold"):
        kobold_ok = await app.state.kobold.check_health()
    if hasattr(app.state, "comfy"):
        comfy_ok = await app.state.comfy.check_health()

    return {
        "status": "ok",
        "koboldcpp": "up" if kobold_ok else "down",
        "comfyui": "up" if comfy_ok else "down",
    }


# ---------------------------------------------------------------------------
# WebSocket event bus
# ---------------------------------------------------------------------------


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.append(websocket)
    try:
        while True:
            # Keep connection alive; clients may send pings
            data = await websocket.receive_text()
            # Echo back for now; future: handle client commands
            await websocket.send_json({"echo": data})
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)
