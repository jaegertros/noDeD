/**
 * EmotionDetectorNode — detects emotion from text input.
 *
 * Inputs:
 *   text (string) — text to analyze (e.g. assistant response)
 *
 * Outputs:
 *   emotion (string) — detected emotion string
 */
export class EmotionDetectorNode {
  constructor() {
    this.title = "Emotion Detector";
    this.color = "#5a2d82";
    this.size = [220, 100];

    this.addInput("text", "string");
    this.addOutput("emotion", "string");

    this._emotion = null;

    this._PATTERNS = [
      [/\*(smil|laugh|grin|chuckl|giggl)/i, "happy"],
      [/\*(cr(y|ies|ied)|sob|tear|weep)/i, "sad"],
      [/\*(glar|scowl|frown|furi|angr|rage)/i, "angry"],
      [/\*(blush|sh(y|ies|ied)|embarrass)/i, "embarrassed"],
      [/\*(shock|gasp|surpris|jolt|startl)/i, "surprised"],
      [/\*(fear|trembl|shiver|terrif|scared)/i, "afraid"],
    ];
  }

  onExecute() {
    const text = this.getInputData(0) || "";
    this._emotion = this._detect(text);
    this.setOutputData(0, this._emotion);
  }

  _detect(text) {
    const actions = [...text.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]).join(" ");
    if (!actions) return null;
    for (const [pat, emotion] of this._PATTERNS) {
      if (pat.test(actions)) return emotion;
    }
    return null;
  }

  onDrawForeground(ctx) {
    if (this._emotion) {
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#c0a0f0";
      ctx.fillText(`Emotion: ${this._emotion}`, 10, this.size[1] - 12);
    }
  }
}

EmotionDetectorNode.title = "Emotion Detector";
EmotionDetectorNode.desc = "Detects emotion from *action text*";
