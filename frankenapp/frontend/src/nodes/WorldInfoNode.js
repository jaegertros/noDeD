/**
 * WorldInfoNode — stores lorebook / world info entries.
 *
 * Outputs:
 *   world_info (string) — serialized world info for injection into prompts
 */
export class WorldInfoNode {
  constructor() {
    this.title = "World Info";
    this.color = "#2a4a6a";
    this.size = [260, 160];

    this.addOutput("world_info", "string");

    this.properties = {
      entries: [],
    };

    this._entryText = "";

    this.addWidget("text", "Entries (JSON)", "[]", (val) => {
      try {
        this.properties.entries = JSON.parse(val);
        this._entryText = val;
      } catch (_) {
        // Invalid JSON — keep old value
      }
    });
  }

  onExecute() {
    // Output a concatenated string of all active entries
    const active = (this.properties.entries || [])
      .filter((e) => e.enabled !== false)
      .map((e) => e.content || "")
      .join("\n\n");
    this.setOutputData(0, active);
  }

  onDrawForeground(ctx) {
    const count = (this.properties.entries || []).length;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#80a0c0";
    ctx.fillText(`${count} entr${count === 1 ? "y" : "ies"}`, 10, this.size[1] - 10);
  }

  serialize() {
    return { properties: this.properties };
  }

  configure(data) {
    if (data.properties) Object.assign(this.properties, data.properties);
  }
}

WorldInfoNode.title = "World Info";
WorldInfoNode.desc = "Lorebook / world info entries for prompt injection";
