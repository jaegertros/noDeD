/**
 * ConnectionStatusWidget — displays a labeled connection status indicator
 * (green/yellow/red dot + text) inside a LiteGraph node.
 */
export class ConnectionStatusWidget {
  constructor(node, label = "Connection") {
    this.node = node;
    this.name = "connection_status";
    this.type = "connection_status";
    this.label = label;
    this.status = "disconnected"; // "connected" | "disconnected" | "reconnecting"
    this.y = 0;
  }

  computeSize() {
    return [this.node.size[0], 20];
  }

  draw(ctx, node, widget_width, y) {
    this.y = y;
    const colors = {
      connected: "#22c55e",
      reconnecting: "#eab308",
      disconnected: "#ef4444",
    };
    const labels = {
      connected: "Connected",
      reconnecting: "Reconnecting…",
      disconnected: "Disconnected",
    };

    const color = colors[this.status] ?? "#888";
    const text = labels[this.status] ?? this.status;

    // Dot
    ctx.beginPath();
    ctx.arc(14, y + 10, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Label
    ctx.font = "11px sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(`${this.label}: ${text}`, 24, y + 14);
  }

  mouse() {
    return false;
  }

  setStatus(status) {
    this.status = status;
    this.node.setDirtyCanvas(true);
  }
}
