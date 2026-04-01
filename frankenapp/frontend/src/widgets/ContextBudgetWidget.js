/**
 * ContextBudgetWidget — custom LiteGraph widget that renders a stacked token
 * budget bar on a node, showing where every token is allocated.
 *
 * Usage (within a node constructor):
 *   this.addCustomWidget(new ContextBudgetWidget(this));
 */
export class ContextBudgetWidget {
  constructor(node) {
    this.node = node;
    this.name = "context_budget";
    this.type = "context_budget";
    this.value = null; // ContextBudget response object
    this.y = 0; // set by LiteGraph layout engine

    this._COLORS = {
      system_prompt: "#7c3aed",        // purple
      character_card: "#0d9488",       // teal
      example_messages: "#db2777",     // pink
      conversation_history: "#D85A30", // coral
      template_overhead: "#6b7280",    // gray
      reserved_for_generation: "#d97706", // amber
      free: "#1e1e32",                 // dark
    };
  }

  computeSize() {
    return [this.node.size[0], 48];
  }

  draw(ctx, node, widget_width, y, widget_height) {
    this.y = y;
    const budget = this.value;
    const barH = 8;
    const textY = y + 14;
    const barY = y + 22;

    if (!budget || !budget.total_context) {
      ctx.fillStyle = "#555";
      ctx.font = "11px sans-serif";
      ctx.fillText("Context: loading…", 6, textY);
      return;
    }

    const total = budget.total_context;
    const pct = budget.utilization_percent ?? 0;
    const overflow = budget.overflow ?? 0;

    // Text line
    ctx.font = "11px sans-serif";
    ctx.fillStyle = overflow > 0 ? "#ef4444" : pct > 85 ? "#eab308" : "#a0a0c0";
    ctx.fillText(
      `${budget.used?.toLocaleString()} / ${total.toLocaleString()} tokens (${pct}%)` +
        (overflow > 0 ? " ⚠ OVERFLOW" : ""),
      6,
      textY
    );

    // Background bar
    ctx.fillStyle = "#2a2a3a";
    ctx.fillRect(6, barY, widget_width - 12, barH);

    // Stacked segments
    const breakdown = budget.breakdown ?? {};
    const segments = [
      ["system_prompt", breakdown.system_prompt ?? 0],
      ["character_card", breakdown.character_card ?? 0],
      ["example_messages", breakdown.example_messages ?? 0],
      ["conversation_history", breakdown.conversation_history ?? 0],
      ["template_overhead", breakdown.template_overhead ?? 0],
      ["reserved_for_generation", breakdown.reserved_for_generation ?? 0],
    ];

    let x = 6;
    const availableWidth = widget_width - 12;
    for (const [key, tokens] of segments) {
      if (tokens <= 0) continue;
      const segW = Math.max(1, (tokens / total) * availableWidth);
      ctx.fillStyle = this._COLORS[key] ?? "#444";
      ctx.fillRect(x, barY, segW, barH);
      x += segW;
    }

    // Flash red border on overflow
    if (overflow > 0) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(6, barY, widget_width - 12, barH);
    }
  }

  mouse() {
    // No interaction needed
    return false;
  }
}
