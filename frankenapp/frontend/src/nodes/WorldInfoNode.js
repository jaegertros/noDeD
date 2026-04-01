/**
 * WorldInfoNode — stores lorebook / world info entries (SillyTavern-style).
 *
 * Outputs:
 *   context (world_info) — {entries, scan_depth} for prompt injection by ChatSession
 *
 * Widgets:
 *   ENTRY COUNT    — "12 entries (8 active)"
 *   Edit Entries   — opens an inline DOM overlay editor
 *
 * Registration: context/WorldInfo
 */
export class WorldInfoNode {
  constructor() {
    this.title = "World Info";
    this.color = "#5F5E5A";
    this.size = [240, 160];

    this.addOutput("context", "world_info");

    this.properties = {
      entries: [],
      scan_depth: 5,
    };

    this._editorEl = null;

    // ENTRY COUNT — read-only informational text widget
    this._countWidget = this.addWidget(
      "text",
      "Entries",
      this._countLabel(),
      null,
    );
    this._countWidget.disabled = true;

    // Edit Entries button — opens inline editor overlay
    this.addWidget("button", "Edit Entries", null, () => {
      this._openEditor();
    });
  }

  _countLabel() {
    const entries = this.properties.entries || [];
    const total = entries.length;
    const active = entries.filter((e) => e.enabled !== false).length;
    return `${total} entries (${active} active)`;
  }

  _refreshCountWidget() {
    if (this._countWidget) {
      this._countWidget.value = this._countLabel();
    }
    this.setDirtyCanvas(true);
  }

  onExecute() {
    this.setOutputData(0, {
      entries: this.properties.entries || [],
      scan_depth: this.properties.scan_depth ?? 5,
    });
  }

  onDrawForeground(ctx) {
    const entries = this.properties.entries || [];
    const total = entries.length;
    const active = entries.filter((e) => e.enabled !== false).length;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#a0a0a0";
    ctx.fillText(`${total} entries (${active} active)`, 10, this.size[1] - 10);
  }

  // -------------------------------------------------------------------------
  // Inline editor overlay
  // -------------------------------------------------------------------------

  _openEditor() {
    if (this._editorEl) {
      this._editorEl.remove();
      this._editorEl = null;
      return;
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed", "top:50%", "left:50%",
      "transform:translate(-50%,-50%)",
      "z-index:9999",
      "background:#1e1e32", "color:#e0e0e0",
      "border:1px solid #444", "border-radius:8px",
      "padding:16px", "min-width:420px", "max-width:600px",
      "max-height:80vh", "overflow-y:auto",
      "box-shadow:0 8px 32px rgba(0,0,0,0.5)",
      "font-family:sans-serif", "font-size:13px",
    ].join(";");

    const title = document.createElement("div");
    title.style.cssText = "font-size:15px;font-weight:bold;margin-bottom:12px;color:#e0e0e0";
    title.textContent = "World Info Entries";
    overlay.appendChild(title);

    const listEl = document.createElement("div");
    overlay.appendChild(listEl);

    const renderList = () => {
      listEl.innerHTML = "";
      const entries = this.properties.entries || [];
      entries.forEach((entry, idx) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;margin-bottom:6px;align-items:flex-start";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = entry.enabled !== false;
        checkbox.style.marginTop = "4px";
        checkbox.addEventListener("change", () => {
          entry.enabled = checkbox.checked;
          this._refreshCountWidget();
        });

        const keyword = document.createElement("input");
        keyword.type = "text";
        keyword.value = entry.keyword || "";
        keyword.placeholder = "keyword";
        keyword.style.cssText = "width:100px;background:#2a2a44;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:2px 6px";
        keyword.addEventListener("input", () => { entry.keyword = keyword.value; });

        const content = document.createElement("input");
        content.type = "text";
        content.value = entry.content || "";
        content.placeholder = "content injected into prompt";
        content.style.cssText = "flex:1;background:#2a2a44;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:2px 6px";
        content.addEventListener("input", () => { entry.content = content.value; });

        const del = document.createElement("button");
        del.textContent = "✕";
        del.style.cssText = "background:#3a2a2a;color:#e06060;border:1px solid #5a3a3a;border-radius:4px;padding:2px 6px;cursor:pointer";
        del.addEventListener("click", () => {
          this.properties.entries = this.properties.entries.filter((_, i) => i !== idx);
          this._refreshCountWidget();
          renderList();
        });

        row.appendChild(checkbox);
        row.appendChild(keyword);
        row.appendChild(content);
        row.appendChild(del);
        listEl.appendChild(row);
      });
    };

    renderList();

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;gap:8px;margin-top:12px";

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add Entry";
    addBtn.style.cssText = "background:#2a4a2a;color:#6ee7b7;border:1px solid #3a6a3a;border-radius:4px;padding:4px 12px;cursor:pointer";
    addBtn.addEventListener("click", () => {
      if (!this.properties.entries) this.properties.entries = [];
      this.properties.entries.push({ keyword: "", content: "", enabled: true });
      this._refreshCountWidget();
      renderList();
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = "background:#2a2a3a;color:#a0a0c0;border:1px solid #444;border-radius:4px;padding:4px 12px;cursor:pointer;margin-left:auto";
    closeBtn.addEventListener("click", () => {
      overlay.remove();
      this._editorEl = null;
      this._refreshCountWidget();
    });

    toolbar.appendChild(addBtn);
    toolbar.appendChild(closeBtn);
    overlay.appendChild(toolbar);

    document.body.appendChild(overlay);
    this._editorEl = overlay;
  }

  serialize() {
    return { properties: this.properties };
  }

  configure(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      this._refreshCountWidget();
    }
  }
}

WorldInfoNode.title = "World Info";
WorldInfoNode.desc = "Lorebook / world info entries for prompt injection";
