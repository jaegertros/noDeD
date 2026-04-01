"""ComfyUI async API client."""

import asyncio
import json
import uuid
from typing import Optional

import httpx
import websockets


class ComfyError(Exception):
    def __init__(self, message: str):
        super().__init__(f"ComfyUI error: {message}")


class ComfyClient:
    def __init__(self, base_url: str, http_client: httpx.AsyncClient):
        self.base_url = base_url.rstrip("/")
        self.ws_url = self.base_url.replace("http", "ws") + "/ws"
        self.client = http_client
        self.client_id = str(uuid.uuid4())

    # ------------------------------------------------------------------
    # Workflow queueing
    # ------------------------------------------------------------------

    async def queue_workflow(
        self, workflow: dict, overrides: Optional[dict] = None
    ) -> str:
        """Queue a workflow and return the prompt_id."""
        if overrides:
            workflow = _apply_overrides(workflow, overrides)

        try:
            resp = await self.client.post(
                f"{self.base_url}/prompt",
                json={"prompt": workflow, "client_id": self.client_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ComfyError(f"{exc.response.status_code}: {exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise ComfyError(str(exc)) from exc

        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise ComfyError("No prompt_id in response")
        return prompt_id

    async def wait_for_completion(
        self, prompt_id: str, timeout: float = 120.0
    ) -> dict:
        """Listen on the WebSocket until our prompt finishes."""
        ws_url = f"{self.ws_url}?clientId={self.client_id}"
        output_data: dict = {}

        try:
            async with asyncio.timeout(timeout):
                async with websockets.connect(ws_url) as ws:
                    async for raw_msg in ws:
                        # Skip binary frames (preview images)
                        if isinstance(raw_msg, bytes):
                            continue
                        msg = json.loads(raw_msg)
                        msg_type = msg.get("type")
                        data = msg.get("data", {})

                        if data.get("prompt_id") != prompt_id and msg_type not in (
                            "execution_start",
                        ):
                            # Only skip if we have a prompt_id that doesn't match
                            if data.get("prompt_id") is not None:
                                continue

                        if msg_type == "executed":
                            output_data.update(data.get("output", {}))
                        elif msg_type == "execution_error":
                            raise ComfyError(
                                data.get("exception_message", "Unknown execution error")
                            )
                        elif msg_type == "execution_complete":
                            break
        except asyncio.TimeoutError as exc:
            raise ComfyError(f"Workflow timed out after {timeout}s") from exc

        return output_data

    async def execute_workflow(
        self, workflow: dict, overrides: Optional[dict] = None
    ) -> dict:
        """Queue and wait for a workflow to complete."""
        prompt_id = await self.queue_workflow(workflow, overrides)
        return await self.wait_for_completion(prompt_id)

    # ------------------------------------------------------------------
    # Image retrieval
    # ------------------------------------------------------------------

    async def get_image(
        self, filename: str, subfolder: str = "", type: str = "output"
    ) -> bytes:
        try:
            resp = await self.client.get(
                f"{self.base_url}/view",
                params={"filename": filename, "subfolder": subfolder, "type": type},
                timeout=30.0,
            )
            resp.raise_for_status()
            return resp.content
        except httpx.HTTPStatusError as exc:
            raise ComfyError(f"{exc.response.status_code}: {exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise ComfyError(str(exc)) from exc

    # ------------------------------------------------------------------
    # Health / utility
    # ------------------------------------------------------------------

    async def check_health(self) -> bool:
        try:
            resp = await self.client.get(
                f"{self.base_url}/system_stats", timeout=5.0
            )
            return resp.status_code == 200
        except Exception:
            return False

    async def interrupt(self) -> bool:
        try:
            resp = await self.client.post(
                f"{self.base_url}/interrupt", timeout=5.0
            )
            return resp.status_code == 200
        except Exception:
            return False

    async def get_object_info(self) -> dict:
        try:
            resp = await self.client.get(
                f"{self.base_url}/object_info", timeout=30.0
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            raise ComfyError(f"{exc.response.status_code}: {exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise ComfyError(str(exc)) from exc


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _apply_overrides(workflow: dict, overrides: dict) -> dict:
    """Walk the workflow dict and replace matching string values."""
    import copy

    workflow = copy.deepcopy(workflow)

    def _walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, str) and v in overrides:
                    obj[k] = overrides[v]
                else:
                    _walk(v)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                if isinstance(item, str) and item in overrides:
                    obj[i] = overrides[item]
                else:
                    _walk(item)

    _walk(workflow)
    return workflow
