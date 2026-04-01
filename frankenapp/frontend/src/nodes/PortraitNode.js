/**
 * PortraitNode — displays a character portrait image.
 *
 * Inputs:
 *   image_url (string) — URL of the portrait image
 *   emotion   (string) — current emotion label
 *
 * Outputs:
 *   (none — display-only node)
 */
export class PortraitNode {
  constructor() {
    this.title = "Portrait";
    this.color = "#1a4a3a";
    this.size = [200, 260];

    this.addInput("image_url", "string");
    this.addInput("emotion", "string");

    this._imageUrl = null;
    this._emotion = null;
    this._img = null;
  }

  onExecute() {
    const url = this.getInputData(0);
    const emotion = this.getInputData(1);

    if (url !== this._imageUrl) {
      this._imageUrl = url;
      if (url) {
        const img = new Image();
        img.onload = () => {
          this._img = img;
          this.setDirtyCanvas(true);
        };
        img.src = url;
      } else {
        this._img = null;
      }
    }
    this._emotion = emotion;
  }

  onDrawForeground(ctx) {
    const pad = 8;
    const w = this.size[0] - pad * 2;
    const h = this.size[1] - pad * 2 - 20;

    if (this._img) {
      ctx.drawImage(this._img, pad, pad + 20, w, h);
    } else {
      ctx.fillStyle = "#2a2a44";
      ctx.fillRect(pad, pad + 20, w, h);
      ctx.fillStyle = "#555";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No image", this.size[0] / 2, this.size[1] / 2);
      ctx.textAlign = "left";
    }

    if (this._emotion) {
      ctx.fillStyle = "#3a3a6e";
      ctx.fillRect(pad, this.size[1] - 20, w, 16);
      ctx.fillStyle = "#a0c0f0";
      ctx.font = "11px sans-serif";
      ctx.fillText(this._emotion, pad + 4, this.size[1] - 7);
    }
  }
}

PortraitNode.title = "Portrait";
PortraitNode.desc = "Displays a character portrait with emotion label";
