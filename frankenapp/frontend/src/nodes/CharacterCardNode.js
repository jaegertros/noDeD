import { api } from "../services/api.js";

/**
 * CharacterCardNode — loads a SillyTavern V2 character card from the backend.
 *
 * Outputs:
 *   card (character_card) — passes card data to ChatSession
 */
export class CharacterCardNode {
  constructor() {
    this.title = "Character Card";
    this.color = "#2d6a4f";
    this.size = [280, 160];

    this.addOutput("card", "character_card");

    this.properties = {
      card_name: "",
    };

    this._cardData = null;
    this._cardList = [];

    this.addWidget("combo", "Card", "", (val) => {
      this.properties.card_name = val;
      this._loadCard(val);
    }, { values: [] });

    this.addWidget("button", "Refresh", null, () => this._fetchCardList());

    this._fetchCardList();
  }

  async _fetchCardList() {
    try {
      const cards = await api.get("/api/cards");
      this._cardList = (cards || []).map((c) => c.filename);
      if (this.widgets && this.widgets[0]) {
        this.widgets[0].options.values = this._cardList;
        if (this.properties.card_name && this._cardList.includes(this.properties.card_name)) {
          this.widgets[0].value = this.properties.card_name;
        }
      }
      this.setDirtyCanvas(true);
    } catch (_) {}
  }

  async _loadCard(filename) {
    if (!filename) return;
    try {
      this._cardData = await api.get(`/api/cards/${encodeURIComponent(filename)}`);
      this.setDirtyCanvas(true);
    } catch (_) {
      this._cardData = null;
    }
  }

  onExecute() {
    this.setOutputData(0, this._cardData);
  }

  onDrawForeground(ctx) {
    if (this._cardData) {
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#a0d0b0";
      const preview = (this._cardData.description || "").substring(0, 60);
      ctx.fillText(preview + (preview.length >= 60 ? "…" : ""), 10, this.size[1] - 12);
    }
  }

  serialize() {
    return { properties: this.properties };
  }

  configure(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      if (this.properties.card_name) {
        this._loadCard(this.properties.card_name);
        if (this.widgets && this.widgets[0]) {
          this.widgets[0].value = this.properties.card_name;
        }
      }
    }
  }
}

CharacterCardNode.title = "Character Card";
CharacterCardNode.desc = "Load a SillyTavern V2 character card";
