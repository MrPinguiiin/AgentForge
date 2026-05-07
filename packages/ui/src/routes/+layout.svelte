<script lang="ts">
  import type { Snippet } from 'svelte';
  import { checkOpenCodeStatus, type OpenCodeStatus } from '$lib/api/client.js';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  const navItems = [
    { href: '/', label: 'Kanban Board', icon: 'view_kanban', filled: true },
    { href: '/terminal', label: 'Terminal', icon: 'terminal', filled: false },
    { href: '/settings', label: 'Settings', icon: 'settings', filled: false },
  ];

  let currentPath = $state('/');
  let openCodeStatus = $state<OpenCodeStatus>({ installed: false, version: null, path: null });
  let openCodeLoading = $state(true);

  $effect(() => {
    currentPath = window.location.pathname;
  });

  $effect(() => {
    checkOpenCodeStatus().then((status) => {
      openCodeStatus = status;
      openCodeLoading = false;
    }).catch(() => {
      openCodeLoading = false;
    });
  });
</script>

<div class="flex h-screen overflow-hidden bg-background">
  <!-- SideNavBar -->
  <nav class="bg-surface h-screen w-64 border-r border-outline-variant flex-col py-6 px-4 shrink-0 z-50 hidden md:flex">
    <!-- Brand Header -->
    <div class="flex items-center gap-3 mb-8 px-2">
      <div class="h-8 w-8 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-on-primary-container" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
      </div>
      <div>
        <h1 class="text-xl font-bold tracking-tighter text-on-surface leading-none">AgentForge</h1>
        <p class="text-secondary text-xs mt-1">v0.1.0</p>
      </div>
    </div>

    <!-- CTA Button -->
    <button class="w-full bg-primary text-on-primary font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 mb-6 hover:bg-primary-fixed-dim transition-colors">
      <span class="material-symbols-outlined text-sm">add</span>
      New Task
    </button>

    <!-- Main Nav -->
    <div class="flex-1 overflow-y-auto">
      <ul class="space-y-1">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ease-in-out text-sm tracking-tight
                {currentPath === item.href
                  ? 'bg-surface-container-highest text-primary font-semibold border-r-2 border-primary'
                  : 'text-secondary hover:bg-surface-container-high hover:text-on-surface'}"
              onclick={() => (currentPath = item.href)}
            >
              <span
                class="material-symbols-outlined text-lg"
                style={currentPath === item.href && item.filled ? "font-variation-settings: 'FILL' 1;" : ''}
              >{item.icon}</span>
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </div>

    <!-- Footer Nav -->
    <div class="mt-auto pt-6 border-t border-outline-variant">
      <ul class="space-y-1">
        <!-- OpenCode Status -->
        <li>
          <div class="flex items-center justify-between px-3 py-2">
            <div class="flex items-center gap-2 text-xs text-secondary">
              {#if openCodeLoading}
                <span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
                <span>Checking OpenCode...</span>
              {:else if openCodeStatus.installed}
                <span class="w-2 h-2 rounded-full bg-tertiary"></span>
                <span>OpenCode <span class="text-on-surface font-medium">v{openCodeStatus.version}</span></span>
              {:else}
                <span class="w-2 h-2 rounded-full bg-secondary"></span>
                <span>OpenCode</span>
              {/if}
            </div>
            {#if !openCodeLoading && !openCodeStatus.installed}
              <a
                href="https://opencode.ai/docs/"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-primary hover:text-primary-fixed-dim transition-colors"
              >
                Install &rarr;
              </a>
            {/if}
          </div>
        </li>
        <li>
          <a class="flex items-center gap-3 px-3 py-2 rounded-lg text-secondary hover:bg-surface-container-high hover:text-on-surface transition-all duration-200 ease-in-out text-sm tracking-tight" href="https://github.com" target="_blank">
            <span class="material-symbols-outlined text-lg">description</span>
            Docs
          </a>
        </li>
        <li>
          <div class="flex items-center gap-3 px-3 py-2 text-sm text-secondary">
            <span class="w-2 h-2 rounded-full bg-tertiary"></span>
            Server connected
          </div>
        </li>
      </ul>
    </div>
  </nav>

  <!-- Main Content Area -->
  <div class="flex-1 flex flex-col min-w-0 bg-background">
    {@render children()}
  </div>
</div>
