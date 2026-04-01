import { api } from "../services/api.js";
import { ChatPanel } from "../panels/ChatPanel.js";

/**
 * ChatSessionNode — core chat node.
 *
 * Inputs:
 *   model (model_connection)  — from ModelBackend
 *   card  (character_card)    — from CharacterCard
 *
 * Outputs:
 *   response  (string)        — last assistant response
 *   emotion   (string)        — detected emotion
 */
export class ChatSessionNode {
  constructor() {
    this.title = "Chat Session";
    this.color = "#1a4a7a";
    this.size = [300, 180];

    this.addInput("model", "model_connection");
    this.addInput("card", "character_card");

    this.addOutput("response", "string");
    this.addOutput("emotion", "string");

    this.properties = {
      session_id: `session_${Date.now()}`,
      user_name: "User",
    };

    this._lastResponse = "";
    this._lastEmotion = null;
    this._panel = null;
    this._msgHandler = null;
    this._streaming = false;

    this.addWidget("text", "Session ID", this.properties.session_id, (val) => {
      this.properties.session_id = val;
    });
    this.addWidget("button", "Open Chat", null, () => this.toggleChatPanel());
    this.addWidget("button", "Clear History", null, () => this._clearHistory());
  }

  toggleChatPanel() {
    if (!this._panel) {
      const modelConfig = this.getInputData(0);
      const cardData = this.getInputData(1);
      const characters = cardData ? [cardData] : [];

      this._panel = new ChatPanel(document.body, {
        session_id: this.properties.session_id,
        characters,
        model_config: modelConfig,
        user_name: this.properties.user_name,
        onClose: () => { this._panel = null; },
      });

      // Listen for assistant messages from this session
      this._msgHandler = (e) => {
        const d = e.detail;
        if (d.sessionId !== this.properties.session_id) return;
        if (d.role === "assistant") {
          this._lastResponse = d.text || "";
          this._lastEmotion = d.emotion || null;
        }
      };
      window.addEventListener("chat:message", this._msgHandler);
    } else {
      this._panel.close();
      this._panel = null;
      if (this._msgHandler) {
        window.removeEventListener("chat:message", this._msgHandler);
        this._msgHandler = null;
      }
    }
  }

  async _clearHistory() {
    try {
      await api.delete(`/api/chat/history/${this.properties.session_id}`);
      if (this._panel) this._panel.clearMessages();
    } catch (_) {}
  }

  onExecute() {
    const modelConfig = this.getInputData(0);
    const cardData = this.getInputData(1);

    if (this._panel) {
      this._panel.updateContext({ modelConfig, cardData });
    }

    this.setOutputData(0, this._lastResponse);
    this.setOutputData(1, this._lastEmotion);
  }

  onDrawForeground(ctx) {
    if (this._streaming) {
      ctx.beginPath();
      ctx.arc(this.size[0] - 16, 10, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.fill();
    }
    if (this._lastResponse) {
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#a0c0e0";
      const preview = this._lastResponse.substring(0, 55);
      ctx.fillText(preview + (preview.length >= 55 ? "…" : ""), 10, this.size[1] - 12);
    }
  }

  serialize() {
    return { properties: this.properties };
  }

  configure(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      if (this.widgets && this.widgets[0]) {
        this.widgets[0].value = this.properties.session_id;
      }
    }
  }
}

ChatSessionNode.title = "Chat Session";
ChatSessionNode.desc = "Manages a conversation session";
