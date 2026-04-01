"""Prompt template auto-detection service.

Infers the correct prompt template format from the model name, eliminating
the need for users to manually select ChatML/Alpaca/Llama3/etc.

v2 TODO:
  - Query GGUF metadata directly if KoboldCpp adds an endpoint for it
  - Allow user override of auto-detected template
  - Support custom Jinja2 template strings
"""

from __future__ import annotations


class TemplateDetector:
    # Map of known model family patterns to template formats
    TEMPLATE_MAP: dict[str, dict] = {
        # ChatML format: <|im_start|>role\ncontent<|im_end|>
        "chatml": {
            "patterns": ["qwen", "yi-", "hermes", "openhermes", "dolphin", "nous"],
            "system_prefix": "<|im_start|>system\n",
            "system_suffix": "<|im_end|>\n",
            "user_prefix": "<|im_start|>user\n",
            "user_suffix": "<|im_end|>\n",
            "assistant_prefix": "<|im_start|>assistant\n",
            "assistant_suffix": "<|im_end|>\n",
            "tokens_per_wrap": 4,
        },
        # Llama 3 format
        "llama3": {
            "patterns": ["llama-3", "llama3", "llama_3"],
            "system_prefix": "<|start_header_id|>system<|end_header_id|>\n\n",
            "system_suffix": "<|eot_id|>\n",
            "user_prefix": "<|start_header_id|>user<|end_header_id|>\n\n",
            "user_suffix": "<|eot_id|>\n",
            "assistant_prefix": "<|start_header_id|>assistant<|end_header_id|>\n\n",
            "assistant_suffix": "<|eot_id|>\n",
            "tokens_per_wrap": 6,
        },
        # Alpaca format
        "alpaca": {
            "patterns": ["alpaca", "wizard", "vicuna"],
            "system_prefix": "",
            "system_suffix": "\n\n",
            "user_prefix": "### Instruction:\n",
            "user_suffix": "\n\n",
            "assistant_prefix": "### Response:\n",
            "assistant_suffix": "\n\n",
            "tokens_per_wrap": 3,
        },
        # Mistral instruct
        "mistral": {
            "patterns": ["mistral", "mixtral"],
            "system_prefix": "",
            "system_suffix": "\n",
            "user_prefix": "[INST] ",
            "user_suffix": " [/INST]\n",
            "assistant_prefix": "",
            "assistant_suffix": "</s>\n",
            "tokens_per_wrap": 3,
        },
        # Command-R / Cohere format
        "command-r": {
            "patterns": ["command-r", "c4ai"],
            "system_prefix": "<|START_OF_TURN_TOKEN|><|SYSTEM_TOKEN|>",
            "system_suffix": "<|END_OF_TURN_TOKEN|>\n",
            "user_prefix": "<|START_OF_TURN_TOKEN|><|USER_TOKEN|>",
            "user_suffix": "<|END_OF_TURN_TOKEN|>\n",
            "assistant_prefix": "<|START_OF_TURN_TOKEN|><|CHATBOT_TOKEN|>",
            "assistant_suffix": "<|END_OF_TURN_TOKEN|>\n",
            "tokens_per_wrap": 5,
        },
        # Generic / fallback
        "generic": {
            "patterns": [],
            "system_prefix": "### System:\n",
            "system_suffix": "\n\n",
            "user_prefix": "### User:\n",
            "user_suffix": "\n\n",
            "assistant_prefix": "### Assistant:\n",
            "assistant_suffix": "\n\n",
            "tokens_per_wrap": 2,
        },
    }

    def detect_template(self, model_name: str) -> dict:
        """Return the best-matching template dict for a model name."""
        lower = model_name.lower()
        for template_name, template in self.TEMPLATE_MAP.items():
            if template_name == "generic":
                continue
            for pattern in template["patterns"]:
                if pattern in lower:
                    return {"template_name": template_name, **template}
        # Fallback
        generic = self.TEMPLATE_MAP["generic"]
        return {"template_name": "generic", **generic}

    def wrap_message(self, template: dict, role: str, content: str) -> str:
        """Wrap a single message with the template's role prefixes/suffixes."""
        prefix = template.get(f"{role}_prefix", "")
        suffix = template.get(f"{role}_suffix", "")
        return f"{prefix}{content}{suffix}"

    def build_prompt(self, template: dict, messages: list[dict]) -> str:
        """Build a full prompt string from a list of role/content messages."""
        parts: list[str] = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            parts.append(self.wrap_message(template, role, content))
        # End with assistant prefix to prime the model
        parts.append(template.get("assistant_prefix", ""))
        return "".join(parts)

    def estimate_template_overhead(self, template: dict, num_messages: int) -> int:
        """Return approximate token count consumed by template wrapping alone."""
        tokens_per_wrap: int = template.get("tokens_per_wrap", 2)
        return tokens_per_wrap * num_messages
