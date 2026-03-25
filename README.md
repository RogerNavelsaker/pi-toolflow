# pi-toolflow

Pi-facing extension package for `toolflow`.

This repo is the `pi install` surface. It owns Pi-specific package metadata and the install surface for `pi-coding-agent`. It does not own the `toolflow` MCP runtime packaging or the Nix/Flox packaging.

## Install

```bash
pi install RogerNavelsaker/pi-toolflow
```

The package contributes a Pi extension via `package.json#pi.extensions` and expects the `toolflow` binary to already be available on `PATH`.

## Current Scope

- Exposes a single Pi tool that calls `toolflow` over stdio
- Provides `/toolflow-registry`, `/toolflow-status`, `/toolflow-doctor`, and `/toolflow-help`
- Keeps Pi-specific UX separate from `toolflow-mcp` runtime and `nixpkg-toolflow-mcp` packaging

## Included Pi Tools

- `toolflow`

## Runtime

The extension talks to the installed `toolflow` binary over MCP stdio. In this workspace that usually comes from `nixpkg-toolflow-mcp` via Flox.
