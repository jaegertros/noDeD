import { api } from "../services/api.js";

/**
 * ComfyWorkflowNode — executes a ComfyUI workflow.
 *
 * Inputs:
 *   trigger   (event)  — triggers execution
 *   emotion   (string) — used to look up expression overrides
 *
 * Outputs:
 *   image_url (string) — resulting image URL
 */
export class ComfyWorkflowNode {
  constructor() {
    this.title = "ComfyUI Workflow";
    this.color = "#7a4a1a";
    this.size = [260, 160];

    this.addInput("trigger", "event");
    this.addInput("emotion", "string");
    this.addOutput("image_url", "string");

    this.properties = {
      workflow: "expression_swap",
      positive_prompt: "masterpiece, best quality, detailed portrait",
      negative_prompt: "lowres, bad anatomy, blurry",
    };

    this._status = "idle";
    this._lastImageUrl = null;

    this.addWidget("text", "Positive", this.properties.positive_prompt, (val) => {
      this.properties.positive_prompt = val;
    });
    this.addWidget("text", "Negative", this.properties.negative_prompt, (val) => {
      this.properties.negative_prompt = val;
    });
    this.addWidget("button", "Run Now", null, () => this._execute());
  }

  async _execute() {
    this._status = "running";
    this.setDirtyCanvas(true);
    try {
      const result = await api.post("/api/comfy/execute", {
        workflow: this.properties.workflow,
        overrides: {
          POSITIVE_PROMPT: this.properties.positive_prompt,
          NEGATIVE_PROMPT: this.properties.negative_prompt,
        },
      });
      this._lastImageUrl = result?.image_url || null;
      this._status = "done";
    } catch (_) {
      this._status = "error";
    }
    this.setDirtyCanvas(true);
  }

  onExecute() {
    this.setOutputData(0, this._lastImageUrl);
  }

  onDrawForeground(ctx) {
    const statusColors = { idle: "#888", running: "#eab308", done: "#22c55e", error: "#ef4444" };
    ctx.beginPath();
    ctx.arc(this.size[0] - 16, 10, 5, 0, Math.PI * 2);
    ctx.fillStyle = statusColors[this._status] || "#888";
    ctx.fill();
  }
}

ComfyWorkflowNode.title = "ComfyUI Workflow";
ComfyWorkflowNode.desc = "Runs a ComfyUI workflow and outputs the image";
