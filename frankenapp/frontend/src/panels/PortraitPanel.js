/**
 * PortraitPanel — full-size expression display overlay.
 *
 * Shows the current character portrait image at full size, an expression
 * history strip, and manual emotion override buttons.
 *
 * Opened by double-clicking a PortraitNode.
 *
 * Options:
 *   imageUrl         {string}   — initial image URL
 *   emotion          {string}   — current emotion label
 *   history          {string[]} — ordered list of past image URLs (oldest first)
 *   onEmotionOverride {Function} — called with emotion string when user overrides
 *   onClose          {Function} — called when panel is closed
 */

const KNOWN_EMOTIONS = ["happy", "sad", "angry", "embarrassed", "surprised", "afraid", "neutral"];

const EMOTION_COLORS = {
  happy: "#eab308",
  sad: "#60a5fa",
  angry: "#ef4444",
  embarrassed: "#f472b6",
  surprised: "#a78bfa",
  afraid: "#6b7280",
  neutral: "#9ca3af",
};

export class PortraitPanel {
  /**
   * @param {{
   *   imageUrl?: string,
   *   emotion?: string,
   *   history?: string[],
   *   onEmotionOverride?: (emotion: string) => void,
   *   onClose?: () => void
   * }} opts
   */
  constructor(opts = {}) {
    this.opts = opts;
    this._history = [...(opts.history ?? [])];
    this._buildDOM();
  }

  _buildDOM() {
    this._el = document.createElement("div");
    this._el.className = "franken-panel portrait-panel";
    this._el.style.cssText = "width:360px; max-height:90vh; overflow-y:auto;";

    this._el.innerHTML = `
      <div class="franken-panel__header">
        <span class="franken-panel__title">Portrait</span>
        <button class="franken-panel__close" title="Close">✕</button>
      </div>
      <div class="franken-panel__content portrait-panel__content" style="padding:16px; text-align:center;">
        <img class="portrait-panel__image"
             src="${this.opts.imageUrl ?? ""}"
             alt="Portrait"
             style="max-width:100%; border-radius:6px; display:block; margin:0 auto;" />
        <div class="portrait-panel__emotion-badge" style="margin:10px 0 14px;"></div>

        <!-- History strip -->
        <div class="portrait-panel__history-label"
             style="text-align:left; font-size:11px; color:#888; margin-bottom:6px;">
          Expression History
        </div>
        <div class="portrait-panel__history"
             style="display:flex; gap:6px; justify-content:flex-start; flex-wrap:wrap; margin-bottom:16px;">
        </div>

        <!-- Emotion override buttons -->
        <div class="portrait-panel__overrides-label"
             style="text-align:left; font-size:11px; color:#888; margin-bottom:6px;">
          Override Emotion
        </div>
        <div class="portrait-panel__overrides"
             style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
        </div>
      </div>
    `;

    document.body.appendChild(this._el);

    this._imgEl = this._el.querySelector(".portrait-panel__image");
    this._emotionEl = this._el.querySelector(".portrait-panel__emotion-badge");
    this._historyEl = this._el.querySelector(".portrait-panel__history");
    this._overridesEl = this._el.querySelector(".portrait-panel__overrides");

    this._el.querySelector(".franken-panel__close").addEventListener("click", () => this.close());

    this._renderEmotionBadge(this.opts.emotion ?? "neutral");
    this._renderHistory();
    this._renderOverrideButtons();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._el.classList.add("visible"));
    });
  }

  _renderEmotionBadge(emotion) {
    const color = EMOTION_COLORS[emotion] ?? "#555";
    this._emotionEl.textContent = (emotion ?? "neutral").toUpperCase();
    this._emotionEl.style.cssText = `
      display:inline-block;
      background:${color};
      color:#fff;
      font-size:12px;
      font-weight:bold;
      padding:3px 12px;
      border-radius:12px;
    `;
  }

  _renderHistory() {
    this._historyEl.innerHTML = "";
    if (!this._history.length) {
      this._historyEl.innerHTML = '<span style="font-size:11px;color:#555;">No history yet</span>';
      return;
    }
    this._history.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "history";
      img.style.cssText = "width:60px; height:60px; object-fit:cover; border-radius:4px; cursor:pointer;";
      img.title = url;
      img.addEventListener("click", () => {
        if (this._imgEl) this._imgEl.src = url;
      });
      this._historyEl.appendChild(img);
    });
  }

  _renderOverrideButtons() {
    this._overridesEl.innerHTML = "";
    KNOWN_EMOTIONS.forEach((emotion) => {
      const btn = document.createElement("button");
      btn.textContent = emotion;
      btn.style.cssText = `
        background:${EMOTION_COLORS[emotion] ?? "#555"};
        color:#fff;
        border:none;
        border-radius:4px;
        padding:4px 10px;
        font-size:11px;
        cursor:pointer;
        opacity:0.85;
      `;
      btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
      btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.85"; });
      btn.addEventListener("click", () => {
        this._renderEmotionBadge(emotion);
        if (this.opts.onEmotionOverride) this.opts.onEmotionOverride(emotion);
      });
      this._overridesEl.appendChild(btn);
    });
  }

  /** Update image and/or emotion label from the connected PortraitNode. */
  update(imageUrl, emotion) {
    if (imageUrl && this._imgEl) {
      this._imgEl.src = imageUrl;
      if (!this._history.includes(imageUrl)) {
        this._history.push(imageUrl);
        this._renderHistory();
      }
    }
    if (emotion) this._renderEmotionBadge(emotion);
  }

  close() {
    this._el.classList.remove("visible");
    setTimeout(() => {
      this._el.remove();
      if (this.opts.onClose) this.opts.onClose();
    }, 320);
  }
}
