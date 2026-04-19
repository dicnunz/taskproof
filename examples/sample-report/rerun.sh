#!/usr/bin/env bash
set -euo pipefail
cd '/Users/nicdunz/Documents/Codex/2026-04-18-go-through-my-github-and-decide/repo_audit/taskproof'
npm run taskproof -- run --url 'http://127.0.0.1:43173/' --spec './demo/specs/diagnostics-sync.yaml' --out './artifacts/demo-eval'
