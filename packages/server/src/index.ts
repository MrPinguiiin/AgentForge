import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
  initializeDatabase,
  Orchestrator,
  TaskManager,
  ProviderRegistry,
  DEFAULT_AI_CONFIG,
} from "@ai-coder/core";
import type { AIConfig } from "@ai-coder/core";
import { createApp } from "./app.js";
import { WebSocketHandler } from "./ws/handler.js";
import { findAvailablePort } from "./utils/port-finder.js";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
  staticDir?: string;
  aiConfig?: AIConfig;
  projectRoot?: string;
}

const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3001,
  host: "localhost",
  dbPath: ".ai-coder/ai-coder.db",
  staticDir: undefined,
  projectRoot: undefined,
};

export async function startServer(
  config: Partial<ServerConfig> = {}
): Promise<{ port: number; close: () => void }> {
  const finalConfig = { ...DEFAULT_SERVER_CONFIG, ...config };

  // Auto port detection: find an available port
  const requestedPort = finalConfig.port;
  const availablePort = await findAvailablePort({
    preferredPort: requestedPort,
    host: finalConfig.host,
  });

  if (availablePort !== requestedPort) {
    console.log(
      `  \x1b[33m[PORT]\x1b[0m Port ${requestedPort} is in use, using port ${availablePort} instead`
    );
  }

  finalConfig.port = availablePort;

  // Ensure .ai-coder directory exists
  const dbDir = path.dirname(finalConfig.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize database
  const db = initializeDatabase(finalConfig.dbPath);

  // Load AI config
  const aiConfig = finalConfig.aiConfig || loadAIConfig();

  // Create task manager and provider registry
  const taskManager = new TaskManager(db);
  const providerRegistry = new ProviderRegistry(aiConfig);

  // Create orchestrator
  const projectRoot = finalConfig.projectRoot || process.env.AI_CODER_PROJECT_DIR || process.cwd();
  const orchestrator = new Orchestrator({
    projectRoot,
    db,
    taskManager,
    providerRegistry,
    autoCommit: true,
    autoPush: false,
  });

  // Create Hono app
  const app = createApp(orchestrator, finalConfig.staticDir);

  // Setup WebSocket
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  const wsHandler = new WebSocketHandler(orchestrator);

  app.get(
    "/ws",
    upgradeWebSocket((_c) => ({
      onOpen(_event, ws) {
        wsHandler.onOpen(ws);
      },
      onMessage(event, ws) {
        wsHandler.onMessage(ws, String(event.data));
      },
      onClose(_event, ws) {
        wsHandler.onClose(ws);
      },
      onError(event, ws) {
        wsHandler.onError(ws, event);
      },
    }))
  );

  // Start server
  const server = serve(
    {
      fetch: app.fetch,
      port: finalConfig.port,
      hostname: finalConfig.host,
    },
    (info) => {
      console.log("");
      console.log(
        "  \x1b[36m======================================\x1b[0m"
      );
      console.log(
        "  \x1b[1m  AI Coder is running!\x1b[0m"
      );
      console.log("");
      console.log(
        `  \x1b[32m  http://${finalConfig.host}:${info.port}\x1b[0m`
      );
      console.log("");
      console.log(
        "  \x1b[36m======================================\x1b[0m"
      );
      console.log("");
    }
  );

  // Inject WebSocket into the HTTP server
  injectWebSocket(server);

  return {
    port: availablePort,
    close: () => {
      server.close();
    },
  };
}

function loadAIConfig(): AIConfig {
  // Try to load from .ai-coder/config.json
  const configPath = ".ai-coder/config.json";
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.ai) {
        const fileAI = parsed.ai;

        // Merge providers (preserves custom providers from disk)
        const providers = {
          ...DEFAULT_AI_CONFIG.providers,
          ...(fileAI.providers || {}),
        };

        // Merge agents (handle both maxTokens and maxOutputTokens formats)
        const agents = { ...DEFAULT_AI_CONFIG.agents };
        if (fileAI.agents) {
          for (const [key, agentRaw] of Object.entries(fileAI.agents)) {
            const agent = agentRaw as Record<string, unknown>;
            if (key in agents) {
              (agents as any)[key] = {
                ...(agents as any)[key],
                ...agent,
                // Normalize: support both maxTokens (old) and maxOutputTokens (new)
                maxOutputTokens: agent.maxOutputTokens ?? agent.maxTokens ?? (agents as any)[key].maxOutputTokens,
              };
              // Remove old field if present
              delete (agents as any)[key].maxTokens;
            }
          }
        }

        return {
          defaultProvider: fileAI.defaultProvider || DEFAULT_AI_CONFIG.defaultProvider,
          providers,
          agents,
        };
      }
    } catch {
      // Fall through to default
    }
  }

  // Use defaults with env vars applied
  const config = { ...DEFAULT_AI_CONFIG };
  const envKeys: Record<string, string | undefined> = {
    openai: process.env.AI_CODER_OPENAI_KEY,
    anthropic: process.env.AI_CODER_ANTHROPIC_KEY,
    openrouter: process.env.AI_CODER_OPENROUTER_KEY,
  };

  for (const [name, key] of Object.entries(envKeys)) {
    if (key && config.providers[name]) {
      (config.providers[name] as any).apiKey = key;
    }
  }

  return config;
}

// Re-export utilities
export { findAvailablePort } from "./utils/port-finder.js";
export type { FindPortOptions } from "./utils/port-finder.js";

// Allow direct execution
const currentFile = new URL(import.meta.url).pathname;
if (process.argv[1] && currentFile.endsWith(process.argv[1].replace(/.*\//, ""))) {
  const port = parseInt(process.env.AI_CODER_PORT || "3001");
  startServer({ port });
}
