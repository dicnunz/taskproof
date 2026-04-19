# Sample Report

This directory contains a committed real TaskProof run against the bundled Northstar Workboard demo.

## What it proves

The shipped spec passes because the UI handles the failing sync path gracefully, while TaskProof still captures the underlying failed request and console errors. That is the core product story.

## Open locally

- Open `./report/index.html` from disk to inspect the static report UI.
- GitHub will show the HTML source, not the live rendered report.

## Evidence files

- `bundle.json`: machine-readable source-of-truth bundle
- `spec.json`: normalized task spec used for the run
- `logs/console-events.json`: captured console errors
- `logs/network-events.json`: failed request evidence
- `rerun.sh`: deterministic rerun script from the repo root
- `taskproof-evidence.zip`: zipped copy of the full run
