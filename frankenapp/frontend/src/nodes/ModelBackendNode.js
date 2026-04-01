import { LiteGraph } from "litegraph.js";
import { api } from "../services/api.js";

/**
 * ModelBackendNode — wraps KoboldCpp with context/template/reconnection widgets.
 *
 * Outputs:
 *   inference (model_connection) — connects to ChatSession
 *   info      (model_info)       — connects to anything needing model metadata
 */
export class ModelBackendNode {
  constructor() {
    this.title = "Model Backend";
    this.color = "#D85A30";
    this.size = [320, 280];

    // Outputs
    this.addOutput("inference", "model_connection");
    this.addOutput("info", "model_info");

    // Properties
    this.properties = {
      endpoint_url: "http://localhost:5001",
      auto_reconnect: true,
      reconnect_interval: 5,
    };

    // Internal state
    this._status = "disconnected"; // "connected" | "disconnected" | "reconnecting"
    this._modelInfo = null;
    this._sampling = {
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      rep_pen: 1.1,
      min_p: 0.05,
      max_length: 300,
    };
    this._template = { name: "auto", template_name: "generic" };
    this._tokensPerSecond = 0;
    this._contextBudget = null;
    this._samplingVisible = false;
    this._healthTimer = null;
    this._reconnectTimer = null;
    this._budgetTimer = null;

    // Widgets
    this._buildWidgets();
  }

  _buildWidgets() {
    // Endpoint URL text widget
    this.addWidget("text", "Endpoint URL", this.properties.endpoint_url, (val) => {
      this.properties.endpoint_url = val;
      this._updateEndpoint(val);
    });

    // Model name (read-only)
    this.addWidget("text", "Model", "Not connected", null, { readonly: true });

    // Template dropdown
    this.addWidget("combo", "Template", "auto (generic)", (val) => {
      this._template.name = val;
    }, {
      values: ["auto (generic)", "auto (chatml)", "auto (llama3)", "auto (mistral)", "auto (alpaca)", "manual"],
    });

    // Performance display
    this.addWidget("text", "Speed", "— tok/s", null, { readonly: true });
  }

  onAdded() {
    this._startHealthPolling();
    this._startBudgetPolling();
  }

  onRemoved() {
    this._stopPolling();
  }

  _startHealthPolling() {
    this._healthTimer = setInterval(() => this._pollHealth(), 5_000);
    this._pollHealth(); // immediate first check
  }

  _startBudgetPolling() {
    this._budgetTimer = setInterval(() => this._pollBudget(), 8_000);
  }

  _stopPolling() {
    clearInterval(this._healthTimer);
    clearInterval(this._reconnectTimer);
    clearInterval(this._budgetTimer);
  }

  async _pollHealth() {
    try {
      const info = await api.get("/api/models/info");
      if (info && !info.error) {
        this._modelInfo = info;
        this._status = "connected";
        this._stopReconnecting();
        this._updateModelWidget(info);
      } else {
        this._onDisconnected();
      }
    } catch (_) {
      this._onDisconnected();
    }
  }

  async _pollBudget() {
    try {
      const data = await api.get("/api/models/context-budget/quick?session_id=default");
      if (data && !data.error) {
        this._contextBudget = data;
        this.setDirtyCanvas(true);
      }
    } catch (_) {}
  }

  _onDisconnected() {
    if (this._status === "connected") {
      this._status = "disconnected";
      this.setDirtyCanvas(true);
    }
    if (this.properties.auto_reconnect && !this._reconnectTimer) {
      this._status = "reconnecting";
      this._reconnectTimer = setInterval(
        () => this._pollHealth(),
        this.properties.reconnect_interval * 1_000
      );
    }
  }

  _stopReconnecting() {
    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _updateModelWidget(info) {
    const modelName = info.model_name || "Unknown";
    const quant = info.quant_type ? ` [${info.quant_type}]` : "";
    if (this.widgets && this.widgets[1]) {
      this.widgets[1].value = modelName + quant;
    }
    // Update template widget to show auto-detected name
    if (this.widgets && this.widgets[2]) {
      const tName = info.template_name || "generic";
      this.widgets[2].value = `auto (${tName})`;
    }
    this.setDirtyCanvas(true);
  }

  async _updateEndpoint(newUrl) {
    try {
      await api.put("/api/models/endpoint", { url: newUrl });
      await this._pollHealth();
    } catch (_) {
      this._onDisconnected();
    }
  }

  onExecute() {
    // Output the current inference configuration
    const output = {
      endpoint: this.properties.endpoint_url,
      sampling: { ...this._sampling },
      template: this._template,
      context_size: this._modelInfo?.loaded_context ?? 8192,
      connected: this._status === "connected",
    };
    this.setOutputData(0, output);
    this.setOutputData(1, this._modelInfo);

    // Update performance display
    if (this._modelInfo) {
      api.get("/api/models/performance")
        .then((perf) => {
          if (perf && perf.tokens_per_second != null) {
            this._tokensPerSecond = perf.tokens_per_second;
            if (this.widgets && this.widgets[3]) {
              this.widgets[3].value = `${perf.tokens_per_second.toFixed(1)} tok/s`;
            }
          }
        })
        .catch(() => {});
    }
  }

  onDrawForeground(ctx) {
    // Status indicator dot
    const dotColors = {
      connected: "#22c55e",
      disconnected: "#ef4444",
      reconnecting: "#eab308",
    };
    ctx.beginPath();
    ctx.arc(this.size[0] - 16, 10, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotColors[this._status] || "#888";
    ctx.fill();

    // Context budget bar (bottom of node)
    if (this._contextBudget) {
      const total = this._contextBudget.total_context || 8192;
      const used = this._contextBudget.used || 0;
      const pct = used / total;
      const barW = this.size[0] - 20;
      const barH = 6;
      const barY = this.size[1] - 20;

      ctx.fillStyle = "#2a2a44";
      ctx.fillRect(10, barY, barW, barH);

      ctx.fillStyle = pct > 0.85 ? "#ef4444" : "#6366f1";
      ctx.fillRect(10, barY, barW * pct, barH);

      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#a0a0c0";
      ctx.fillText(
        `${used.toLocaleString()} / ${total.toLocaleString()} tokens`,
        10,
        barY - 4
      );
    }
  }

  serialize() {
    return {
      properties: this.properties,
      sampling: this._sampling,
      template: this._template,
    };
  }

  configure(data) {
    if (data.properties) Object.assign(this.properties, data.properties);
    if (data.sampling) Object.assign(this._sampling, data.sampling);
    if (data.template) Object.assign(this._template, data.template);
    if (this.widgets && this.widgets[0]) {
      this.widgets[0].value = this.properties.endpoint_url;
    }
  }
}

ModelBackendNode.title = "Model Backend";
ModelBackendNode.desc = "KoboldCpp connection, template detection, context budget";
