/**
 * PortraitPanel — expression display overlay.
 * Shows the current character portrait and emotion badge.
 */
export class PortraitPanel {
  /**
   * @param {{ imageUrl: string, emotion: string, onClose: Function }} opts
   */
  constructor(opts = {}) {
    this.opts = opts;
    this._buildDOM();
  }

  _buildDOM() {
    this._el = document.createElement("div");
    this._el.className = "franken-panel";
    this._el.style.width = "320px";

    this._el.innerHTML = `
      <div class="franken-panel__header">
        <span class="franken-panel__title">Portrait</span>
        <button class="franken-panel__close" title="Close">✕</button>
      </div>
      <div class="franken-panel__content" style="text-align:center; padding:24px 16px;">
        <img class="portrait-display" src="${this.opts.imageUrl ?? ""}" alt="Portrait" />
        <div class="emotion-badge">${this.opts.emotion ?? "neutral"}</div>
      </div>
    `;

    document.body.appendChild(this._el);

    this._el.querySelector(".franken-panel__close").addEventListener("click", () => this.close());
    this._imgEl = this._el.querySelector("img");
    this._emotionEl = this._el.querySelector(".emotion-badge");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._el.classList.add("visible"));
    });
  }

  update(imageUrl, emotion) {
    if (imageUrl) this._imgEl.src = imageUrl;
    if (emotion) this._emotionEl.textContent = emotion;
  }

  close() {
    this._el.classList.remove("visible");
    setTimeout(() => {
      this._el.remove();
      if (this.opts.onClose) this.opts.onClose();
    }, 320);
  }
}
