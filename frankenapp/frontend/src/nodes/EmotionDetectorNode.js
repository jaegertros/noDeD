import { api } from "../services/api.js";

/**
 * EmotionDetectorNode — detects emotion from *action text* in the input stream.
 *
 * Inputs:
 *   text (text) — text to analyze (e.g. assistant response / text_stream)
 *
 * Outputs:
 *   emotion (emotion) — detected emotion string
 *
 * Widgets:
 *   CURRENT EMOTION — colored badge showing the last detected emotion
 *   MODE            — "regex" (v1, active) | "classifier" (v2, disabled)
 *
 * Registration: pipeline/EmotionDetector
 */

const EMOTION_COLORS = {
  happy: "#eab308",
  sad: "#60a5fa",
  angry: "#ef4444",
  embarrassed: "#f472b6",
  surprised: "#a78bfa",
  afraid: "#6b7280",
};

export class EmotionDetectorNode {
  constructor() {
    this.title = "Emotion Detector";
    this.color = "#BA7517";
    this.size = [200, 100];

    this.addInput("text", "text");
    this.addOutput("emotion", "emotion");

    this.properties = { mode: "regex" };

    this._emotion = null;

    this._PATTERNS = [
      [/\b(smil|laugh|grin|chuckl|giggl)/i, "happy"],
      [/\b(cr(y|ies|ied)|sob|tear|weep)/i, "sad"],
      [/\b(glar|scowl|frown|furi|angr|rage)/i, "angry"],
      [/\b(blush|sh(y|ies|ied)|embarrass)/i, "embarrassed"],
      [/\b(shock|gasp|surpris|jolt|startl)/i, "surprised"],
      [/\b(fear|trembl|shiver|terrif|scared)/i, "afraid"],
    ];

    // MODE widget — "classifier" is a future option (v2), kept disabled.
    this.addWidget("combo", "Mode", "regex", (val) => {
      if (val === "classifier") {
        // Revert to regex until classifier is available.
        if (this.widgets && this.widgets[0]) this.widgets[0].value = "regex";
        return;
      }
      this.properties.mode = val;
    }, { values: ["regex", "classifier"] });
  }

  onExecute() {
    const text = this.getInputData(0) || "";

    if (this.properties.mode === "regex") {
      this._emotion = this._detectRegex(text);
      this.setOutputData(0, this._emotion);
    } else {
      // classifier mode (v2) — falls back to regex
      this._emotion = this._detectRegex(text);
      this.setOutputData(0, this._emotion);
    }
  }

  /** Client-side regex detection (v1). */
  _detectRegex(text) {
    const actions = [...text.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]).join(" ");
    if (!actions) return null;
    for (const [pat, emotion] of this._PATTERNS) {
      if (pat.test(actions)) return emotion;
    }
    return null;
  }

  /**
   * Call backend POST /api/chat/detect-emotion.
   * Used when mode is set to "classifier".
   */
  async _detectBackend(text) {
    try {
      const result = await api.post("/api/chat/detect-emotion", { text });
      return result?.emotion ?? null;
    } catch (_) {
      return this._detectRegex(text);
    }
  }

  onDrawForeground(ctx) {
    const label = this._emotion ?? "none";
    const badgeColor = EMOTION_COLORS[this._emotion] ?? "#555";
    const padX = 10;
    const badgeY = this.size[1] - 26;
    const badgeH = 18;
    const badgeW = this.size[0] - padX * 2;

    // Colored badge background
    ctx.beginPath();
    ctx.roundRect(padX, badgeY, badgeW, badgeH, 4);
    ctx.fillStyle = badgeColor;
    ctx.fill();

    // Emotion label text
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(label.toUpperCase(), this.size[0] / 2, badgeY + 13);
    ctx.textAlign = "left";
  }

  serialize() {
    return { properties: this.properties };
  }

  configure(data) {
    if (data.properties) Object.assign(this.properties, data.properties);
    if (this.widgets && this.widgets[0]) {
      this.widgets[0].value = this.properties.mode || "regex";
    }
  }
}

EmotionDetectorNode.title = "Emotion Detector";
EmotionDetectorNode.desc = "Detects emotion from *action text* (regex, v1)";
