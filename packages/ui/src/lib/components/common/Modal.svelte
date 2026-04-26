<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title = '',
    description = '',
    children,
  }: {
    open: boolean;
    title?: string;
    description?: string;
    children: Snippet;
  } = $props();

  function handleClose() {
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/50 z-50"
    onclick={handleClose}
    aria-label="Close modal"
  ></button>

  <!-- Modal -->
  <div
    class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[90vw] max-h-[85vh] bg-surface border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    {#if title}
      <div class="p-4 border-b border-border shrink-0">
        <h2 class="text-lg font-semibold text-text">{title}</h2>
        {#if description}
          <p class="text-xs text-text-muted mt-1">{description}</p>
        {/if}
      </div>
    {/if}

    <div class="flex-1 overflow-y-auto">
      {@render children()}
    </div>
  </div>
{/if}
