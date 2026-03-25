import { Type } from "@sinclair/typebox";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLFLOW_COMMAND = process.env.TOOLFLOW_COMMAND || "toolflow";
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(EXTENSION_DIR, "..");
const DEFAULT_LOCAL_TOOLFLOW_ROOT = resolve(REPO_ROOT, "..", "toolflow-mcp");
const DEFAULT_LOCAL_CONFIG_PATH = resolve(DEFAULT_LOCAL_TOOLFLOW_ROOT, "toolflow.config.json");
const DEFAULT_LOCAL_SECRETS_PATH = resolve(DEFAULT_LOCAL_TOOLFLOW_ROOT, "toolflow.secrets.json");

function resolvePackagedToolflowRoot(): string | null {
  const toolflowPath = Bun.which(TOOLFLOW_COMMAND);
  if (!toolflowPath) return null;
  return resolve(dirname(toolflowPath), "..", "share", "toolflow");
}

function resolveToolflowEnv(): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  const packagedRoot = resolvePackagedToolflowRoot();
  const packagedConfigPath = packagedRoot ? resolve(packagedRoot, "toolflow.config.json") : "";
  const packagedSecretsPath = packagedRoot ? resolve(packagedRoot, "toolflow.secrets.json") : "";
  const configPath =
    process.env.TOOLFLOW_CONFIG ||
    (existsSync(DEFAULT_LOCAL_CONFIG_PATH) ? DEFAULT_LOCAL_CONFIG_PATH : existsSync(packagedConfigPath) ? packagedConfigPath : "");
  const secretsPath =
    process.env.TOOLFLOW_SECRETS ||
    (existsSync(DEFAULT_LOCAL_SECRETS_PATH) ? DEFAULT_LOCAL_SECRETS_PATH : existsSync(packagedSecretsPath) ? packagedSecretsPath : "");

  if (configPath) env.TOOLFLOW_CONFIG = configPath;
  if (secretsPath) env.TOOLFLOW_SECRETS = secretsPath;

  return Object.keys(env).length > 0 ? env : undefined;
}

const ToolflowPipeParams = Type.Object({
  script: Type.String({ description: "Toolflow pipeline script" }),
});

const ToolflowJsonArgsParams = Type.Object({
  arguments_json: Type.String({ description: "JSON object arguments serialized as a string" }),
});

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

let _clientPromise: Promise<Client> | null = null;
let _transport: StdioClientTransport | null = null;

async function getClient(): Promise<Client> {
  if (_clientPromise) return await _clientPromise;
  _clientPromise = (async () => {
    const client = new Client({
      name: "pi-toolflow",
      version: "0.1.0",
    });
    _transport = new StdioClientTransport({
      command: TOOLFLOW_COMMAND,
      env: resolveToolflowEnv(),
      stderr: "inherit",
    });
    await client.connect(_transport);
    return client;
  })();
  return await _clientPromise;
}

async function callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResponse> {
  const client = await getClient();
  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });

  const textContent = result.content
    .filter((item) => item.type === "text")
    .map((item) => ({ type: "text" as const, text: item.text }));

  if (textContent.length > 0) {
    return {
      content: textContent,
      details: {
        structuredContent: result.structuredContent ?? null,
        isError: result.isError ?? false,
      },
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result.structuredContent ?? result.content ?? {}, null, 2),
      },
    ],
    details: {
      structuredContent: result.structuredContent ?? null,
      isError: result.isError ?? false,
    },
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("arguments_json must decode to a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function registerToolflowTools(pi: any) {
  pi.registerTool({
    name: "toolflow_registry",
    label: "Toolflow Registry",
    description: "List verbs and direct tools currently exposed by the installed toolflow runtime.",
    parameters: Type.Object({}),
    async execute() {
      return await callTool("toolflow_registry", {});
    },
  });

  pi.registerTool({
    name: "toolflow_run",
    label: "Toolflow Run",
    description: "Run a Toolflow pipeline script through the installed MCP runtime.",
    parameters: ToolflowPipeParams,
    async execute(_toolCallId: string, params: { script: string }) {
      return await callTool("toolflow_run", { script: params.script });
    },
  });

  pi.registerTool({
    name: "toolflow_flox_search_packages",
    label: "Toolflow Flox Search",
    description: "Search Flox packages through toolflow's Flox bridge.",
    parameters: ToolflowJsonArgsParams,
    async execute(_toolCallId: string, params: { arguments_json: string }) {
      return await callTool("flox_search_packages", { arguments_json: params.arguments_json });
    },
  });

  pi.registerTool({
    name: "toolflow_flox_run_command",
    label: "Toolflow Flox Run",
    description: "Run a command inside a Flox environment through toolflow's Flox bridge.",
    parameters: ToolflowJsonArgsParams,
    async execute(_toolCallId: string, params: { arguments_json: string }) {
      return await callTool("flox_run_command", { arguments_json: params.arguments_json });
    },
  });

  pi.registerTool({
    name: "toolflow_nixos_nix",
    label: "Toolflow NixOS Query",
    description: "Run the main NixOS MCP query tool through toolflow's NixOS bridge.",
    parameters: ToolflowJsonArgsParams,
    async execute(_toolCallId: string, params: { arguments_json: string }) {
      return await callTool("nixos_nix", { arguments_json: params.arguments_json });
    },
  });
}

export default function piToolflowExtension(pi: any): void {
  registerToolflowTools(pi);

  pi.registerCommand("toolflow-help", {
    description: "Show available pi-toolflow commands and examples",
    handler: async (_args: string, ctx: any) => {
      const lines = [
        "## pi-toolflow",
        "",
        `- Runtime command: \`${TOOLFLOW_COMMAND}\``,
        "- Tools:",
        "  - toolflow_registry",
        "  - toolflow_run",
        "  - toolflow_flox_search_packages",
        "  - toolflow_flox_run_command",
        "  - toolflow_nixos_nix",
        "",
        "- Example pipeline:",
        "  toolflow_run with script:",
        "  flox.search_packages '{\"search_term\":\"bun\",\"limit\":3}'",
        "",
        "- Config overrides:",
        "  TOOLFLOW_CONFIG=/path/to/toolflow.config.json",
        "  TOOLFLOW_SECRETS=/path/to/toolflow.secrets.json",
        "",
        "- Example NixOS query:",
        "  toolflow_nixos_nix with:",
        "  {\"action\":\"search\",\"source\":\"nixos\",\"type\":\"packages\",\"query\":\"ripgrep\",\"limit\":3}",
      ];
      ctx?.ui?.notify?.("pi-toolflow loaded", "info");
      pi.sendMessage({
        customType: "pi-toolflow-help",
        content: lines.join("\n"),
        display: true,
      });
    },
  });

  pi.on("session_shutdown", async () => {
    if (_transport) {
      try {
        await _transport.close();
      } catch {
        // best effort
      }
    }
    _transport = null;
    _clientPromise = null;
  });
}
