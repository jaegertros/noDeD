"""ComfyUI router — workflow execution proxy."""

import logging

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/execute")
async def execute_workflow(body: dict, request: Request):
    try:
        result = await request.app.state.comfy.execute_workflow(
            body.get("workflow", {}),
            body.get("overrides"),
        )
        return result
    except Exception:
        logger.exception("Error executing ComfyUI workflow")
        raise HTTPException(status_code=500, detail="Workflow execution failed")


@router.get("/health")
async def comfy_health(request: Request):
    ok = await request.app.state.comfy.check_health()
    return {"status": "up" if ok else "down"}


@router.post("/interrupt")
async def interrupt(request: Request):
    ok = await request.app.state.comfy.interrupt()
    return {"success": ok}


@router.get("/nodes")
async def get_node_info(request: Request):
    try:
        return await request.app.state.comfy.get_object_info()
    except Exception:
        logger.exception("Error fetching ComfyUI node info")
        raise HTTPException(status_code=502, detail="Unable to reach ComfyUI")
