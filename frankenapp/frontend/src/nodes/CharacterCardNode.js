import { api } from "../services/api.js";

// ---------------------------------------------------------------------------
// Module-level canvas helpers
// ---------------------------------------------------------------------------

/** Draw a rounded rectangle path (without filling/stroking). */
function _drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Wrap `text` into at most `maxLines` lines that fit within `maxWidth` px. */
function _wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length >= maxLines) {
        // Truncation occurred — trim last line to make room for the ellipsis
        lines[lines.length - 1] = _fitWithEllipsis(ctx, lines[lines.length - 1], maxWidth);
        return lines;
      }
      current = word;
    }
  }
  if (current) {
    if (lines.length < maxLines) {
      lines.push(current);
    } else {
      // Defensive: truncation occurred; trim last pushed line
      lines[lines.length - 1] = _fitWithEllipsis(ctx, lines[lines.length - 1], maxWidth);
    }
  }
  return lines;
}

/** Trim `text` and append "…" so the result fits within `maxWidth` px. */
function _fitWithEllipsis(ctx, text, maxWidth) {
  const ellipsis = "…";
  if (ctx.measureText(text + ellipsis).width <= maxWidth) return text + ellipsis;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + ellipsis).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + ellipsis;
}


function _esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------

/**
 * CharacterCardNode — loads a SillyTavern V2 character card from the backend.
 *
 * Registration: LiteGraph.registerNodeType("characters/CharacterCard", CharacterCardNode)
 *
 * Outputs:
 *   character (character_data) — passes full card data to ChatSession
 */
export class CharacterCardNode {
  constructor() {
    this.title = "Character Card";
    this.color = "#534AB7";
    this.size = [240, 180];

    // Output — carries the full card payload including card_filename
    this.addOutput("character", "character_data");

    this.properties = {
      card_filename: "",
    };

    this._cardData = null;
    this._cardList = [];

    // Widget 1: CARD SELECTOR — combo populated from GET /api/cards
    this.addWidget("combo", "Card", "", (val) => {
      this.properties.card_filename = val;
      this._loadCard(val);
    }, { values: [] });

    // Widget 2: Edit Card — future feature; logs for now
    this.addWidget("button", "Edit Card", null, () => {
      console.log("[CharacterCardNode] Edit Card –", this.properties.card_filename, this._cardData);
    });

    this._fetchCardList();
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async _fetchCardList() {
    try {
      const cards = await api.get("/api/cards");
      this._cardList = (cards || []).map((c) => c.filename);
      if (this.widgets && this.widgets[0]) {
        this.widgets[0].options.values = this._cardList;
        if (
          this.properties.card_filename &&
          this._cardList.includes(this.properties.card_filename)
        ) {
          this.widgets[0].value = this.properties.card_filename;
        }
      }
      this.setDirtyCanvas(true);
    } catch (_) {}
  }

  async _loadCard(filename) {
    if (!filename) return;
    try {
      this._cardData = await api.get(`/api/cards/${encodeURIComponent(filename)}`);
      // Update node title to character name
      if (this._cardData?.name) {
        this.title = this._cardData.name;
      }
      this.setDirtyCanvas(true);
    } catch (_) {
      this._cardData = null;
    }
  }

  // ---------------------------------------------------------------------------
  // LiteGraph lifecycle
  // ---------------------------------------------------------------------------

  onExecute() {
    if (this._cardData) {
      this.setOutputData(0, { ...this._cardData, card_filename: this.properties.card_filename });
    } else {
      this.setOutputData(0, null);
    }
  }

  /** Double-click: show full card details in a toast overlay. */
  onDblClick(e, pos, canvas) {
    if (!this._cardData) return;
    this._showCardToast();
  }

  onDrawForeground(ctx) {
    if (!this._cardData) return;

    const w = this.size[0];
    const h = this.size[1];
    ctx.font = "10px sans-serif";

    // -- Expression count badge (pinned near the bottom) --
    const exprMap = this._cardData.expression_map;
    const exprCount = exprMap && typeof exprMap === "object" ? Object.keys(exprMap).length : 0;
    let badgeReserved = 0;

    if (exprCount > 0) {
      const label = `${exprCount} expression${exprCount !== 1 ? "s" : ""}`;
      const bw = ctx.measureText(label).width + 12;
      const bh = 16;
      const bx = 10;
      const by = h - bh - 6;
      badgeReserved = bh + 10;

      ctx.fillStyle = "#45475a";
      _drawRoundRect(ctx, bx, by, bw, bh, 3);
      ctx.fill();

      ctx.fillStyle = "#cba6f7";
      ctx.fillText(label, bx + 6, by + 11);
    }

    // -- DESCRIPTION PREVIEW (above badge) — first 100 chars, max 2 lines --
    const desc = (this._cardData.description || "").substring(0, 100);
    if (desc) {
      ctx.fillStyle = "#a6adc8";
      const maxW = w - 20;
      const lines = _wrapText(ctx, desc, maxW, 2);
      const lineH = 13;
      const totalH = lines.length * lineH;
      // Baseline of the last line sits just above the badge (or near the bottom if no badge)
      const lastBaseline = h - badgeReserved - 6;
      for (let i = lines.length - 1; i >= 0; i--) {
        ctx.fillText(lines[i], 10, lastBaseline - (lines.length - 1 - i) * lineH);
      }
    }
  }

  serialize() {
    return { properties: this.properties };
  }

  configure(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      if (this.properties.card_filename) {
        this._loadCard(this.properties.card_filename);
        if (this.widgets && this.widgets[0]) {
          this.widgets[0].value = this.properties.card_filename;
        }
      }
    }
    this._fetchCardList();
  }

  // ---------------------------------------------------------------------------
  // Toast overlay
  // ---------------------------------------------------------------------------

  _showCardToast() {
    const existing = document.getElementById("cc-card-toast");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "cc-card-toast";
    overlay.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
      "background:#1e1e2e;color:#cdd6f4;border:1px solid #534AB7;" +
      "border-radius:8px;padding:20px;max-width:480px;width:90%;z-index:10000;" +
      "font-family:sans-serif;max-height:80vh;overflow-y:auto;" +
      "box-shadow:0 8px 32px rgba(0,0,0,0.6);";

    const d = this._cardData;
    const field = (label, value) =>
      value
        ? `<p style="font-size:12px;margin:6px 0"><b>${label}:</b> ${_esc(value)}</p>`
        : "";
    const exprKeys = d.expression_map ? Object.keys(d.expression_map) : [];

    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <strong style="font-size:16px;color:#cba6f7">${_esc(d.name)}</strong>
        <button id="cc-toast-close"
          style="background:none;border:none;color:#888;font-size:20px;cursor:pointer">✕</button>
      </div>
      ${field("Description", d.description)}
      ${field("Personality", d.personality)}
      ${field("Scenario", d.scenario)}
      ${field("First Message", d.first_mes)}
      ${field("System Prompt", d.system_prompt)}
      ${field("Mes Example", d.mes_example)}
      ${exprKeys.length
        ? `<p style="font-size:12px;margin:6px 0"><b>Expressions (${exprKeys.length}):</b> ${_esc(exprKeys.join(", "))}</p>`
        : ""}
    `;

    document.body.appendChild(overlay);
    overlay.querySelector("#cc-toast-close").addEventListener("click", () => {
      clearTimeout(dismissTimer);
      overlay.remove();
    });
    // Auto-dismiss after 15 s
    const dismissTimer = setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 15_000);
  }
}

CharacterCardNode.title = "Character Card";
CharacterCardNode.desc = "Load a SillyTavern V2 character card";
