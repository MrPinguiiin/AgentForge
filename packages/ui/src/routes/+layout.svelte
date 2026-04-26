<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  const navItems = [
    { href: '/', label: 'Board', icon: 'kanban' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

  let currentPath = $state('/');

  $effect(() => {
    currentPath = window.location.pathname;
  });
</script>

<div class="flex h-screen overflow-hidden bg-surface">
  <!-- Sidebar -->
  <aside class="w-56 shrink-0 border-r border-border bg-surface-light flex flex-col">
    <!-- Branding -->
    <div class="p-4 border-b border-border">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
        <div>
          <h1 class="text-sm font-bold text-text">AI Coder</h1>
          <p class="text-[10px] text-text-muted">v0.1.0</p>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-2 space-y-0.5">
      {#each navItems as item}
        <a
          href={item.href}
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
            {currentPath === item.href
              ? 'bg-primary/15 text-primary-light font-medium'
              : 'text-text-muted hover:text-text hover:bg-surface-lighter'}"
          onclick={() => (currentPath = item.href)}
        >
          {#if item.icon === 'kanban'}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
          {:else if item.icon === 'settings'}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          {/if}
          {item.label}
        </a>
      {/each}
    </nav>

    <!-- Footer -->
    <div class="p-3 border-t border-border">
      <div class="flex items-center gap-2 text-[10px] text-text-muted">
        <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
        Server connected
      </div>
    </div>
  </aside>

  <!-- Main content -->
  <main class="flex-1 overflow-hidden flex flex-col">
    {@render children()}
  </main>
</div>
