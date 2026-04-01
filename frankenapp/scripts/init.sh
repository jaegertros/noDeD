#!/usr/bin/env bash
# init.sh — First-run setup for frankenapp.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Frankenapp First-Run Setup ==="
mkdir -p \
  "$ROOT_DIR/volumes/models" \
  "$ROOT_DIR/volumes/comfy-models/checkpoints" \
  "$ROOT_DIR/volumes/comfy-output" \
  "$ROOT_DIR/volumes/cards" \
  "$ROOT_DIR/volumes/state" \
  "$ROOT_DIR/volumes/graphs"

cp "$SCRIPT_DIR/sample_card.json" "$ROOT_DIR/volumes/cards/" 2>/dev/null || true

if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

echo ""
echo "Setup complete! Next steps:"
echo "  1. Place your GGUF model in volumes/models/"
echo "  2. Place your SD checkpoint in volumes/comfy-models/checkpoints/"
echo "  3. Edit .env to set KOBOLD_MODEL to your model filename"
echo "  4. Run: docker compose up --build"
echo "  5. Open http://localhost:3000"
echo ""
echo "The default graph includes a sample character 'Echo' pre-wired."
