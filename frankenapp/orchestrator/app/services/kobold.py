"""KoboldCpp async API client."""

import re
import time
from typing import AsyncGenerator

import httpx


class KoboldError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"KoboldCpp error {status}: {message}")
        self.status = status
        self.message = message


# Regex to extract quant type from model filename.
# Allows separators: _ - . (covers filenames like model-v0.1.Q8_0.gguf)
_QUANT_RE = re.compile(
    r"[_\-\.](Q[0-9]+[_A-Z]*[_0-9]*|IQ[0-9]+[_A-Z]*|F16|F32|BF16)(?=[_\-\.]|$)",
    re.IGNORECASE,
)


class KoboldClient:
    def __init__(self, base_url: str, http_client: httpx.AsyncClient):
        self.base_url = base_url.rstrip("/")
        self.client = http_client
        self._model_info_cache: dict | None = None
        self._cache_time: float = 0.0
        self._last_endpoint: str = base_url

    # ------------------------------------------------------------------
    # Streaming generation
    # ------------------------------------------------------------------

    async def generate(self, prompt: str, **sampling_params) -> AsyncGenerator[str, None]:
        """Stream tokens from /api/extra/generate/stream."""
        allowed_params = {
            "max_length", "temperature", "top_p", "top_k", "rep_pen",
            "rep_pen_range", "typical", "tfs", "top_a", "min_p", "presence_penalty",
        }
        body: dict = {"prompt": prompt, "max_length": 200}
        for k, v in sampling_params.items():
            if k in allowed_params:
                body[k] = v

        try:
            async with self.client.stream(
                "POST",
                f"{self.base_url}/api/extra/generate/stream",
                json=body,
                timeout=120.0,
            ) as response:
                response.raise_for_status()
                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str.strip() == "[DONE]":
                                return
                            try:
                                import json
                                data = json.loads(data_str)
                                token = data.get("token", "")
                                if token:
                                    yield token
                            except Exception:
                                pass
        except httpx.HTTPStatusError as exc:
            raise KoboldError(exc.response.status_code, exc.response.text) from exc
        except httpx.HTTPError as exc:
            raise KoboldError(0, str(exc)) from exc

    async def generate_chat(
        self, messages: list[dict], **params
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from /v1/chat/completions."""
        body: dict = {"messages": messages, "stream": True}
        body.update(params)

        try:
            async with self.client.stream(
                "POST",
                f"{self.base_url}/v1/chat/completions",
                json=body,
                timeout=120.0,
            ) as response:
                response.raise_for_status()
                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str.strip() == "[DONE]":
                                return
                            try:
                                import json
                                data = json.loads(data_str)
                                delta = (
                                    data.get("choices", [{}])[0]
                                    .get("delta", {})
                                    .get("content", "")
                                )
                                if delta:
                                    yield delta
                            except Exception:
                                pass
        except httpx.HTTPStatusError as exc:
            raise KoboldError(exc.response.status_code, exc.response.text) from exc
        except httpx.HTTPError as exc:
            raise KoboldError(0, str(exc)) from exc

    # ------------------------------------------------------------------
    # Model information
    # ------------------------------------------------------------------

    async def get_model_info(self, force_refresh: bool = False) -> dict:
        """Return cached model info, refreshing if stale or forced."""
        now = time.monotonic()
        cache_ttl = 60.0

        if (
            not force_refresh
            and self._model_info_cache is not None
            and (now - self._cache_time) < cache_ttl
        ):
            return self._model_info_cache

        try:
            version_resp = await self.client.get(f"{self.base_url}/api/extra/version", timeout=10.0)
            version_resp.raise_for_status()
            version_data = version_resp.json()

            model_resp = await self.client.get(f"{self.base_url}/api/v1/model", timeout=10.0)
            model_resp.raise_for_status()
            model_data = model_resp.json()

            ctx_resp = await self.client.get(
                f"{self.base_url}/api/extra/true_max_context_length", timeout=10.0
            )
            ctx_resp.raise_for_status()
            ctx_data = ctx_resp.json()
        except httpx.HTTPStatusError as exc:
            raise KoboldError(exc.response.status_code, exc.response.text) from exc
        except httpx.HTTPError as exc:
            raise KoboldError(0, str(exc)) from exc

        model_name: str = model_data.get("result", "")
        max_context: int = ctx_data.get("value", 8192)
        loaded_context: int = model_data.get("max_context_length", max_context)

        # Extract quant type from model filename
        quant_type: str | None = None
        match = _QUANT_RE.search(model_name)
        if match:
            quant_type = match.group(1).upper()

        info = {
            "model_name": model_name,
            "max_context": max_context,
            "loaded_context": loaded_context,
            "quant_type": quant_type,
            "version": version_data.get("result", ""),
            "backend": "koboldcpp",
        }
        self._model_info_cache = info
        self._cache_time = now
        return info

    # ------------------------------------------------------------------
    # Performance
    # ------------------------------------------------------------------

    async def get_performance(self) -> dict:
        try:
            resp = await self.client.get(f"{self.base_url}/api/extra/perf", timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise KoboldError(exc.response.status_code, exc.response.text) from exc
        except httpx.HTTPError as exc:
            raise KoboldError(0, str(exc)) from exc

        return {
            "tokens_per_second": data.get("last_token_per_second", 0.0),
            "generation_time": data.get("last_process", 0.0),
            "queue_depth": data.get("queue", 0),
        }

    # ------------------------------------------------------------------
    # Tokenization
    # ------------------------------------------------------------------

    async def tokenize(self, text: str) -> dict:
        try:
            resp = await self.client.post(
                f"{self.base_url}/api/extra/tokencount",
                json={"prompt": text},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise KoboldError(exc.response.status_code, exc.response.text) from exc
        except httpx.HTTPError as exc:
            raise KoboldError(0, str(exc)) from exc

        return {
            "token_count": data.get("value", 0),
            "tokens": data.get("ids", None),
        }

    # ------------------------------------------------------------------
    # Health / connection management
    # ------------------------------------------------------------------

    async def check_health(self) -> bool:
        try:
            resp = await self.client.get(f"{self.base_url}/api/v1/model", timeout=5.0)
            if resp.status_code == 200:
                self._last_endpoint = self.base_url
                return True
            return False
        except Exception:
            return False

    async def abort(self) -> bool:
        try:
            resp = await self.client.post(f"{self.base_url}/api/extra/abort", timeout=5.0)
            return resp.status_code == 200
        except Exception:
            return False

    async def update_endpoint(self, new_url: str) -> bool:
        """Switch to a new KoboldCpp URL, reverting on failure."""
        old_url = self.base_url
        self.base_url = new_url.rstrip("/")
        if await self.check_health():
            # Refresh cached model info for the new endpoint
            try:
                await self.get_model_info(force_refresh=True)
            except Exception:
                pass
            return True
        # Revert
        self.base_url = old_url
        return False
