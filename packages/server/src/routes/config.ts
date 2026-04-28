import { Hono } from "hono";
import type { Orchestrator } from "@ai-coder/core";
import { aiConfigSchema } from "@ai-coder/core";

export function createConfigRoutes(orchestrator: Orchestrator) {
  const app = new Hono();

  // Get current config (includes providers + agents)
  app.get("/", async (c) => {
    const registry = orchestrator.getProviderRegistry();
    const fullConfig = registry.getConfig();

    return c.json({
      config: {
        agents: {
          planner: registry.getAgentConfig("planner"),
          coder: registry.getAgentConfig("coder"),
          reviewer: registry.getAgentConfig("reviewer"),
        },
        providers: fullConfig.providers,
      },
    });
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

  // List available models (built-in + custom providers get empty list)
  app.get("/models", async (c) => {
    const registry = orchestrator.getProviderRegistry();
    const fullConfig = registry.getConfig();

    const models: Record<string, { id: string; name: string; tier: string }[]> = {
      openai: [
        { id: "gpt-4o", name: "GPT-4o", tier: "high" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", tier: "low" },
        { id: "gpt-4.1", name: "GPT-4.1", tier: "high" },
        { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", tier: "medium" },
        { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", tier: "low" },
      ],
      anthropic: [
        { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", tier: "high" },
        { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", tier: "low" },
      ],
      openrouter: [
        { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4 (via OpenRouter)", tier: "high" },
        { id: "openai/gpt-4o", name: "GPT-4o (via OpenRouter)", tier: "high" },
        { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro (via OpenRouter)", tier: "high" },
      ],
    };

    // Add custom providers with empty model lists (user types model ID manually)
    for (const [key, config] of Object.entries(fullConfig.providers)) {
      if (config.type === "custom" && !models[key]) {
        models[key] = [];
      }
    }

    return c.json({ models });
  });

  // Test provider connection
  app.post("/test-provider", async (c) => {
    const body = await c.req.json();
    const provider = body.provider as string;

    if (!provider) {
      return c.json({ error: "provider field required" }, 400);
    }

    const result = await orchestrator
      .getProviderRegistry()
      .testProvider(provider);
    return c.json(result);
  });

  // Add/update a custom provider
  app.post("/providers", async (c) => {
    try {
      const body = await c.req.json();
      const { id, name, apiKey, baseURL } = body as {
        id: string;
        name: string;
        apiKey: string;
        baseURL: string;
      };

      if (!id || !name || !baseURL) {
        return c.json({ error: "id, name, and baseURL are required" }, 400);
      }

      orchestrator.getProviderRegistry().updateConfig({
        providers: {
          [id]: {
            type: "custom",
            name,
            apiKey: apiKey || undefined,
            baseURL,
            enabled: true,
          },
        },
      });

      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 400);
    }
  });

  // Fetch models from a custom provider's /v1/models endpoint
  app.get("/providers/:id/models", async (c) => {
    const id = c.req.param("id");
    const registry = orchestrator.getProviderRegistry();
    const config = registry.getConfig();
    const provider = config.providers[id];

    if (!provider) {
      return c.json({ error: "Provider not found" }, 404);
    }

    if (!provider.baseURL) {
      return c.json({ error: "Provider has no baseURL" }, 400);
    }

    try {
      // Normalize baseURL: remove trailing /v1 if present, then append /v1/models
      let base = provider.baseURL.replace(/\/+$/, "");
      if (!base.endsWith("/v1")) {
        base += "/v1";
      }

      const headers: Record<string, string> = {};
      if (provider.apiKey) {
        headers["Authorization"] = `Bearer ${provider.apiKey}`;
      }

      const response = await fetch(`${base}/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return c.json(
          { error: `Failed to fetch models: ${response.status} ${text}`.trim() },
          400
        );
      }

      const data = (await response.json()) as {
        data?: { id: string; owned_by?: string }[];
        object?: string;
      };

      // OpenAI-compatible /v1/models returns { data: [{ id, owned_by, ... }] }
      const modelList = (data.data || []).map((m) => ({
        id: m.id,
        name: m.id,
        tier: "custom",
      }));

      return c.json({ models: modelList });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: `Failed to fetch models: ${message}` }, 400);
    }
  });

  // Delete a custom provider
  app.delete("/providers/:id", async (c) => {
    const id = c.req.param("id");
    const registry = orchestrator.getProviderRegistry();
    const config = registry.getConfig();
    const provider = config.providers[id];

    if (!provider) {
      return c.json({ error: "Provider not found" }, 404);
    }

    if (provider.type !== "custom") {
      return c.json({ error: "Cannot delete built-in providers" }, 400);
    }

    registry.removeProvider(id);
    return c.json({ success: true });
  });

  return app;
}
