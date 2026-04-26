import { type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIConfig, AgentModelConfig, ProviderConfig } from "./models.js";
import { DEFAULT_AI_CONFIG } from "./models.js";

type AgentName = "planner" | "coder" | "reviewer";

export class ProviderRegistry {
  private config: AIConfig;
  private providerCache: Map<string, ReturnType<typeof createOpenAI> | ReturnType<typeof createAnthropic> | ReturnType<typeof createOpenRouter>> = new Map();

  constructor(config?: AIConfig) {
    this.config = config ?? DEFAULT_AI_CONFIG;
  }

  /**
   * Get a LanguageModel instance for the given provider and model.
   */
  getModel(providerName: string, modelId: string): LanguageModel {
    const provider = this.getOrCreateProvider(providerName);

    // All AI SDK providers return a callable that produces a LanguageModel
    return (provider as any)(modelId) as LanguageModel;
  }

  /**
   * Get a LanguageModel for a specific agent type.
   */
  getAgentModel(agentName: AgentName): LanguageModel {
    const agentConfig = this.config.agents[agentName];
    return this.getModel(agentConfig.provider, agentConfig.model);
  }

  /**
   * Get the full agent configuration for a specific agent type.
   */
  getAgentConfig(agentName: AgentName): AgentModelConfig {
    return this.config.agents[agentName];
  }

  /**
   * Update the AI configuration.
   */
  updateConfig(newConfig: Partial<AIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // Clear cache so providers are re-created with new config
    this.providerCache.clear();
  }

  /**
   * Test that a provider is reachable and the API key is valid.
   */
  async testProvider(providerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const providerConfig = this.config.providers[providerName];
      if (!providerConfig) {
        return { success: false, error: `Provider "${providerName}" not found in config` };
      }

      if (!providerConfig.enabled) {
        return { success: false, error: `Provider "${providerName}" is disabled` };
      }

      // Just verify we can create the provider without errors
      this.getOrCreateProvider(providerName);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // --- Private ---

  private getOrCreateProvider(providerName: string) {
    const cached = this.providerCache.get(providerName);
    if (cached) return cached;

    const providerConfig = this.config.providers[providerName];
    if (!providerConfig) {
      throw new Error(`Provider "${providerName}" not found in config`);
    }

    const provider = this.createProvider(providerConfig);
    this.providerCache.set(providerName, provider);
    return provider;
  }

  private createProvider(config: ProviderConfig) {
    switch (config.type) {
      case "openai":
        return createOpenAI({
          apiKey: config.apiKey,
          ...(config.baseURL ? { baseURL: config.baseURL } : {}),
        });

      case "anthropic":
        return createAnthropic({
          apiKey: config.apiKey,
          ...(config.baseURL ? { baseURL: config.baseURL } : {}),
        });

      case "openrouter":
        return createOpenRouter({
          apiKey: config.apiKey,
        });

      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }
}
