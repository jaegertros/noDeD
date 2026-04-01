import { LiteGraph } from "litegraph.js";

/**
 * Create a starter graph with one ModelBackend, one CharacterCard, and one
 * ChatSession node, pre-connected.
 */
export function createDefaultGraph(graph) {
  graph.clear();

  // ModelBackend node
  const modelNode = LiteGraph.createNode("backends/ModelBackend");
  modelNode.pos = [60, 200];
  graph.add(modelNode);

  // CharacterCard node
  const cardNode = LiteGraph.createNode("cards/CharacterCard");
  cardNode.pos = [60, 480];
  graph.add(cardNode);

  // ChatSession node
  const chatNode = LiteGraph.createNode("chat/ChatSession");
  chatNode.pos = [460, 300];
  graph.add(chatNode);

  // Connect: ModelBackend.inference -> ChatSession.model
  const modelOut = modelNode.findOutputSlot("inference");
  const chatModelIn = chatNode.findInputSlot("model");
  if (modelOut !== -1 && chatModelIn !== -1) {
    modelNode.connect(modelOut, chatNode, chatModelIn);
  }

  // Connect: CharacterCard.card -> ChatSession.card
  const cardOut = cardNode.findOutputSlot("card");
  const chatCardIn = chatNode.findInputSlot("card");
  if (cardOut !== -1 && chatCardIn !== -1) {
    cardNode.connect(cardOut, chatNode, chatCardIn);
  }
}

/**
 * Serialize the graph to JSON, including card data for portability.
 */
export async function exportGraph(graph) {
  const graphData = graph.serialize();
  // Collect referenced card names
  const cardNames = new Set();
  for (const node of graphData.nodes || []) {
    const cardName = node.properties?.card_name;
    if (cardName) cardNames.add(cardName);
  }

  // Fetch card data from the API
  const cards = {};
  for (const name of cardNames) {
    try {
      const resp = await fetch(`/api/cards/${encodeURIComponent(name)}`);
      if (resp.ok) {
        cards[name] = await resp.json();
      }
    } catch (_) {
      // Skip failed card loads
    }
  }

  return { graph: graphData, cards };
}
