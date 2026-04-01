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
  LiteGraph.registerNodeType("cards/CharacterCard", CharacterCardNode);
  LiteGraph.registerNodeType("chat/ChatSession", ChatSessionNode);
  LiteGraph.registerNodeType("backends/ModelBackend", ModelBackendNode);
  LiteGraph.registerNodeType("utils/EmotionDetector", EmotionDetectorNode);
  LiteGraph.registerNodeType("comfy/ComfyWorkflow", ComfyWorkflowNode);
  LiteGraph.registerNodeType("ui/Portrait", PortraitNode);
  LiteGraph.registerNodeType("world/WorldInfo", WorldInfoNode);
}
