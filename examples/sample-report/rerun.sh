#!/usr/bin/env bash
set -euo pipefail
cd '/Users/nicdunz/Documents/Codex/2026-04-18-build-and-ship-a-polished-local' && npm run taskproof -- run --url 'http://127.0.0.1:43173/' --spec '/Users/nicdunz/Documents/Codex/2026-04-18-build-and-ship-a-polished-local/demo/specs/diagnostics-sync.yaml' --out '/Users/nicdunz/Documents/Codex/2026-04-18-build-and-ship-a-polished-local/artifacts/demo-eval'
