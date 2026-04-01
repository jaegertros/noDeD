import { api } from "../services/api.js";

/**
 * ComfyWorkflowNode — executes a ComfyUI workflow triggered by an emotion.
 *
 * Inputs:
 *   trigger   (emotion)         — emotion string from EmotionDetector
 *   character (character_data)  — card data containing expression_map
 *
 * Outputs:
 *   image (image_data) — resulting image URL / data
 *
 * Properties (persisted):
 *   workflow_name, checkpoint, default_positive, default_negative,
 *   steps, cfg, seed
 *
 * Widgets:
 *   WORKFLOW    — dropdown loaded from GET /api/comfy/workflows
 *   STATUS      — "Idle" / "Generating… (step N/M)" / "Error"
 *   PREVIEW     — tiny thumbnail of last generated image on node face
 *   Open ComfyUI— button that opens http://localhost:8188 in a new tab
 *
 * Registration: image/ComfyWorkflow
 */

const COOLDOWN_MS = 5_000;

export class ComfyWorkflowNode {
  constructor() {
    this.title = "ComfyUI Workflow";
    this.color = "#BA7517";
    this.size = [280, 200];

    this.addInput("trigger", "emotion");
    this.addInput("character", "character_card");
    this.addOutput("image", "image_data");

    this.properties = {
      workflow_name: "expression_swap",
      checkpoint: "",
      default_positive: "masterpiece, best quality, detailed portrait",
      default_negative: "lowres, bad anatomy, blurry",
      steps: 20,
      cfg: 7.0,
      seed: -1,
    };

    this._status = "Idle";
    this._lastImageUrl = null;
    this._lastImageObj = null;
    this._lastRunAt = 0;
    this._workflows = [];
    this._prevTrigger = null;

    // WORKFLOW dropdown
    this._workflowWidget = this.addWidget(
      "combo",
      "Workflow",
      this.properties.workflow_name,
      (val) => { this.properties.workflow_name = val; },
      { values: [this.properties.workflow_name] },
    );

    // STATUS display (read-only text)
    this._statusWidget = this.addWidget("text", "Status", "Idle", null);

    // Open ComfyUI link button
    this.addWidget("button", "Open ComfyUI ↗", null, () => {
      window.open("http://localhost:8188", "_blank");
    });

    this._fetchWorkflows();
  }

  async _fetchWorkflows() {
    try {
      const data = await api.get("/api/comfy/workflows");
      this._workflows = (data || []).map((w) => w.name ?? w);
      if (this._workflowWidget) {
        this._workflowWidget.options.values = this._workflows;
        if (this._workflows.length && !this._workflows.includes(this.properties.workflow_name)) {
          this.properties.workflow_name = this._workflows[0];
          this._workflowWidget.value = this._workflows[0];
        }
      }
    } catch (_) {}
  }

  onExecute() {
    const trigger = this.getInputData(0);     // emotion string
    const character = this.getInputData(1);   // card data

    // Only re-run when trigger changes and cooldown has elapsed
    if (trigger && trigger !== this._prevTrigger) {
      const now = Date.now();
      if (now - this._lastRunAt >= COOLDOWN_MS) {
        this._prevTrigger = trigger;
        this._lastRunAt = now;
        this._runWorkflow(trigger, character);
      }
    }

    this.setOutputData(0, this._lastImageUrl);
  }

  async _runWorkflow(emotion, character) {
    this._status = "Generating…";
    if (this._statusWidget) this._statusWidget.value = this._status;
    this.setDirtyCanvas(true);

    // Build prompt overrides from character expression_map
    const expressionMap = character?.expression_map ?? {};
    const exprEntry = expressionMap[emotion] ?? {};

    const overrides = {
      POSITIVE_PROMPT: exprEntry.positive ?? this.properties.default_positive,
      NEGATIVE_PROMPT: exprEntry.negative ?? this.properties.default_negative,
    };
    if (this.properties.checkpoint) overrides.MODEL_PLACEHOLDER = this.properties.checkpoint;

    try {
      const result = await api.post("/api/comfy/execute-and-wait", {
        workflow_name: this.properties.workflow_name,
        overrides,
        steps: this.properties.steps,
        cfg: this.properties.cfg,
        seed: this.properties.seed,
      });

      this._lastImageUrl = result?.image_url ?? null;
      this._status = "Done";

      if (this._lastImageUrl) {
        const img = new Image();
        img.onload = () => {
          this._lastImageObj = img;
          this.setDirtyCanvas(true);
        };
        img.src = this._lastImageUrl;
      }
    } catch (err) {
      this._status = "Error";
    }

    if (this._statusWidget) this._statusWidget.value = this._status;
    this.setDirtyCanvas(true);
  }

  onDrawForeground(ctx) {
    // Status indicator dot (top-right)
    const dotColors = {
      Idle: "#888",
      "Generating…": "#eab308",
      Done: "#22c55e",
      Error: "#ef4444",
    };
    ctx.beginPath();
    ctx.arc(this.size[0] - 14, 12, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotColors[this._status] ?? "#888";
    ctx.fill();

    // PREVIEW thumbnail — last generated image in lower portion of node
    if (this._lastImageObj) {
      const thumbY = this.size[1] - 60;
      const thumbH = 52;
      const thumbW = this.size[0] - 20;
      ctx.drawImage(this._lastImageObj, 10, thumbY, thumbW, thumbH);
    } else {
      // Placeholder box
      const thumbY = this.size[1] - 60;
      ctx.fillStyle = "#2a2a44";
      ctx.fillRect(10, thumbY, this.size[0] - 20, 52);
      ctx.fillStyle = "#444";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No preview", this.size[0] / 2, thumbY + 28);
      ctx.textAlign = "left";
    }
  }

  serialize() {
    return { properties: this.properties };
  }

  configure(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      if (this._workflowWidget) this._workflowWidget.value = this.properties.workflow_name;
    }
  }
}

ComfyWorkflowNode.title = "ComfyUI Workflow";
ComfyWorkflowNode.desc = "Runs a ComfyUI workflow on emotion trigger";
