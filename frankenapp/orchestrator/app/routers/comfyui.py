"""ComfyUI router — workflow execution proxy."""

import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter()

# Workflows are stored alongside this package.
_WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"


def _load_workflow(name: str) -> dict:
    """Load a workflow JSON file by name (with or without .json extension)."""
    stem = name if name.endswith(".json") else f"{name}.json"
    path = _WORKFLOWS_DIR / stem
    if not path.exists():
        raise FileNotFoundError(f"Workflow not found: {stem}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@router.get("/workflows")
async def list_workflows():
    """Return the names of all available workflow JSON files."""
    try:
        _WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
        names = [p.stem for p in sorted(_WORKFLOWS_DIR.glob("*.json"))]
        return [{"name": n} for n in names]
    except Exception:
        logger.exception("Error listing workflows")
        raise HTTPException(status_code=500, detail="Failed to list workflows")


@router.post("/execute-and-wait")
async def execute_and_wait(body: dict, request: Request):
    """Load a workflow by name, apply overrides, execute, and return the image URL."""
    workflow_name = body.get("workflow_name", "expression_swap")
    overrides = body.get("overrides") or {}

    # Inject sampler overrides directly into KSampler node if present
    steps = body.get("steps")
    cfg = body.get("cfg")
    seed = body.get("seed")

    try:
        workflow = _load_workflow(workflow_name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load workflow: {exc}") from exc

    # Apply numeric overrides to KSampler nodes if provided
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        if node.get("class_type") == "KSampler":
            inputs = node.setdefault("inputs", {})
            if steps is not None:
                inputs["steps"] = int(steps)
            if cfg is not None:
                inputs["cfg"] = float(cfg)
            if seed is not None and int(seed) != -1:
                inputs["seed"] = int(seed)

    try:
        output = await request.app.state.comfy.execute_workflow(workflow, overrides or None)
    except Exception:
        logger.exception("Error executing ComfyUI workflow '%s'", workflow_name)
        raise HTTPException(status_code=500, detail="Workflow execution failed")

    # Extract the first image from the output and build a proxy URL
    image_url = None
    images = output.get("images") or []
    if images:
        first = images[0] if isinstance(images[0], dict) else {}
        filename = first.get("filename", "")
        subfolder = first.get("subfolder", "")
        img_type = first.get("type", "output")
        if filename:
            params = f"filename={filename}&type={img_type}"
            if subfolder:
                params += f"&subfolder={subfolder}"
            image_url = f"/api/comfy/view?{params}"

    return {"image_url": image_url, "output": output}


@router.get("/view")
async def view_image(filename: str, subfolder: str = "", type: str = "output", request: Request = None):
    """Proxy an image from ComfyUI's /view endpoint."""
    import httpx
    from fastapi.responses import Response

    comfy = request.app.state.comfy
    try:
        raw = await comfy.get_image(filename, subfolder=subfolder, type=type)
        return Response(content=raw, media_type="image/png")
    except Exception:
        logger.exception("Error fetching image from ComfyUI: %s", filename)
        raise HTTPException(status_code=502, detail="Unable to fetch image from ComfyUI")


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
