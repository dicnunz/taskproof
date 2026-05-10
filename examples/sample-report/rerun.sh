#!/usr/bin/env bash
set -euo pipefail
cd '/Users/nicdunz/Documents/Codex/2026-05-09/goal-chrome-plugin-chrome-openai-bundled-3/repos/taskproof'
npm run taskproof -- run --url 'http://127.0.0.1:43173/' --spec './demo/specs/diagnostics-sync.yaml' --out './artifacts/demo-eval'
