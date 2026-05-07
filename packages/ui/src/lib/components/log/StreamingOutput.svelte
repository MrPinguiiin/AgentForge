<script lang="ts">
  import { wsStore } from '../../stores/ws.svelte.js';
  import { onMount } from 'svelte';

  let {
    taskId,
    agentType,
  }: {
    taskId: string;
    agentType?: string;
  } = $props();

  let output = $state('');
  let isStreaming = $state(false);
  let containerEl: HTMLDivElement;

  onMount(() => {
    const unsubStart = wsStore.on('agent:started', (payload: any) => {
      if (payload.taskId === taskId && (!agentType || payload.agentType === agentType)) {
        output = '';
        isStreaming = true;
      }
    });

    const unsubStream = wsStore.on('agent:streaming', (payload: any) => {
      if (payload.taskId === taskId && (!agentType || payload.agentType === agentType)) {
        output += payload.chunk;
        // Auto-scroll to bottom
        if (containerEl) {
          containerEl.scrollTop = containerEl.scrollHeight;
        }
      }
    });

    const unsubComplete = wsStore.on('agent:completed', (payload: any) => {
      if (payload.taskId === taskId && (!agentType || payload.agentType === agentType)) {
        isStreaming = false;
      }
    });

    const unsubError = wsStore.on('agent:error', (payload: any) => {
      if (payload.taskId === taskId && (!agentType || payload.agentType === agentType)) {
        output += `\n\nError: ${payload.error}`;
        isStreaming = false;
      }
    });

    return () => {
      unsubStart();
      unsubStream();
      unsubComplete();
      unsubError();
    };
  });
</script>

<div class="rounded-lg border border-border overflow-hidden">
  <div class="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border">
    <span class="text-xs text-muted-foreground">
      {agentType ? `${agentType} output` : 'Agent output'}
    </span>
    {#if isStreaming}
      <span class="flex items-center gap-1.5 text-[10px] text-primary">
        <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
        Streaming...
      </span>
    {/if}
  </div>

  <div
    bind:this={containerEl}
    class="overflow-auto max-h-64 p-3"
  >
    {#if output}
      <pre class="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words">{output}</pre>
    {:else}
      <div class="text-xs text-muted-foreground text-center py-4">
        {isStreaming ? 'Waiting for output...' : 'No output yet'}
      </div>
    {/if}
  </div>
</div>
