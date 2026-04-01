import { PortraitPanel } from "../panels/PortraitPanel.js";

/**
 * PortraitNode — displays a character portrait with crossfade and history.
 *
 * Inputs:
 *   image (image_data) — image URL from ComfyWorkflow
 *
 * Widgets (drawn via onDrawForeground):
 *   IMAGE DISPLAY  — image scaled to fit, crossfades on change
 *   EMOTION LABEL  — small text below image
 *   HISTORY strip  — last 4 expression thumbnails at bottom
 *
 * Double-click opens PortraitPanel (full-size overlay).
 *
 * Registration: display/Portrait
 */

const HISTORY_MAX = 4;
const FADE_STEP = 0.08; // alpha increment per frame

export class PortraitNode {
  constructor() {
    this.title = "Portrait";
    this.color = "#1D9E75";
    this.size = [200, 240];

    this.addInput("image", "image_data");

    this._imageUrl = null;
    this._emotion = null;

    // Crossfade state
    this._currImg = null;
    this._prevImg = null;
    this._fadeAlpha = 1.0; // 1 = fully showing current, animating toward 1

    // History: array of { url, img }
    this._history = [];

    this._panel = null;
  }

  onExecute() {
    const data = this.getInputData(0); // may be a URL string or { url, emotion }
    let url = null;
    let emotion = null;

    if (typeof data === "string") {
      url = data;
    } else if (data && typeof data === "object") {
      url = data.url ?? data.image_url ?? null;
      emotion = data.emotion ?? null;
    }

    if (emotion !== null) this._emotion = emotion;

    if (url && url !== this._imageUrl) {
      this._imageUrl = url;
      this._prevImg = this._currImg;
      this._fadeAlpha = this._prevImg ? 0.0 : 1.0;

      const img = new Image();
      img.onload = () => {
        this._currImg = img;
        // Push to history
        this._history.push({ url, img });
        if (this._history.length > HISTORY_MAX) this._history.shift();
        this.setDirtyCanvas(true);
      };
      img.src = url;
    }

    // Update open panel if any
    if (this._panel) {
      this._panel.update(url, emotion);
    }
  }

  onDrawForeground(ctx) {
    const padX = 8;
    const titleH = 24; // approximate LiteGraph title bar height
    const emotionBarH = 18;
    const historyH = 36;
    const imgY = 4; // offset from top of content area
    const imgH = this.size[1] - imgY - emotionBarH - historyH - padX;
    const imgW = this.size[0] - padX * 2;

    // --- Image area (with crossfade) ---
    if (this._prevImg && this._fadeAlpha < 1.0) {
      ctx.globalAlpha = 1.0;
      ctx.drawImage(this._prevImg, padX, imgY, imgW, imgH);
      ctx.globalAlpha = this._fadeAlpha;
    }
    if (this._currImg) {
      ctx.globalAlpha = this._currImg ? this._fadeAlpha : 1.0;
      ctx.drawImage(this._currImg, padX, imgY, imgW, imgH);
    } else {
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = "#2a2a44";
      ctx.fillRect(padX, imgY, imgW, imgH);
      ctx.fillStyle = "#555";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No image", this.size[0] / 2, imgY + imgH / 2 + 4);
      ctx.textAlign = "left";
    }
    ctx.globalAlpha = 1.0;

    // Advance crossfade
    if (this._fadeAlpha < 1.0) {
      this._fadeAlpha = Math.min(1.0, this._fadeAlpha + FADE_STEP);
      if (this._fadeAlpha >= 1.0) this._prevImg = null;
      this.setDirtyCanvas(true);
    }

    // --- Emotion label bar ---
    const emotionY = imgY + imgH;
    ctx.fillStyle = "#1a3a2e";
    ctx.fillRect(padX, emotionY, imgW, emotionBarH);
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      this._emotion ? this._emotion.toUpperCase() : "neutral",
      this.size[0] / 2,
      emotionY + 13,
    );
    ctx.textAlign = "left";

    // --- History strip ---
    const histY = emotionY + emotionBarH + 2;
    const thumbW = Math.floor((this.size[0] - padX * 2 - (HISTORY_MAX - 1) * 2) / HISTORY_MAX);
    for (let i = 0; i < HISTORY_MAX; i++) {
      const tx = padX + i * (thumbW + 2);
      const entry = this._history[i];
      if (entry && entry.img) {
        ctx.drawImage(entry.img, tx, histY, thumbW, historyH - 4);
      } else {
        ctx.fillStyle = "#2a2a44";
        ctx.fillRect(tx, histY, thumbW, historyH - 4);
      }
    }
  }

  onDblClick(_event, _pos) {
    if (this._panel) return; // already open
    this._panel = new PortraitPanel({
      imageUrl: this._imageUrl,
      emotion: this._emotion,
      history: this._history.map((h) => h.url),
      onEmotionOverride: (emotion) => {
        this._emotion = emotion;
        this.setDirtyCanvas(true);
      },
      onClose: () => { this._panel = null; },
    });
  }

  serialize() {
    return { imageUrl: this._imageUrl, emotion: this._emotion };
  }

  configure(data) {
    if (data.imageUrl) {
      this._imageUrl = data.imageUrl;
      const img = new Image();
      img.onload = () => { this._currImg = img; this.setDirtyCanvas(true); };
      img.src = data.imageUrl;
    }
    if (data.emotion) this._emotion = data.emotion;
  }
}

PortraitNode.title = "Portrait";
PortraitNode.desc = "Displays a character portrait; double-click to open full-size panel";
