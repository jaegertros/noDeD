/**
 * SamplingWidget — collapsible panel of sampling parameter sliders
 * for use inside a LiteGraph node.
 *
 * Usage (within a node's onDrawForeground or as a custom widget):
 *   const sw = new SamplingWidget(node, initialParams);
 *   node.addCustomWidget(sw);
 */

const PRESETS = {
  Creative: { temperature: 1.2, top_p: 0.95, top_k: 80, rep_pen: 1.05, min_p: 0.02, max_length: 400 },
  Balanced: { temperature: 0.7, top_p: 0.9, top_k: 40, rep_pen: 1.1, min_p: 0.05, max_length: 300 },
  Precise: { temperature: 0.3, top_p: 0.75, top_k: 20, rep_pen: 1.15, min_p: 0.1, max_length: 200 },
};

const PARAM_RANGES = {
  temperature: { min: 0, max: 3, step: 0.05, default: 0.7 },
  top_p: { min: 0, max: 1, step: 0.01, default: 0.9 },
  top_k: { min: 0, max: 200, step: 1, default: 40 },
  rep_pen: { min: 1, max: 2, step: 0.01, default: 1.1 },
  min_p: { min: 0, max: 1, step: 0.01, default: 0.05 },
  max_length: { min: 16, max: 2048, step: 16, default: 300 },
};

export class SamplingWidget {
  constructor(node, initialParams = {}) {
    this.node = node;
    this.name = "sampling";
    this.type = "sampling";
    this.collapsed = true;

    this.params = Object.fromEntries(
      Object.entries(PARAM_RANGES).map(([k, r]) => [k, initialParams[k] ?? r.default])
    );
  }

  computeSize() {
    if (this.collapsed) return [this.node.size[0], 24];
    return [this.node.size[0], 24 + Object.keys(PARAM_RANGES).length * 22 + 28];
  }

  draw(ctx, node, widget_width, y, widget_height) {
    this.y = y;
    const w = widget_width;

    // Header row (click to toggle)
    ctx.fillStyle = "#2a2a44";
    ctx.fillRect(6, y, w - 12, 20);
    ctx.fillStyle = "#a0a0d0";
    ctx.font = "11px sans-serif";
    ctx.fillText(`Sampling ${this.collapsed ? "▶" : "▼"}`, 10, y + 14);

    if (this.collapsed) return;

    let ry = y + 24;

    for (const [param, range] of Object.entries(PARAM_RANGES)) {
      const val = this.params[param] ?? range.default;
      const pct = (val - range.min) / (range.max - range.min);

      // Label + value
      ctx.fillStyle = "#808080";
      ctx.font = "10px sans-serif";
      ctx.fillText(param, 10, ry + 10);

      ctx.fillStyle = "#c0c0e0";
      ctx.fillText(
        typeof val === "number" ? val.toFixed(val % 1 === 0 ? 0 : 2) : val,
        w - 40,
        ry + 10
      );

      // Track
      const trackX = 90;
      const trackW = w - 130;
      ctx.fillStyle = "#2a2a44";
      ctx.fillRect(trackX, ry + 4, trackW, 6);
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(trackX, ry + 4, trackW * pct, 6);

      ry += 22;
    }

    // Preset buttons
    const presetKeys = Object.keys(PRESETS);
    const btnW = (w - 20) / presetKeys.length;
    presetKeys.forEach((name, i) => {
      ctx.fillStyle = "#2d2d50";
      ctx.fillRect(10 + i * btnW, ry, btnW - 4, 18);
      ctx.fillStyle = "#9090d0";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(name, 10 + i * btnW + (btnW - 4) / 2, ry + 12);
      ctx.textAlign = "left";
    });
  }

  mouse(event, pos, node) {
    const [mx, my] = pos;
    const ry_base = this.y;

    // Toggle collapse on header click
    if (my >= ry_base && my <= ry_base + 20) {
      if (event.type === "mousedown") {
        this.collapsed = !this.collapsed;
        node.setSize([node.size[0], node.computeSize()[1]]);
        return true;
      }
    }

    if (this.collapsed) return false;

    // Slider interaction
    let ry = ry_base + 24;
    for (const [param, range] of Object.entries(PARAM_RANGES)) {
      const trackX = 90;
      const trackW = node.size[0] - 130;

      if (
        my >= ry + 4 &&
        my <= ry + 10 &&
        mx >= trackX &&
        mx <= trackX + trackW &&
        event.type === "mousedown"
      ) {
        const pct = Math.max(0, Math.min(1, (mx - trackX) / trackW));
        const raw = range.min + pct * (range.max - range.min);
        // Snap to step
        const snapped = Math.round(raw / range.step) * range.step;
        this.params[param] = +snapped.toFixed(4);
        return true;
      }
      ry += 22;
    }

    // Preset buttons
    const presetKeys = Object.keys(PRESETS);
    const w = node.size[0];
    const btnW = (w - 20) / presetKeys.length;
    presetKeys.forEach((name, i) => {
      if (
        my >= ry &&
        my <= ry + 18 &&
        mx >= 10 + i * btnW &&
        mx <= 10 + (i + 1) * btnW - 4 &&
        event.type === "mousedown"
      ) {
        Object.assign(this.params, PRESETS[name]);
      }
    });

    return false;
  }
}
