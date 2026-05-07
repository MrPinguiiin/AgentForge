<script lang="ts">
  import type { Snippet } from 'svelte';
  import { checkOpenCodeStatus, type OpenCodeStatus } from '$lib/api/client.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import { themeStore } from '$lib/stores/theme.svelte.js';
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
  <!-- Sidebar -->
  <nav class="bg-sidebar h-screen w-64 border-r border-sidebar-border flex-col py-6 px-4 shrink-0 z-50 hidden md:flex">
    <!-- Brand -->
    <div class="flex items-center gap-3 mb-8 px-2">
      <div class="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-primary-foreground text-lg" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
      </div>
      <div>
        <h1 class="text-xl font-bold tracking-tighter text-sidebar-foreground leading-none">AgentForge</h1>
        <p class="text-muted-foreground text-xs mt-1">v0.1.0</p>
      </div>
    </div>

    <!-- Main Nav -->
    <div class="flex-1 overflow-y-auto">
      <ul class="space-y-1">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ease-in-out text-sm tracking-tight
                {currentPath === item.href
                  ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'}"
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

    <!-- Footer -->
    <div class="mt-auto pt-4 border-t border-sidebar-border space-y-1">
      <!-- Theme Switcher -->
      <div class="flex items-center justify-between px-3 py-2">
        <span class="text-xs text-muted-foreground">Theme</span>
        <div class="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
          <button
            onclick={() => themeStore.set('light')}
            class="p-1.5 rounded-md transition-all {themeStore.current === 'light' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
            title="Light"
          >
            <span class="material-symbols-outlined text-[16px]">light_mode</span>
          </button>
          <button
            onclick={() => themeStore.set('dark')}
            class="p-1.5 rounded-md transition-all {themeStore.current === 'dark' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
            title="Dark"
          >
            <span class="material-symbols-outlined text-[16px]">dark_mode</span>
          </button>
          <button
            onclick={() => themeStore.set('system')}
            class="p-1.5 rounded-md transition-all {themeStore.current === 'system' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
            title="System"
          >
            <span class="material-symbols-outlined text-[16px]">computer</span>
          </button>
        </div>
      </div>

      <!-- OpenCode Status -->
      <div class="flex items-center justify-between px-3 py-2">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          {#if openCodeLoading}
            <span class="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></span>
            <span>Checking OpenCode...</span>
          {:else if openCodeStatus.installed}
            <span class="w-2 h-2 rounded-full bg-chart-1"></span>
            <span>OpenCode <span class="text-foreground font-medium">v{openCodeStatus.version}</span></span>
          {:else}
            <span class="w-2 h-2 rounded-full bg-muted-foreground"></span>
            <span>OpenCode</span>
          {/if}
        </div>
        {#if !openCodeLoading && !openCodeStatus.installed}
          <a
            href="https://opencode.ai/docs/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-primary hover:underline"
          >
            Install &rarr;
          </a>
        {/if}
      </div>
      <div class="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span class="w-2 h-2 rounded-full bg-chart-1"></span>
        Server connected
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <div class="flex-1 flex flex-col min-w-0 bg-background">
    {@render children()}
  </div>
</div>
