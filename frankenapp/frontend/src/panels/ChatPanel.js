/**
 * ChatPanel — full chat UI that slides in from the right, overlaying the graph.
 * Opened from ChatSessionNode.
 */
export class ChatPanel {
  /**
   * @param {string} sessionId
   * @param {{ modelConfig, cardData, onClose, onMessage }} opts
   */
  constructor(sessionId, opts = {}) {
    this.sessionId = sessionId;
    this.opts = opts;
    this._messages = [];
    this._streaming = false;

    this._buildDOM();
    this._loadHistory();
  }

  _buildDOM() {
    this._el = document.createElement("div");
    this._el.className = "franken-panel";

    this._el.innerHTML = `
      <div class="franken-panel__header">
        <span class="franken-panel__back">← Graph</span>
        <span class="franken-panel__title">${this.opts.cardData?.name ?? "Chat"}</span>
        <button class="franken-panel__close" title="Close">✕</button>
      </div>
      <div class="franken-panel__content">
        <div class="chat-messages" id="chat-messages-${this.sessionId}"></div>
      </div>
      <div class="chat-input-bar">
        <textarea placeholder="Type a message…" rows="1"></textarea>
        <button>Send</button>
      </div>
    `;

    document.body.appendChild(this._el);

    // Wire up events
    this._el.querySelector(".franken-panel__close").addEventListener("click", () => this.close());
    this._el.querySelector(".franken-panel__back").addEventListener("click", () => this.close());

    this._textarea = this._el.querySelector("textarea");
    this._sendBtn = this._el.querySelector("button:last-of-type");
    this._messagesEl = this._el.querySelector(`#chat-messages-${this.sessionId}`);

    this._sendBtn.addEventListener("click", () => this._send());
    this._textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });

    // Trigger slide-in animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._el.classList.add("visible"));
    });
  }

  async _loadHistory() {
    try {
      const history = await fetch(`/api/chat/history/${this.sessionId}`).then((r) => r.json());
      if (Array.isArray(history)) {
        this._messages = history;
        this._renderMessages();
      }
    } catch (_) {}
  }

  _renderMessages() {
    this._messagesEl.innerHTML = "";
    for (const msg of this._messages) {
      this._appendMessageEl(msg.role, msg.content);
    }
    this._scrollToBottom();
  }

  _appendMessageEl(role, content) {
    const div = document.createElement("div");
    div.className = `chat-message chat-message--${role}`;
    div.textContent = content;
    this._messagesEl.appendChild(div);
    return div;
  }

  _scrollToBottom() {
    const content = this._el.querySelector(".franken-panel__content");
    content.scrollTop = content.scrollHeight;
  }

  async _send() {
    const text = this._textarea.value.trim();
    if (!text || this._streaming) return;

    this._textarea.value = "";
    this._appendMessageEl("user", text);
    this._scrollToBottom();

    // Create a placeholder for the streaming response
    const assistantDiv = this._appendMessageEl("assistant", "");
    this._scrollToBottom();

    this._streaming = true;
    this._sendBtn.disabled = true;
    let fullResponse = "";

    try {
      const modelConfig = this.opts.modelConfig || {};
      const body = {
        message: text,
        card_name: this.opts.cardData?.name ?? null,
        session_id: this.sessionId,
        user_name: "User",
        sampling: modelConfig.sampling ?? {},
        template_override: modelConfig.template?.name === "manual"
          ? modelConfig.template.template_name
          : null,
      };

      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.trim().split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }

          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "token") {
              fullResponse += data.text ?? "";
              assistantDiv.textContent = fullResponse;
              this._scrollToBottom();
            } else if (eventType === "done") {
              fullResponse = data.full_response ?? fullResponse;
              assistantDiv.textContent = fullResponse;
              if (this.opts.onMessage) this.opts.onMessage(data);
            } else if (eventType === "error") {
              assistantDiv.textContent = `[Error: ${data.message}]`;
              assistantDiv.style.color = "#ef4444";
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      assistantDiv.textContent = `[Connection error: ${err.message}]`;
      assistantDiv.style.color = "#ef4444";
    } finally {
      this._streaming = false;
      this._sendBtn.disabled = false;
    }
  }

  clearMessages() {
    this._messages = [];
    this._messagesEl.innerHTML = "";
  }

  updateContext(ctx) {
    this.opts.modelConfig = ctx.modelConfig;
    this.opts.cardData = ctx.cardData;
  }

  close() {
    this._el.classList.remove("visible");
    setTimeout(() => {
      this._el.remove();
      if (this.opts.onClose) this.opts.onClose();
    }, 320);
  }
}
