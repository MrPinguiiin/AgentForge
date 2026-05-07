<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import * as api from '$lib/api/client.js';

  interface AgentConfig {
    provider: string;
    model: string;
    temperature: number;
    maxOutputTokens: number;
  }

  interface ModelInfo {
    id: string;
    name: string;
    tier: string;
  }

  interface ProviderInfo {
    type: string;
    name?: string;
    apiKey?: string;
    baseURL?: string;
    enabled: boolean;
  }

  interface AgentMeta {
    key: string;
    label: string;
    description: string;
    category: 'core' | 'specialist' | 'quality';
  }

  const AGENT_REGISTRY: AgentMeta[] = [
    // Core pipeline
    { key: 'planner', label: 'Planner', description: 'Breaks tasks into subtasks', category: 'core' },
    { key: 'coder', label: 'Coder', description: 'General code implementation', category: 'core' },
    { key: 'reviewer', label: 'Reviewer', description: 'Reviews code changes', category: 'core' },
    // Specialist agents
    { key: 'frontend', label: 'Frontend', description: 'UI components & styling', category: 'specialist' },
    { key: 'backend', label: 'Backend', description: 'APIs, services & database', category: 'specialist' },
    { key: 'debugger', label: 'Debugger', description: 'Bug analysis & fixes', category: 'specialist' },
    // Quality & research
    { key: 'qa', label: 'QA', description: 'Test writing & coverage', category: 'quality' },
    { key: 'docs', label: 'Docs', description: 'Documentation updates', category: 'quality' },
    { key: 'explore', label: 'Explore', description: 'Codebase research (read-only)', category: 'quality' },
  ];

  const CATEGORY_LABELS: Record<string, string> = {
    core: 'Core Pipeline',
    specialist: 'Specialist Agents',
    quality: 'Quality & Research',
  };

  let config = $state<{ agents: Record<string, AgentConfig>; providers?: Record<string, ProviderInfo> } | null>(null);
  let models = $state<Record<string, ModelInfo[]>>({});
  let saving = $state(false);
  let saveMessage = $state('');
  let testingProvider = $state<string | null>(null);
  let testResults = $state<Record<string, { ok: boolean; message: string }>>({});

  // Provider API keys (local state only, not fetched from server)
  let providerKeys = $state<Record<string, string>>({
    openai: '',
    anthropic: '',
    openrouter: '',
  });

  // Custom provider form
  let showAddCustom = $state(false);
  let customName = $state('');
  let customApiKey = $state('');
  let customBaseURL = $state('');
  let customSaving = $state(false);
  let customError = $state('');

  // Track custom providers from config
  let customProviders = $state<{ id: string; name: string; apiKey: string; baseURL: string }[]>([]);

  // Fetch models from a custom provider's remote API
  let fetchingModels = $state<string | null>(null);

  async function fetchCustomModels(providerId: string) {
    fetchingModels = providerId;
    try {
      const remoteModels = await api.fetchProviderModels(providerId);
      models = { ...models, [providerId]: remoteModels };
    } catch (err) {
      console.error(`Failed to fetch models for ${providerId}:`, err);
    } finally {
      fetchingModels = null;
    }
  }

  onMount(async () => {
    try {
      const [configData, modelsData] = await Promise.all([
        api.getConfig(),
        api.getModels(),
      ]);
      config = configData as typeof config;
      models = modelsData as typeof models;

      // Extract custom providers from config
      if (config?.providers) {
        customProviders = Object.entries(config.providers)
          .filter(([_, p]) => p.type === 'custom')
          .map(([id, p]) => ({
            id,
            name: p.name || id,
            apiKey: p.apiKey || '',
            baseURL: p.baseURL || '',
          }));

        // Auto-fetch models for all custom providers
        for (const cp of customProviders) {
          fetchCustomModels(cp.id);
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  });

  async function handleSave() {
    if (!config) return;
    saving = true;
    saveMessage = '';
    try {
      // Build providers object with built-in + custom
      const providers: Record<string, any> = {
        openai: { type: 'openai', apiKey: providerKeys.openai || undefined, enabled: true },
        anthropic: { type: 'anthropic', apiKey: providerKeys.anthropic || undefined, enabled: true },
        openrouter: { type: 'openrouter', apiKey: providerKeys.openrouter || undefined, enabled: true },
      };

      // Include custom providers
      for (const cp of customProviders) {
        providers[cp.id] = {
          type: 'custom',
          name: cp.name,
          apiKey: cp.apiKey || undefined,
          baseURL: cp.baseURL,
          enabled: true,
        };
      }

      await api.updateConfig({
        ...config,
        providers,
      });
      saveMessage = 'Settings saved!';
      setTimeout(() => (saveMessage = ''), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
      saveMessage = 'Failed to save';
    } finally {
      saving = false;
    }
  }

  async function handleTestProvider(provider: string) {
    testingProvider = provider;
    try {
      const result = (await api.testProvider(provider)) as { success: boolean; error?: string };
      testResults = { ...testResults, [provider]: { ok: result.success, message: result.error || 'Connected' } };
    } catch (err) {
      testResults = { ...testResults, [provider]: { ok: false, message: String(err) } };
    } finally {
      testingProvider = null;
    }
  }

  async function handleAddCustomProvider() {
    if (!customName.trim() || !customBaseURL.trim()) {
      customError = 'Name and Base URL are required';
      return;
    }

    customSaving = true;
    customError = '';
    try {
      // Generate a slug ID from the name
      const id = customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Check for duplicate
      if (customProviders.some((p) => p.id === id)) {
        customError = 'A provider with this name already exists';
        customSaving = false;
        return;
      }

      await api.addCustomProvider({
        id,
        name: customName.trim(),
        apiKey: customApiKey.trim(),
        baseURL: customBaseURL.trim(),
      });

      customProviders = [...customProviders, {
        id,
        name: customName.trim(),
        apiKey: customApiKey.trim(),
        baseURL: customBaseURL.trim(),
      }];

      // Fetch models from the new provider's API
      fetchCustomModels(id);

      // Reset form
      customName = '';
      customApiKey = '';
      customBaseURL = '';
      showAddCustom = false;
    } catch (err) {
      customError = err instanceof Error ? err.message : 'Failed to add provider';
    } finally {
      customSaving = false;
    }
  }

  async function handleDeleteCustomProvider(id: string) {
    try {
      await api.deleteCustomProvider(id);
      customProviders = customProviders.filter((p) => p.id !== id);

      // Refresh models list
      const modelsData = await api.getModels();
      models = modelsData as typeof models;
    } catch (err) {
      console.error('Failed to delete provider:', err);
    }
  }

  const builtinProviders = ['openai', 'anthropic', 'openrouter'] as const;

  // Dynamically get agent types that exist in config
  function getActiveAgents(): AgentMeta[] {
    if (!config) return [];
    return AGENT_REGISTRY.filter((a) => a.key in config!.agents);
  }

  function getAgentsByCategory(category: string): AgentMeta[] {
    return getActiveAgents().filter((a) => a.category === category);
  }

  // All available provider keys for agent dropdowns (built-in + custom)
  function getAllProviderKeys(): string[] {
    return [...builtinProviders, ...customProviders.map((p) => p.id)];
  }

  function getProviderDisplayName(key: string): string {
    const custom = customProviders.find((p) => p.id === key);
    if (custom) return custom.name;
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
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

      {#each builtinProviders as provider}
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

    <!-- Custom Providers -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-text uppercase tracking-wider">Custom Providers</h2>
          <p class="text-xs text-text-muted mt-1">Add OpenAI-compatible API endpoints.</p>
        </div>
        <Button variant="ghost" size="sm" onclick={() => (showAddCustom = !showAddCustom)}>
          {showAddCustom ? 'Cancel' : '+ Add Provider'}
        </Button>
      </div>

      <!-- Add Custom Provider Form -->
      {#if showAddCustom}
        <div class="p-4 rounded-lg border border-primary/30 bg-surface-light space-y-3">
          <h3 class="text-sm font-medium text-text">New Custom Provider</h3>

          {#if customError}
            <div class="px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
              {customError}
            </div>
          {/if}

          <div>
            <label for="custom-name" class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Provider Name</label>
            <input
              id="custom-name"
              type="text"
              bind:value={customName}
              placeholder="e.g. enowX Labs"
              class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label for="custom-baseurl" class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Base URL</label>
            <input
              id="custom-baseurl"
              type="text"
              bind:value={customBaseURL}
              placeholder="https://api.example.com/v1"
              class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
            />
          </div>

          <div>
            <label for="custom-apikey" class="block text-[10px] font-medium text-text-muted mb-1 uppercase">API Key</label>
            <input
              id="custom-apikey"
              type="password"
              bind:value={customApiKey}
              placeholder="API key (optional)"
              class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
            />
          </div>

          <div class="flex justify-end">
            <Button variant="primary" size="sm" loading={customSaving} onclick={handleAddCustomProvider}>
              Add Provider
            </Button>
          </div>
        </div>
      {/if}

      <!-- Existing Custom Providers -->
      {#each customProviders as provider}
        <div class="p-4 rounded-lg border border-border bg-surface-light">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-text">{provider.name}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">custom</span>
              {#if models[provider.id]?.length}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-lighter text-text-muted">
                  {models[provider.id].length} models
                </span>
              {/if}
              {#if testResults[provider.id]}
                <Badge variant={testResults[provider.id].ok ? 'success' : 'danger'}>
                  {testResults[provider.id].ok ? 'Connected' : 'Failed'}
                </Badge>
              {/if}
            </div>
            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                loading={fetchingModels === provider.id}
                onclick={() => fetchCustomModels(provider.id)}
              >
                Fetch Models
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={testingProvider === provider.id}
                onclick={() => handleTestProvider(provider.id)}
              >
                Test
              </Button>
              <button
                onclick={() => handleDeleteCustomProvider(provider.id)}
                class="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
          <div class="space-y-2">
            <div class="text-xs text-text-muted font-mono truncate">{provider.baseURL}</div>
            <input
              type="password"
              bind:value={provider.apiKey}
              placeholder="API key"
              class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
            />
          </div>
        </div>
      {/each}

      {#if customProviders.length === 0 && !showAddCustom}
        <div class="p-4 rounded-lg border border-border/50 bg-surface-light/50 text-center">
          <p class="text-xs text-text-muted">No custom providers configured.</p>
        </div>
      {/if}
    </section>

    <!-- Agent Model Configuration -->
    {#if config}
      <section class="space-y-6">
        <div>
          <h2 class="text-sm font-semibold text-text uppercase tracking-wider">Agent Models</h2>
          <p class="text-xs text-text-muted mt-1">Configure which model each agent uses. Agents are routed automatically based on task labels.</p>
        </div>

        {#each ['core', 'specialist', 'quality'] as category}
          {@const agents = getAgentsByCategory(category)}
          {#if agents.length > 0}
            <div class="space-y-3">
              <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                {#if category === 'core'}
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {:else if category === 'specialist'}
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                {:else}
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {/if}
                {CATEGORY_LABELS[category]}
              </h3>

              {#each agents as agentMeta}
                {@const agent = config.agents[agentMeta.key]}
                {#if agent}
                  <div class="p-4 rounded-lg border border-border bg-surface-light">
                    <div class="flex items-center justify-between mb-3">
                      <div>
                        <h4 class="text-sm font-medium text-text">{agentMeta.label} Agent</h4>
                        <p class="text-[10px] text-text-muted">{agentMeta.description}</p>
                      </div>
                      <Badge variant={category === 'core' ? 'primary' : category === 'specialist' ? 'info' : 'default'}>
                        {agentMeta.key}
                      </Badge>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Provider</label>
                        <select
                          bind:value={agent.provider}
                          class="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                        >
                          {#each getAllProviderKeys() as p}
                            <option value={p}>{getProviderDisplayName(p)}</option>
                          {/each}
                        </select>
                      </div>

                      <div>
                        <label class="block text-[10px] font-medium text-text-muted mb-1 uppercase">Model</label>
                        {#if models[agent.provider] && models[agent.provider].length > 0}
                          <select
                            bind:value={agent.model}
                            class="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                          >
                            {#each models[agent.provider] as model}
                              <option value={model.id}>{model.name}</option>
                            {/each}
                            {#if !models[agent.provider]?.some((m) => m.id === agent.model)}
                              <option value={agent.model}>{agent.model}</option>
                            {/if}
                          </select>
                        {:else}
                          <input
                            type="text"
                            bind:value={agent.model}
                            placeholder="Model ID (e.g. gpt-4o)"
                            class="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
                          />
                        {/if}
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
                          bind:value={agent.maxOutputTokens}
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
            </div>
          {/if}
        {/each}
      </section>
    {/if}

    <!-- Save -->
    <div class="flex items-center justify-end gap-3 pb-8">
      {#if saveMessage}
        <span class="text-xs {saveMessage.includes('Failed') ? 'text-red-400' : 'text-green-400'}">{saveMessage}</span>
      {/if}
      <Button variant="primary" loading={saving} onclick={handleSave}>
        Save Settings
      </Button>
    </div>
  </div>
</div>
