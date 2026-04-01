#!/usr/bin/env bash
# init.sh — Bootstrap the frankenapp runtime directories and example files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Creating runtime volume directories..."
mkdir -p \
  "$ROOT_DIR/volumes/models" \
  "$ROOT_DIR/volumes/comfy-models" \
  "$ROOT_DIR/volumes/comfy-output" \
  "$ROOT_DIR/volumes/cards" \
  "$ROOT_DIR/volumes/state" \
  "$ROOT_DIR/volumes/graphs"

echo "==> Copying sample card..."
cp "$SCRIPT_DIR/sample_card.json" "$ROOT_DIR/volumes/cards/sample_card.json" 2>/dev/null || true

echo "==> Copying .env.example to .env (if not present)..."
if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "    Created .env — edit it to configure your model path and GPU layers."
else
  echo "    .env already exists, skipping."
fi

echo ""
echo "All done! Run 'docker compose up --build' to start frankenapp."
