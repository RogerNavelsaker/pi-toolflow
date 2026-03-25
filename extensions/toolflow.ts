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
  flow: Type.String({ description: "Toolflow flow expression" }),
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
      version: "0.2.0",
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

function registerToolflowTools(pi: any) {
  pi.registerTool({
    name: "toolflow",
    label: "Toolflow",
    description: "Run a Toolflow flow through the installed MCP runtime.",
    parameters: ToolflowPipeParams,
    async execute(_toolCallId: string, params: { flow: string }) {
      return await callTool("toolflow", { flow: params.flow });
    },
  });
}

export default function piToolflowExtension(pi: any): void {
  registerToolflowTools(pi);

  async function runCommand(subcommand: string, ctx: any) {
    const proc = Bun.spawnSync([TOOLFLOW_COMMAND, subcommand, "--json"], {
      env: {
        ...process.env,
        ...(resolveToolflowEnv() ?? {}),
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const stdout = proc.stdout.toString().trim();
    const stderr = proc.stderr.toString().trim();
    const content = stdout.length > 0 ? stdout : stderr || `${TOOLFLOW_COMMAND} ${subcommand} returned no output`;
    pi.sendMessage({
      customType: `pi-toolflow-${subcommand}`,
      content,
      display: true,
    });
    ctx?.ui?.notify?.(`toolflow ${subcommand}`, proc.exitCode === 0 ? "info" : "error");
  }

  pi.registerCommand("toolflow-help", {
    description: "Show available pi-toolflow commands and examples",
    handler: async (_args: string, ctx: any) => {
      const lines = [
        "## pi-toolflow",
        "",
        `- Runtime command: \`${TOOLFLOW_COMMAND}\``,
        "- MCP tool:",
        "  - toolflow",
        "- Slash commands:",
        "  - /toolflow-registry",
        "  - /toolflow-status",
        "  - /toolflow-doctor",
        "  - /toolflow-help",
        "",
        "- Example pipeline:",
        "  toolflow with flow:",
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

  pi.registerCommand("toolflow-registry", {
    description: "Show Toolflow flow verbs and loaded plugins",
    handler: async (_args: string, ctx: any) => {
      await runCommand("registry", ctx);
    },
  });

  pi.registerCommand("toolflow-status", {
    description: "Show Toolflow runtime status",
    handler: async (_args: string, ctx: any) => {
      await runCommand("status", ctx);
    },
  });

  pi.registerCommand("toolflow-doctor", {
    description: "Run Toolflow runtime checks",
    handler: async (_args: string, ctx: any) => {
      await runCommand("doctor", ctx);
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
