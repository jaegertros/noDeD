import { LGraph, LGraphCanvas, LiteGraph } from "litegraph.js";
import "litegraph.js/css/litegraph.css";
import "./styles/main.css";
import { registerAllNodes } from "./nodes/index.js";
import { createDefaultGraph } from "./graph.js";
import { api } from "./services/api.js";

// ---------------------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById("graph-canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (graphCanvas) graphCanvas.resize();
});

// ---------------------------------------------------------------------------
// LiteGraph theme overrides
// ---------------------------------------------------------------------------

LiteGraph.NODE_DEFAULT_COLOR = "#2d2d44";
LiteGraph.NODE_DEFAULT_BGCOLOR = "#1e1e32";
LiteGraph.NODE_TITLE_COLOR = "#e0e0e0";
LiteGraph.LINK_COLOR = "#6366f1";
LiteGraph.DEFAULT_SHADOW_COLOR = "rgba(0,0,0,0.3)";

// ---------------------------------------------------------------------------
// Register all custom node types
// ---------------------------------------------------------------------------

registerAllNodes();

// ---------------------------------------------------------------------------
// Create graph and canvas
// ---------------------------------------------------------------------------

const graph = new LGraph();
const graphCanvas = new LGraphCanvas(canvas, graph);

graphCanvas.background_image = null;
graphCanvas.clear_background_color = "#1a1a2e";

// ---------------------------------------------------------------------------
// Load saved graph or create default
// ---------------------------------------------------------------------------

async function loadGraph() {
  try {
    const saved = await api.get("/api/graphs/__autosave");
    if (saved && saved.nodes) {
      graph.configure(saved);
      return;
    }
  } catch (_) {
    // No autosave — fall through to default graph
  }
  createDefaultGraph(graph);
}

await loadGraph();
graph.start();

// ---------------------------------------------------------------------------
// Auto-save every 30 seconds
// ---------------------------------------------------------------------------

setInterval(async () => {
  try {
    const graphData = graph.serialize();
    await api.post("/api/graphs", { name: "__autosave", graph_data: graphData });
  } catch (_) {
    // Ignore save errors silently
  }
}, 30_000);

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  // Ctrl+S: save graph
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    const name = prompt("Save graph as:", "my-graph") || "__autosave";
    const graphData = graph.serialize();
    api.post("/api/graphs", { name, graph_data: graphData }).catch(console.error);
    return;
  }

  // Space: toggle chat mode if a ChatSession node is selected
  if (e.code === "Space" && !e.target.matches("input, textarea")) {
    e.preventDefault();
    const selected = graphCanvas.selected_nodes;
    for (const node of Object.values(selected || {})) {
      if (node.type === "chat/ChatSession" && typeof node.toggleChatPanel === "function") {
        node.toggleChatPanel();
        break;
      }
    }
    return;
  }

  // Tab: open node search menu
  if (e.key === "Tab" && !e.target.matches("input, textarea")) {
    e.preventDefault();
    graphCanvas.showSearchBox(null);
    return;
  }
});

export { graph, graphCanvas };
