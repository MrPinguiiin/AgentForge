import * as fs from "node:fs";
import * as path from "node:path";
import type { AIConfig } from "@ai-coder/core";

/**
 * ConfigPersistence - Handles reading and writing the .ai-coder/config.json file.
 *
 * This ensures that any changes made to the AI config (providers, agents, etc.)
 * are persisted to disk and survive server restarts.
 */
export class ConfigPersistence {
  private configPath: string;

  constructor(projectRoot?: string) {
    const root = projectRoot || process.env.AI_CODER_PROJECT_DIR || process.cwd();
    this.configPath = path.join(root, ".ai-coder", "config.json");
  }

  /**
   * Read the full config file from disk.
   * Returns null if file doesn't exist.
   */
  read(): Record<string, unknown> | null {
    try {
      if (!fs.existsSync(this.configPath)) {
        return null;
      }
      const raw = fs.readFileSync(this.configPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Persist the AI config section back to disk.
   * Merges with existing config file (preserves other sections like server, context, git).
   */
  saveAIConfig(aiConfig: AIConfig): void {
    const existing = this.read() || {};

    // Merge the AI config into the existing file
    existing.ai = this.serializeAIConfig(aiConfig);

    // Ensure directory exists
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write atomically (write to temp, then rename)
    const tmpPath = this.configPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2), "utf-8");
    fs.renameSync(tmpPath, this.configPath);
  }

  /**
   * Serialize AIConfig to a JSON-friendly format for the config file.
   */
  private serializeAIConfig(config: AIConfig): Record<string, unknown> {
    const serialized: Record<string, unknown> = {
      defaultProvider: config.defaultProvider,
      providers: {} as Record<string, unknown>,
      agents: {} as Record<string, unknown>,
    };

    // Serialize providers
    for (const [key, provider] of Object.entries(config.providers)) {
      if (provider.type === "custom") {
        // Custom providers: save all fields
        (serialized.providers as Record<string, unknown>)[key] = {
          type: "custom",
          name: provider.name,
          apiKey: provider.apiKey || "",
          baseURL: provider.baseURL,
          enabled: provider.enabled ?? true,
        };
      } else {
        // Built-in providers: save apiKey and baseURL
        (serialized.providers as Record<string, unknown>)[key] = {
          apiKey: provider.apiKey || "",
          ...(provider.baseURL ? { baseUrl: provider.baseURL } : {}),
        };
      }
    }

    // Serialize agents
    for (const [key, agent] of Object.entries(config.agents)) {
      (serialized.agents as Record<string, unknown>)[key] = {
        provider: agent.provider,
        model: agent.model,
        temperature: agent.temperature,
        maxOutputTokens: agent.maxOutputTokens,
      };
    }

    return serialized;
  }

  /**
   * Get the config file path.
   */
  getPath(): string {
    return this.configPath;
  }
}
