<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import * as api from '$lib/api/client.js';

  interface AgentConfig {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
  }

  interface ModelInfo {
    id: string;
    name: string;
    tier: string;
  }

  let config = $state<{ agents: Record<string, AgentConfig> } | null>(null);
  let models = $state<Record<string, ModelInfo[]>>({});
  let saving = $state(false);
  let testingProvider = $state<string | null>(null);
  let testResults = $state<Record<string, { ok: boolean; message: string }>>({});

  // Provider API keys (local state only, not fetched from server)
  let providerKeys = $state<Record<string, string>>({
    openai: '',
    anthropic: '',
    openrouter: '',
  });

  onMount(async () => {
    try {
      const [configData, modelsData] = await Promise.all([
        api.getConfig(),
        api.getModels(),
      ]);
      config = configData as typeof config;
      models = modelsData as typeof models;
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  });

  async function handleSave() {
    if (!config) return;
    saving = true;
    try {
      await api.updateConfig({
        ...config,
        providers: {
          openai: { apiKey: providerKeys.openai || undefined },
          anthropic: { apiKey: providerKeys.anthropic || undefined },
          openrouter: { apiKey: providerKeys.openrouter || undefined },
        },
      });
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      saving = false;
    }
  }

  async function handleTestProvider(provider: string) {
    testingProvider = provider;
    try {
      const result = (await api.testProvider(provider)) as { ok: boolean; message?: string };
      testResults = { ...testResults, [provider]: { ok: result.ok, message: result.message || 'Connected' } };
    } catch (err) {
      testResults = { ...testResults, [provider]: { ok: false, message: String(err) } };
    } finally {
      testingProvider = null;
    }
  }

  const providers = ['openai', 'anthropic', 'openrouter'] as const;
  const agentTypes = ['planner', 'coder', 'reviewer'] as const;
</script>

<svelte:head>
  <title>AI Coder - Settings</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="max-w-2xl mx-auto p-6 space-y-8">
    <div>
      <h1 class="text-xl font-bold text-text">Settings</h1>
      <p class="text-sm text-text-muted mt-1">Configure AI providers and agent models.</p>
    </div>

    <!-- Provider API Keys -->
    <section class="space-y-4">
      <h2 class="text-sm font-semibold text-text uppercase tracking-wider">Provider API Keys</h2>
      <p class="text-xs text-text-muted">Keys are stored locally and sent to the server on save.</p>

      {#each providers as provider}
        <div class="p-4 rounded-lg border border-border bg-surface-light">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-text capitalize">{provider}</span>
              {#if testResults[provider]}
                <Badge variant={testResults[provider].ok ? 'success' : 'danger'}>
                  {testResults[provider].ok ? 'Connected' : 'Failed'}
                </Badge>
              {/if}
            </div>
            <Button
              variant="ghost"
              size="sm"
              loading={testingProvider === provider}
              onclick={() => handleTestProvider(provider)}
            >
              Test
            </Button>
          </div>
          <input
            type="password"
            bind:value={providerKeys[provider]}
            placeholder={`${provider} API key`}
            class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
          />
        </div>
      {/each}
    </section>

    <!-- Agent Model Configuration -->
    {#if config}
      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-text uppercase tracking-wider">Agent Models</h2>
        <p class="text-xs text-text-muted">Configure which model each agent uses.</p>

        {#each agentTypes as agentType}
          {@const agent = config.agents[agentType]}
          {#if agent}
            <div class="p-4 rounded-lg border border-border bg-surface-light">
              <h3 class="text-sm font-medium text-text capitalize mb-3">{agentType} Agent</h3>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Provider</label>
                  <select
                    bind:value={agent.provider}
                    class="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                  >
                    {#each providers as p}
                      <option value={p}>{p}</option>
                    {/each}
                  </select>
                </div>

                <div>
                  <label class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Model</label>
                  <select
                    bind:value={agent.model}
                    class="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                  >
                    {#if models[agent.provider]}
                      {#each models[agent.provider] as model}
                        <option value={model.id}>{model.name}</option>
                      {/each}
                    {/if}
                    <!-- Allow custom model ID -->
                    <option value={agent.model}>{agent.model}</option>
                  </select>
                </div>

                <div>
                  <label class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Temperature</label>
                  <input
                    type="number"
                    bind:value={agent.temperature}
                    min="0"
                    max="2"
                    step="0.1"
                    class="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Max Tokens</label>
                  <input
                    type="number"
                    bind:value={agent.maxTokens}
                    min="100"
                    max="128000"
                    step="100"
                    class="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </section>
    {/if}

    <!-- Save -->
    <div class="flex justify-end pb-8">
      <Button variant="primary" loading={saving} onclick={handleSave}>
        Save Settings
      </Button>
    </div>
  </div>
</div>
