import { Hono } from "hono";
import type { Orchestrator } from "@ai-coder/core";
import { aiConfigSchema } from "@ai-coder/core";

export function createConfigRoutes(orchestrator: Orchestrator) {
  const app = new Hono();

  // Get current config
  app.get("/", async (c) => {
    const providerRegistry = orchestrator.getProviderRegistry();
    const config = {
      agents: {
        planner: providerRegistry.getAgentConfig("planner"),
        coder: providerRegistry.getAgentConfig("coder"),
        reviewer: providerRegistry.getAgentConfig("reviewer"),
      },
    };

    return c.json({ config });
  });

  // Update config
  app.put("/", async (c) => {
    try {
      const body = await c.req.json();
      const validated = aiConfigSchema.parse(body);

      orchestrator.getProviderRegistry().updateConfig(validated);

      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 400);
    }
  });

  // List available models
  app.get("/models", async (c) => {
    const models = {
      openai: [
        { id: "gpt-4o", name: "GPT-4o", tier: "high" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", tier: "low" },
        { id: "gpt-4.1", name: "GPT-4.1", tier: "high" },
        { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", tier: "medium" },
        { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", tier: "low" },
      ],
      anthropic: [
        {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          tier: "high",
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          tier: "low",
        },
      ],
      openrouter: [
        {
          id: "anthropic/claude-sonnet-4-20250514",
          name: "Claude Sonnet 4 (via OpenRouter)",
          tier: "high",
        },
        {
          id: "openai/gpt-4o",
          name: "GPT-4o (via OpenRouter)",
          tier: "high",
        },
        {
          id: "google/gemini-2.5-pro-preview",
          name: "Gemini 2.5 Pro (via OpenRouter)",
          tier: "high",
        },
      ],
    };

    return c.json({ models });
  });

  // Test provider connection
  app.post("/test-provider", async (c) => {
    const body = await c.req.json();
    const provider = body.provider as "openai" | "anthropic" | "openrouter";

    if (!provider) {
      return c.json({ error: "provider field required" }, 400);
    }

    const result = await orchestrator
      .getProviderRegistry()
      .testProvider(provider);
    return c.json(result);
  });

  return app;
}
