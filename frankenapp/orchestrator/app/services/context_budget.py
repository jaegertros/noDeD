"""Context budget calculator.

Calculates exactly where every token is going and reports a live budget,
solving the "I set 8192 context but only get 5800 usable tokens" problem.
"""

from __future__ import annotations

from app.schemas.context import ContextBudget, ContextBreakdown


class ContextBudgetCalculator:
    def __init__(self, kobold_client, template_detector):
        self.kobold = kobold_client
        self.templates = template_detector

    async def calculate_budget(
        self,
        model_info: dict,
        template: dict,
        system_prompt: str,
        card_description: str,
        card_personality: str,
        card_scenario: str,
        card_examples: str,
        message_count: int,
        last_messages_text: str,
        reserved_for_generation: int = 300,
    ) -> ContextBudget:
        total_context: int = model_info.get("loaded_context", 8192)
        template_name: str = template.get("template_name", "generic")
        quant_type: str | None = model_info.get("quant_type")

        # Tokenize each component via KoboldCpp
        async def _count(text: str) -> int:
            if not text:
                return 0
            try:
                result = await self.kobold.tokenize(text)
                return result.get("token_count", 0)
            except Exception:
                # Fallback: rough estimate (4 chars per token)
                return max(1, len(text) // 4)

        # Wrap system prompt in template to get accurate count
        wrapped_system = ""
        if system_prompt:
            wrapped_system = self.templates.wrap_message(template, "system", system_prompt)

        system_prompt_tokens = await _count(wrapped_system)
        card_tokens = await _count(
            "\n\n".join(filter(None, [card_description, card_personality, card_scenario]))
        )
        example_tokens = await _count(card_examples) if card_examples else 0
        history_tokens = await _count(last_messages_text)
        template_overhead = self.templates.estimate_template_overhead(
            template, message_count
        )

        used = (
            system_prompt_tokens
            + card_tokens
            + example_tokens
            + history_tokens
            + template_overhead
        )
        available = total_context - used - reserved_for_generation
        overflow = max(0, used + reserved_for_generation - total_context)
        utilization_percent = round((used / total_context) * 100, 1) if total_context else 0.0

        budget = ContextBudget(
            total_context=total_context,
            breakdown=ContextBreakdown(
                system_prompt=system_prompt_tokens,
                character_card=card_tokens,
                example_messages=example_tokens,
                conversation_history=history_tokens,
                template_overhead=template_overhead,
                reserved_for_generation=reserved_for_generation,
            ),
            used=used,
            available=max(0, available),
            overflow=overflow,
            utilization_percent=utilization_percent,
            template_name=template_name,
            quant_type=quant_type,
            warnings=[],
        )
        budget.warnings = self.generate_warnings(budget, message_count)
        return budget

    async def get_truncation_point(
        self, budget: ContextBudget, messages: list[dict]
    ) -> int:
        """Return the index of the first message to keep when overflow > 0."""
        if budget.overflow <= 0:
            return 0

        tokens_to_free = budget.overflow
        freed = 0
        for i, msg in enumerate(messages):
            if freed >= tokens_to_free:
                return i
            try:
                result = await self.kobold.tokenize(msg.get("content", ""))
                freed += result.get("token_count", len(msg.get("content", "")) // 4)
            except Exception:
                freed += len(msg.get("content", "")) // 4
        return len(messages)

    def generate_warnings(self, budget: ContextBudget, message_count: int = 0) -> list[str]:
        warnings: list[str] = []
        total = budget.total_context or 1

        if budget.utilization_percent >= 90:
            warnings.append(
                "Context is 90% full — conversation may be truncated soon"
            )

        card_pct = round(budget.breakdown.character_card / total * 100, 1)
        if card_pct > 20:
            warnings.append(
                f"Character card uses {card_pct}% of total context — "
                "consider shortening description"
            )

        if budget.breakdown.example_messages > 0:
            warnings.append(
                f"Example messages use {budget.breakdown.example_messages} tokens "
                "— these are included in every request"
            )

        per_msg = budget.breakdown.template_overhead // max(1, message_count)
        template_name = budget.template_name
        if budget.breakdown.template_overhead > 0:
            warnings.append(
                f"Template overhead: {budget.breakdown.template_overhead} tokens "
                f"({template_name} format adds ~{per_msg} per message)"
            )

        if budget.quant_type:
            qt = budget.quant_type.upper()
            if qt.startswith("Q4") and total > 4096:
                warnings.append(
                    f"Quant type {qt} may have reduced quality at this context length"
                )
            elif qt.startswith("Q8") and total > 8192:
                warnings.append(
                    f"Quant type {qt} may have reduced quality at this context length"
                )

        return warnings
