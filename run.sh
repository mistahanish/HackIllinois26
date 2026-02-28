#!/usr/bin/env bash
# Run the Expo app using the HackAstra conda environment
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate HackAstra conda env (works when conda is in PATH)
if command -v conda &>/dev/null; then
  eval "$(conda shell.bash hook)"
  conda activate HackAstra
fi

npm start
