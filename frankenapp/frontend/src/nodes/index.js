/**
 * Node type registration — imports all custom node classes and registers
 * them with LiteGraph.
 */

import { LiteGraph } from "litegraph.js";

import { CharacterCardNode } from "./CharacterCardNode.js";
import { ChatSessionNode } from "./ChatSessionNode.js";
import { ModelBackendNode } from "./ModelBackendNode.js";
import { EmotionDetectorNode } from "./EmotionDetectorNode.js";
import { ComfyWorkflowNode } from "./ComfyWorkflowNode.js";
import { PortraitNode } from "./PortraitNode.js";
import { WorldInfoNode } from "./WorldInfoNode.js";

export function registerAllNodes() {
  LiteGraph.registerNodeType("characters/CharacterCard", CharacterCardNode);
  LiteGraph.registerNodeType("chat/ChatSession", ChatSessionNode);
  LiteGraph.registerNodeType("backends/ModelBackend", ModelBackendNode);
  LiteGraph.registerNodeType("pipeline/EmotionDetector", EmotionDetectorNode);
  LiteGraph.registerNodeType("image/ComfyWorkflow", ComfyWorkflowNode);
  LiteGraph.registerNodeType("display/Portrait", PortraitNode);
  LiteGraph.registerNodeType("context/WorldInfo", WorldInfoNode);

  // Custom link type colors
  LiteGraph.registered_link_types = {
    model_connection: { color: "#D85A30" },  // coral
    character_data:   { color: "#534AB7" },  // purple
    text:             { color: "#888780" },  // gray
    emotion:          { color: "#BA7517" },  // amber
    image_data:       { color: "#1D9E75" },  // teal
    world_info:       { color: "#5F5E5A" },  // gray
    session:          { color: "#1D9E75" },  // teal
    emotion_pipeline: { color: "#BA7517" },  // amber
  };

  // Enable collapsible node subgroups (right-click → "Create Subgraph")
  LiteGraph.allow_subgraph_nodes = true;

  _registerContextMenu();
}

// ---------------------------------------------------------------------------
// Canvas context menu — organised by category
// ---------------------------------------------------------------------------

function _registerContextMenu() {
  if (!LiteGraph.LGraphCanvas) return; // guard: canvas class may not be loaded yet

  LiteGraph.LGraphCanvas.prototype.onMenuAdd = function (node, options, e, prev_menu) {
    const categories = {
      "backends/":   [{ label: "ModelBackend",    type: "backends/ModelBackend" }],
      "characters/": [{ label: "CharacterCard",   type: "characters/CharacterCard" }],
      "chat/":       [{ label: "ChatSession",     type: "chat/ChatSession" }],
      "pipeline/":   [{ label: "EmotionDetector", type: "pipeline/EmotionDetector" }],
      "image/":      [{ label: "ComfyWorkflow",   type: "image/ComfyWorkflow" }],
      "display/":    [{ label: "Portrait",        type: "display/Portrait" }],
      "context/":    [{ label: "WorldInfo",       type: "context/WorldInfo" }],
    };

    const canvas = this;
    const graph = this.graph;

    const addNode = (type) => {
      const n = LiteGraph.createNode(type);
      if (!n) return;
      const pos = canvas.convertEventToCanvasOffset(e);
      const w = (n.size && n.size[0]) || 200;
      const h = (n.size && n.size[1]) || 100;
      n.pos = [pos[0] - w / 2, pos[1] - h / 2];
      graph.add(n);
    };

    const entries = Object.entries(categories).map(([cat, nodes]) => ({
      content: cat,
      has_submenu: true,
      submenu: {
        options: nodes.map(({ label, type }) => ({
          content: label,
          callback: () => addNode(type),
        })),
      },
    }));

    new LiteGraph.ContextMenu(
      entries,
      { event: e, callback: null, parentMenu: prev_menu },
      window
    );
  };
}
