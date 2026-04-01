/**
 * ChatPanel — DOM overlay chat UI that slides in from the right, covering 60 % of the
 * viewport (full-screen on mobile). Opened from ChatSessionNode when a ChatSession node
 * is activated.
 *
 * Emits custom window events:
 *   "chat:message"    – new message generated (text + emotion + character + sessionId)
 *   "chat:expression" – emotion detected       (emotion + character + sessionId)
 *   "chat:context"    – context budget updated (used_tokens + max_tokens + sessionId)
 *   "chat:close"      – panel was closed       (sessionId)
 */
export class ChatPanel {
  /**
   * @param {HTMLElement} container - DOM element to append the panel into
   * @param {{
   *   session_id: string,
   *   characters: Array<{name: string, first_mes?: string}>,
   *   model_config: Object,
   *   user_name?: string,
   *   onClose?: Function
   * }} sessionConfig
   */
  constructor(container, sessionConfig = {}) {
    this._container = container || document.body;
    this.sessionId = sessionConfig.session_id ?? `session_${Date.now()}`;
    this.characters = sessionConfig.characters ?? [];
    this.modelConfig = sessionConfig.model_config ?? {};
    this.userName = sessionConfig.user_name ?? "User";
    this._onCloseCb = sessionConfig.onClose ?? null;

    this._messages = [];
    this._streaming = false;
    this._abortController = null;

    // Palette shared between header avatars and message accent colours
    this._accentColors = ["#6366f1", "#22c55e", "#eab308", "#ef4444", "#06b6d4", "#ec4899"];

    this._keyHandler = (e) => this._onKeyDown(e);
    document.addEventListener("keydown", this._keyHandler);

    this.render();
    this.loadHistory();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Build and mount all panel DOM. */
  render() {
    // Semi-transparent backdrop
    this._backdrop = document.createElement("div");
    this._backdrop.className = "chat-panel-backdrop";

    // Main panel element
    this._el = document.createElement("div");
    this._el.className = "franken-panel chat-panel";

    const sessionName =
      this.characters.length > 0
        ? this.characters.map((c) => c.name).join(", ")
        : "Chat";

    const avatarsHtml = this.characters
      .map((char, i) => {
        const color = this._accentColors[i % this._accentColors.length];
        const initials = (char.name ?? "?").substring(0, 2).toUpperCase();
        return `<span class="chat-avatar" style="background:${color}" title="${char.name ?? "Character"}">${initials}</span>`;
      })
      .join("");

    const contextUsed = this.modelConfig.context_used ?? 0;
    const contextMax = this.modelConfig.max_context ?? this.modelConfig.n_ctx ?? 4096;
    const contextPct = Math.min(100, Math.round((contextUsed / contextMax) * 100));

    this._el.innerHTML = `
      <div class="franken-panel__header">
        <button class="franken-panel__back" title="Back to Graph (Escape)">← Graph</button>
        <div class="chat-header-info">
          <img class="chat-portrait-thumb" src="" alt="Portrait" />
          <div class="chat-avatars">${avatarsHtml}</div>
          <span class="franken-panel__title">${sessionName}</span>
        </div>
        <div class="chat-context-bar" title="Context budget">
          <div class="chat-context-bar__fill" style="width:${contextPct}%"></div>
          <span class="chat-context-bar__label">${contextUsed}/${contextMax}</span>
        </div>
        <button class="franken-panel__close" title="Close (Escape)">✕</button>
      </div>
      <div class="franken-panel__content">
        <div class="chat-messages"></div>
      </div>
      <div class="chat-input-bar">
        <textarea placeholder="Type a message… (Enter to send, Shift+Enter for newline)" rows="2"></textarea>
        <div class="chat-input-buttons">
          <button class="chat-stop-btn" style="display:none" title="Stop generation">Stop</button>
          <button class="chat-send-btn" title="Send (Enter)">Send</button>
        </div>
      </div>
    `;

    this._container.appendChild(this._backdrop);
    this._container.appendChild(this._el);

    // Cache frequently-used refs
    this._messagesEl = this._el.querySelector(".chat-messages");
    this._textarea = this._el.querySelector("textarea");
    this._sendBtn = this._el.querySelector(".chat-send-btn");
    this._stopBtn = this._el.querySelector(".chat-stop-btn");
    this._contextFill = this._el.querySelector(".chat-context-bar__fill");
    this._contextLabel = this._el.querySelector(".chat-context-bar__label");
    this._portraitThumb = this._el.querySelector(".chat-portrait-thumb");

    // Keep the portrait thumbnail in sync with PortraitNode updates
    this._portraitHandler = (e) => {
      if (e.detail?.url) {
        this._portraitThumb.src = e.detail.url;
        this._portraitThumb.style.display = "";
      }
    };
    window.addEventListener("portrait:update", this._portraitHandler);

    // Wire up button / input events
    this._el.querySelector(".franken-panel__close").addEventListener("click", () => this.close());
    this._el.querySelector(".franken-panel__back").addEventListener("click", () => this.close());

    this._sendBtn.addEventListener("click", () => {
      this.sendMessage(this._textarea.value.trim());
    });

    this._stopBtn.addEventListener("click", () => this._abort());

    this._textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(this._textarea.value.trim());
      }
    });

    // Slide in on next paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._backdrop.classList.add("visible");
        this._el.classList.add("visible");
      });
    });
  }

  /** Fetch and display message history. Shows character first_mes when history is empty. */
  async loadHistory() {
    try {
      const res = await fetch(`/api/chat/history/${this.sessionId}`);
      const history = await res.json();

      if (Array.isArray(history) && history.length > 0) {
        this._messages = history;
        for (const msg of history) {
          this._messagesEl.appendChild(this.renderMessage(msg));
        }
        this._scrollToBottom();
        return;
      }
    } catch (_) {}

    // No history — show the first character's opening message if available
    const firstChar = this.characters[0];
    if (firstChar?.first_mes) {
      const greeting = { role: "assistant", content: firstChar.first_mes, character: firstChar.name };
      this._messages.push(greeting);
      this._messagesEl.appendChild(this.renderMessage(greeting));
      this._scrollToBottom();
    }
  }

  /**
   * Send a user message and stream responses from each connected character.
   * @param {string} text
   */
  async sendMessage(text) {
    if (!text || this._streaming) return;

    this._textarea.value = "";

    // Append and track the user message
    const userMsg = { role: "user", content: text };
    this._messages.push(userMsg);
    this._messagesEl.appendChild(this.renderMessage(userMsg));
    this._scrollToBottom();

    window.dispatchEvent(
      new CustomEvent("chat:message", {
        detail: { role: "user", text, sessionId: this.sessionId },
      })
    );

    await this._sendToApi(text);
  }

  /**
   * Build and return a message bubble element with RP formatting applied.
   * @param {{ role: string, content: string, character?: string }} msg
   * @returns {HTMLElement}
   */
  renderMessage(msg) {
    const { role, content, character } = msg;
    const div = document.createElement("div");

    const charIndex = character
      ? this.characters.findIndex((c) => c.name === character)
      : -1;
    const accentColor =
      charIndex >= 0
        ? this._accentColors[charIndex % this._accentColors.length]
        : this._accentColors[0];

    if (role === "user") {
      div.className = "chat-message chat-message--user";
      div.innerHTML = `<div class="chat-message__text">${this._parseRpText(content)}</div>`;
    } else if (role === "system") {
      div.className = "chat-message chat-message--system";
      div.innerHTML = `<div class="chat-message__text">${this._parseRpText(content)}</div>`;
    } else {
      // assistant / character
      const dotHtml = character
        ? `<span class="chat-avatar-dot" style="background:${accentColor}"></span>`
        : "";
      const nameHtml = character
        ? `<span class="chat-message__name" style="color:${accentColor}">${character}</span>`
        : "";

      div.className = "chat-message chat-message--assistant";
      div.innerHTML = `
        <div class="chat-message__meta">${dotHtml}${nameHtml}</div>
        <div class="chat-message__text">${this._parseRpText(content)}</div>
      `;
    }

    return div;
  }

  /** Animate the panel out, remove its DOM, and return keyboard focus to the canvas. */
  close() {
    this._el.classList.remove("visible");
    this._backdrop.classList.remove("visible");
    document.removeEventListener("keydown", this._keyHandler);
    window.removeEventListener("portrait:update", this._portraitHandler);

    // Abort any in-flight stream without sending the server abort request
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    setTimeout(() => {
      this._el.remove();
      this._backdrop.remove();

      window.dispatchEvent(
        new CustomEvent("chat:close", { detail: { sessionId: this.sessionId } })
      );

      if (this._onCloseCb) this._onCloseCb();

      // Return focus to the litegraph canvas
      const canvas = document.getElementById("graph-canvas");
      if (canvas) canvas.focus();
    }, 320);
  }

  // ---------------------------------------------------------------------------
  // Backward-compatible helpers (used by ChatSessionNode)
  // ---------------------------------------------------------------------------

  /** Clear all displayed messages and the internal message list. */
  clearMessages() {
    this._messages = [];
    this._messagesEl.innerHTML = "";
  }

  /**
   * Update model config and/or character data from the node's connected inputs.
   * @param {{ modelConfig?: Object, cardData?: Object }} ctx
   */
  updateContext(ctx) {
    if (ctx.modelConfig) this.modelConfig = ctx.modelConfig;
    if (ctx.cardData && this.characters.length === 0) {
      this.characters = [ctx.cardData];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Global keydown handler attached while the panel is open. */
  _onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      this._regenerate();
    }
  }

  /**
   * Abort the current stream and notify the server.
   * Called by the Stop button and by _regenerate().
   */
  async _abort() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._streaming = false;
    this._sendBtn.disabled = false;
    this._stopBtn.style.display = "none";
    try {
      await fetch("/api/models/abort", { method: "POST" });
    } catch (_) {}
  }

  /** Abort current stream (if any) and re-request the last user message. */
  async _regenerate() {
    if (this._streaming) {
      await this._abort();
    }

    // Find the last user message
    let lastUserIdx = -1;
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (this._messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;

    const lastUserText = this._messages[lastUserIdx].content;

    // Drop all messages after the last user message
    this._messages.splice(lastUserIdx + 1);

    // Re-render the truncated history
    this._messagesEl.innerHTML = "";
    for (const msg of this._messages) {
      this._messagesEl.appendChild(this.renderMessage(msg));
    }
    this._scrollToBottom();

    // Re-request without adding another user bubble
    await this._sendToApi(lastUserText);
  }

  /**
   * Core streaming logic. Loops over each character (group chat) and streams SSE.
   * Does NOT add a user bubble — the caller must do that.
   * @param {string} text
   */
  async _sendToApi(text) {
    this._streaming = true;
    this._sendBtn.disabled = true;
    this._stopBtn.style.display = "";

    const targets = this.characters.length > 0 ? this.characters : [{ name: null }];

    for (const char of targets) {
      if (!this._streaming) break; // aborted between characters

      const charName = char.name ?? null;

      // Create a streaming placeholder bubble
      const streamMsg = { role: "assistant", content: "", character: charName };
      const bubble = this.renderMessage(streamMsg);
      const textEl = bubble.querySelector(".chat-message__text");
      this._messagesEl.appendChild(bubble);
      this._scrollToBottom();

      let fullResponse = "";

      try {
        this._abortController = new AbortController();

        const body = {
          message: text,
          card_name: charName,
          session_id: this.sessionId,
          user_name: this.userName,
          sampling: this.modelConfig.sampling ?? {},
          template_override:
            this.modelConfig.template?.name === "manual"
              ? this.modelConfig.template.template_name
              : null,
        };

        const response = await fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: this._abortController.signal,
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

            let data;
            try {
              data = JSON.parse(dataStr);
            } catch (_) {
              continue;
            }

            if (eventType === "token") {
              fullResponse += data.text ?? "";
              textEl.innerHTML = this._parseRpText(fullResponse);
              this._scrollToBottom();
            } else if (eventType === "expression") {
              window.dispatchEvent(
                new CustomEvent("chat:expression", {
                  detail: {
                    emotion: data.emotion,
                    character: charName,
                    sessionId: this.sessionId,
                  },
                })
              );
            } else if (eventType === "context") {
              this._updateContextBar(data);
              window.dispatchEvent(
                new CustomEvent("chat:context", {
                  detail: { ...data, sessionId: this.sessionId },
                })
              );
            } else if (eventType === "done") {
              fullResponse = data.full_response ?? fullResponse;
              textEl.innerHTML = this._parseRpText(fullResponse);

              window.dispatchEvent(
                new CustomEvent("chat:message", {
                  detail: {
                    role: "assistant",
                    text: fullResponse,
                    emotion: data.emotion ?? null,
                    character: charName,
                    sessionId: this.sessionId,
                  },
                })
              );
            } else if (eventType === "error") {
              textEl.innerHTML = `<span class="chat-error">[Error: ${data.message ?? "unknown"}]</span>`;
            }
          }
        }

        // Persist the final response in the message log
        if (fullResponse) {
          this._messages.push({
            role: "assistant",
            content: fullResponse,
            character: charName,
          });
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          textEl.innerHTML = `<span class="chat-error">[Connection error: ${err.message}]</span>`;
        }
      }

      this._abortController = null;
    }

    this._streaming = false;
    this._sendBtn.disabled = false;
    this._stopBtn.style.display = "none";
    this._textarea.focus();
  }

  /**
   * Convert RP markup to safe HTML.
   *   *action text*  →  <em class="rp-action">action text</em>
   *   "spoken text"  →  <span class="rp-speech">"spoken text"</span>
   * @param {string} text
   * @returns {string}
   */
  _parseRpText(text) {
    if (!text) return "";

    // Escape HTML to prevent injection
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return escaped
      .replace(/\*([^*\n]+)\*/g, '<em class="rp-action">$1</em>')
      .replace(/"([^"\n]+)"/g, '<span class="rp-speech">&quot;$1&quot;</span>')
      .replace(/\n/g, "<br>");
  }

  /**
   * Update the context budget mini-bar in the header.
   * @param {{ used_tokens?: number, max_tokens?: number }} data
   */
  _updateContextBar(data) {
    const used = data.used_tokens ?? data.context_used ?? 0;
    const max = data.max_tokens ?? data.max_context ?? this.modelConfig.n_ctx ?? 4096;
    const pct = Math.min(100, Math.round((used / max) * 100));

    if (this._contextFill) this._contextFill.style.width = `${pct}%`;
    if (this._contextLabel) this._contextLabel.textContent = `${used}/${max}`;

    this.modelConfig = { ...this.modelConfig, context_used: used, max_context: max };
  }

  _scrollToBottom() {
    const content = this._el.querySelector(".franken-panel__content");
    if (content) content.scrollTop = content.scrollHeight;
  }
}
