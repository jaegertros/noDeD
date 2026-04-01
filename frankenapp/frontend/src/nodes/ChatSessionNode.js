import { LiteGraph } from "litegraph.js";
import { api } from "../services/api.js";
import { ChatPanel } from "../panels/ChatPanel.js";

/**
 * ChatSessionNode — "portal" node that configures the chat session in graph mode
 * and opens a full DOM chat panel when activated.
 *
 * Registration: LiteGraph.registerNodeType("chat/ChatSession", ChatSessionNode)
 *
 * Inputs:
 *   characters  (character_data)    — from CharacterCard(s), grows dynamically
 *   model       (model_connection)  — from ModelBackend
 *   world_info  (world_info)        — from WorldInfo (optional)
 *   expressions (emotion_pipeline)  — from EmotionDetector (optional)
 *
 * Outputs:
 *   text_stream   (text)    — latest generated text (for EmotionDetector)
 *   session_state (session) — current session metadata
 */
export class ChatSessionNode {
  constructor() {
    this.title = "Chat Session";
    this.color = "#1D9E75";
    this.size = [280, 200];

    // Character inputs start at 1 slot and grow dynamically as slots are filled.
    // Fixed inputs (model, world_info, expressions) follow.
    this._charSlotCount = 1;
    this.addInput("characters", "character_data");    // slot 0
    this.addInput("model", "model_connection");       // slot 1
    this.addInput("world_info", "world_info");        // slot 2
    this.addInput("expressions", "emotion_pipeline"); // slot 3

    // Outputs
    this.addOutput("text_stream", "text");
    this.addOutput("session_state", "session");

    this.properties = {
      session_id: `session_${Date.now()}`,
      user_name: "User",
      active: false,
    };

    this._lastResponse = "";
    this._panel = null;
    this._msgHandler = null;
    this._ctxHandler = null;
    this._streaming = false;
    this._msgCount = 0;
    this._contextUsed = 0;
    this._contextMax = 4096;
    this._sessionName = "New Session";

    // Widget 1: Session name (editable)
    this.addWidget("text", "Session Name", this._sessionName, (val) => {
      this._sessionName = val;
    });

    // Widget 2: ENTER CHAT button — activates the ChatPanel overlay
    this.addWidget("button", "ENTER CHAT", null, () => this.openChatPanel());

    this._fetchMessageCount();
    this._startContextListener();
  }

  // ---------------------------------------------------------------------------
  // Dynamic character-input management
  // ---------------------------------------------------------------------------

  /**
   * Grow the characters input when all existing character slots become connected.
   * New slot is appended at the end of the input list.
   */
  onConnectionsChange(type, slot, connected) {
    if (type !== LiteGraph.INPUT) return;
    if (!this.inputs[slot] || this.inputs[slot].type !== "character_data") return;

    if (connected) {
      const emptyCharSlots = this.inputs.filter(
        (inp) => inp.type === "character_data" && inp.link == null,
      );
      if (emptyCharSlots.length === 0) {
        this.addInput("characters", "character_data");
        this._charSlotCount++;
      }
    }
    this.setDirtyCanvas(true);
  }

  /** Return data from every connected character input slot. */
  _getAllCharacters() {
    const chars = [];
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.inputs[i].type === "character_data") {
        const d = this.getInputData(i);
        if (d) chars.push(d);
      }
    }
    return chars;
  }

  /** Return data from the first input slot whose type matches. */
  _getInputByType(type) {
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.inputs[i].type === type) return this.getInputData(i);
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Chat panel management
  // ---------------------------------------------------------------------------

  openChatPanel() {
    if (this._panel) {
      this._panel.close();
      return; // onClose callback will clean up _panel + _msgHandler
    }

    const characters = this._getAllCharacters();
    const modelConfig = this._getInputByType("model_connection");

    this._panel = new ChatPanel(document.body, {
      session_id: this.properties.session_id,
      characters,
      model_config: modelConfig,
      user_name: this.properties.user_name,
      onClose: () => {
        this._panel = null;
        this._teardownMsgHandler();
        this.properties.active = false;
        this.setDirtyCanvas(true);
        this._fetchMessageCount();
      },
    });

    this.properties.active = true;

    this._msgHandler = (e) => {
      const d = e.detail;
      if (d.sessionId !== this.properties.session_id) return;
      if (d.role === "assistant") {
        this._lastResponse = d.text || "";
        this._streaming = false;
        this.setDirtyCanvas(true);
      } else if (d.role === "user") {
        this._streaming = true;
        this.setDirtyCanvas(true);
      }
    };
    window.addEventListener("chat:message", this._msgHandler);
  }

  _teardownMsgHandler() {
    if (this._msgHandler) {
      window.removeEventListener("chat:message", this._msgHandler);
      this._msgHandler = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------------

  async _fetchMessageCount() {
    try {
      const history = await api.get(`/api/chat/history/${this.properties.session_id}`);
      this._msgCount = Array.isArray(history) ? history.length : 0;
      this.setDirtyCanvas(true);
    } catch (_) {
      this._msgCount = 0;
    }
  }

  _startContextListener() {
    this._ctxHandler = (e) => {
      const d = e.detail;
      if (d.sessionId !== this.properties.session_id) return;
      this._contextUsed = d.used_tokens ?? d.context_used ?? this._contextUsed;
      this._contextMax = d.max_tokens ?? d.max_context ?? this._contextMax;
      this.setDirtyCanvas(true);
    };
    window.addEventListener("chat:context", this._ctxHandler);
  }

  // ---------------------------------------------------------------------------
  // LiteGraph lifecycle
  // ---------------------------------------------------------------------------

  /** Double-click or clicking "ENTER CHAT" opens the ChatPanel overlay. */
  onDblClick(e, pos, canvas) {
    this.openChatPanel();
  }

  onExecute() {
    const characters = this._getAllCharacters();
    const modelConfig = this._getInputByType("model_connection");

    if (this._panel) {
      this._panel.updateContext({ modelConfig, characters });
    }

    this.setOutputData(0, this._lastResponse);
    this.setOutputData(1, {
      session_id: this.properties.session_id,
      session_name: this._sessionName,
      user_name: this.properties.user_name,
      active: this.properties.active,
      message_count: this._msgCount,
      characters: characters.map((c) => c.name).filter(Boolean),
    });
  }

  onDrawForeground(ctx) {
    const w = this.size[0];
    const h = this.size[1];

    // -- STATUS LINE --
    const charNames = [];
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.inputs[i].type === "character_data" && this.inputs[i].link != null) {
        const d = this.getInputData(i);
        if (d?.name) charNames.push(d.name);
      }
    }

    let statusText;
    if (this._streaming) {
      statusText = "Generating…";
    } else if (charNames.length > 0) {
      statusText = `${charNames.length} character${charNames.length !== 1 ? "s" : ""} - ${charNames.join(", ")}`;
    } else {
      statusText = "Ready";
    }

    ctx.font = "11px sans-serif";
    ctx.fillStyle = this._streaming ? "#22c55e" : "#a6adc8";
    const maxW = w - 20;
    let st = statusText;
    while (st.length > 3 && ctx.measureText(st).width > maxW) st = st.slice(0, -1);
    if (st !== statusText) st += "…";
    ctx.fillText(st, 10, h - 52);

    // -- MESSAGE COUNT --
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#6c7086";
    ctx.fillText(`${this._msgCount} message${this._msgCount !== 1 ? "s" : ""}`, 10, h - 38);

    // -- CONTEXT METER — thin bar showing token utilisation --
    const barX = 10;
    const barY = h - 26;
    const barW = w - 20;
    const barH = 6;
    const pct = this._contextMax > 0
      ? Math.min(1, this._contextUsed / this._contextMax)
      : 0;

    ctx.fillStyle = "#313244";
    ctx.fillRect(barX, barY, barW, barH);

    if (pct > 0) {
      // Green → yellow → red based on utilisation
      const hue = Math.round((1 - pct) * 120);
      ctx.fillStyle = `hsl(${hue},80%,50%)`;
      ctx.fillRect(barX, barY, Math.round(barW * pct), barH);
    }

    ctx.font = "9px sans-serif";
    ctx.fillStyle = "#6c7086";
    ctx.fillText(`${this._contextUsed}/${this._contextMax} tokens`, barX, h - 12);

    // -- STREAMING INDICATOR (top-right dot) --
    if (this._streaming) {
      ctx.beginPath();
      ctx.arc(w - 12, 10, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.fill();
    }
  }

  onRemoved() {
    this._teardownMsgHandler();
    if (this._ctxHandler) {
      window.removeEventListener("chat:context", this._ctxHandler);
      this._ctxHandler = null;
    }
    if (this._panel) {
      this._panel.close();
      this._panel = null;
    }
  }

  serialize() {
    return {
      properties: this.properties,
      sessionName: this._sessionName,
      charSlotCount: this._charSlotCount,
    };
  }

  configure(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
    if (data.sessionName) {
      this._sessionName = data.sessionName;
    }
    if (this.widgets && this.widgets[0]) {
      this.widgets[0].value = this._sessionName;
    }

    // Restore extra character input slots so saved links can reconnect.
    const savedCount = data.charSlotCount ?? 1;
    while (this._charSlotCount < savedCount) {
      this.addInput("characters", "character_data");
      this._charSlotCount++;
    }

    this._fetchMessageCount();
  }
}

ChatSessionNode.title = "Chat Session";
ChatSessionNode.desc = "Manages a multi-character conversation session";
