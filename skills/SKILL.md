---
name: toolflow
description: Use the shared toolflow runtime from Pi for pipeline execution, registry inspection, and selected Flox and NixOS bridge calls.
---

# pi-toolflow

Use this skill when working inside Pi sessions that need access to the shared `toolflow` runtime.

## What It Provides

- A Pi-facing package and extension install surface
- Pi tools for `toolflow_registry`, `railway_pipe`, and selected Flox/NixOS bridge calls
- A `/toolflow-help` slash command for quick usage reminders

## Assumptions

- `toolflow` is installed on `PATH`
- The local `toolflow` config enables any bridges you expect to use

## Examples

- `toolflow_pipe` with `flox.search_packages '{"search_term":"bun","limit":3}'`
- `toolflow_nixos_nix` with `{"action":"search","source":"nixos","type":"packages","query":"ripgrep","limit":3}`
