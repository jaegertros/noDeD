/**
 * websocket.js — WebSocket event bus client.
 * Connects to /ws and dispatches incoming messages as CustomEvents on window.
 */

class EventBusClient {
  constructor() {
    this._ws = null;
    this._reconnectDelay = 3_000;
    this._reconnectTimer = null;
    this._url = null;
  }

  connect(url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`) {
    this._url = url;
    this._open();
  }

  _open() {
    if (this._ws) {
      try { this._ws.close(); } catch (_) {}
    }

    this._ws = new WebSocket(this._url);

    this._ws.addEventListener("open", () => {
      console.debug("[WS] Connected");
      clearTimeout(this._reconnectTimer);
    });

    this._ws.addEventListener("message", (e) => {
      try {
        const payload = JSON.parse(e.data);
        window.dispatchEvent(new CustomEvent("franken:ws", { detail: payload }));
      } catch (_) {}
    });

    this._ws.addEventListener("close", () => {
      console.debug("[WS] Disconnected — will reconnect");
      this._scheduleReconnect();
    });

    this._ws.addEventListener("error", () => {
      this._ws.close();
    });
  }

  _scheduleReconnect() {
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this._open(), this._reconnectDelay);
  }

  send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(typeof data === "string" ? data : JSON.stringify(data));
    }
  }

  disconnect() {
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }
}

export const eventBus = new EventBusClient();
