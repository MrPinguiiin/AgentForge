<script lang="ts">
  import { wsStore } from '../../stores/ws.svelte.js';
  import { onMount } from 'svelte';

  interface LogEntry {
    id: number;
    type: string;
    payload: unknown;
    timestamp: number;
  }

  let collapsed = $state(true);
  let entries = $state<LogEntry[]>([]);
  let nextId = 0;
  let containerEl: HTMLDivElement;

  onMount(() => {
    const unsub = wsStore.on('*', (msg: { type: string; payload: unknown }) => {
      entries = [
        ...entries.slice(-199),
        { id: nextId++, type: msg.type, payload: msg.payload, timestamp: Date.now() },
      ];

      // Auto-scroll
      if (containerEl && !collapsed) {
        requestAnimationFrame(() => {
          containerEl.scrollTop = containerEl.scrollHeight;
        });
      }
    });

    return unsub;
  });

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  }

  function getTypeColor(type: string): string {
    if (type.startsWith('agent:')) return 'text-primary';
    if (type.startsWith('task:')) return 'text-chart-1';
    if (type.startsWith('file:')) return 'text-yellow-400';
    if (type.startsWith('git:')) return 'text-green-400';
    if (type.includes('error')) return 'text-destructive';
    return 'text-muted-foreground';
  }
</script>

<div class="border-t border-border bg-card">
  <!-- Toggle Header -->
  <button
    class="w-full flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors"
    onclick={() => (collapsed = !collapsed)}
  >
    <div class="flex items-center gap-2">
      <svg
        class="w-3.5 h-3.5 text-muted-foreground transition-transform {collapsed ? '' : 'rotate-180'}"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
      </svg>
      <span class="text-xs font-medium text-muted-foreground">Activity Log</span>
    </div>
    <div class="flex items-center gap-2">
      {#if entries.length > 0}
        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
          {entries.length}
        </span>
      {/if}
      {#if wsStore.connected}
        <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      {:else}
        <span class="w-1.5 h-1.5 rounded-full bg-destructive"></span>
      {/if}
    </div>
  </button>

  <!-- Log Content -->
  {#if !collapsed}
    <div
      bind:this={containerEl}
      class="h-48 overflow-y-auto border-t border-border"
    >
      {#if entries.length === 0}
        <div class="flex items-center justify-center h-full text-xs text-muted-foreground">
          No activity yet. Events will appear here in real-time.
        </div>
      {:else}
        <div class="p-2 space-y-0.5">
          {#each entries as entry (entry.id)}
            <div class="flex items-start gap-2 px-2 py-1 rounded hover:bg-accent text-[11px] font-mono">
              <span class="text-muted-foreground/50 shrink-0">{formatTime(entry.timestamp)}</span>
              <span class="shrink-0 {getTypeColor(entry.type)}">{entry.type}</span>
              <span class="text-muted-foreground truncate">
                {JSON.stringify(entry.payload)}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
