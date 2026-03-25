---
name: toolflow
description: Use the shared toolflow runtime from Pi for pipeline execution, registry inspection, and selected Flox and NixOS bridge calls.
---

# pi-toolflow

Use this skill when working inside Pi sessions that need access to the shared `toolflow` runtime.

## What It Provides

- A Pi-facing package and extension install surface
- A single Pi tool, `toolflow`, for running flows
- Slash commands for `/toolflow-registry`, `/toolflow-status`, `/toolflow-doctor`, and `/toolflow-help`

## Assumptions

- `toolflow` is installed on `PATH`
- The local `toolflow` config enables any bridges you expect to use

## Examples

- `toolflow` with `flox.search_packages '{"search_term":"bun","limit":3}'`
- `toolflow` with `nixos.nix '{"action":"search","source":"nixos","type":"packages","query":"ripgrep","limit":3}'`
