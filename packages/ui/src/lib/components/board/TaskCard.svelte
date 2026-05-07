<script lang="ts">
  import type { Task, TaskStatus } from '../../types/index.js';

  let {
    task,
    status,
    onclick,
  }: {
    task: Task;
    status?: TaskStatus;
    onclick?: (task: Task) => void;
  } = $props();

  const isInProgress = $derived(status === 'in_progress');
  const isNeedsHuman = $derived(status === 'needs_human');
  const isReady = $derived(status === 'ready');

  // Get label badges from task labels
  const labelBadges = $derived(
    task.labels?.map(l => l.value) ?? []
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="bg-surface-container rounded-lg p-4 border transition-colors cursor-grab active:cursor-grabbing group relative overflow-hidden
    {isInProgress ? 'border-2 border-primary shadow-[0_4px_24px_rgba(167,139,250,0.1)] bg-surface-container-highest' :
     isNeedsHuman ? 'border-error/30 hover:border-error' :
     isReady ? 'border-outline-variant hover:border-primary-fixed-dim' :
     'border-outline-variant hover:border-secondary'}"
  onclick={() => onclick?.(task)}
>
  <!-- Left accent for ready/needs_human -->
  {#if isReady}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary-fixed-dim/30"></div>
  {/if}
  {#if isNeedsHuman}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-error/50"></div>
  {/if}

  <!-- Agent working indicator for in_progress -->
  {#if isInProgress && task.agentType}
    <div class="absolute -top-2 -right-2 bg-surface-container-highest border border-primary rounded-full p-1 shadow-lg flex items-center justify-center animate-pulse">
      <span class="material-symbols-outlined text-[14px] text-primary" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
    </div>
  {/if}

  <!-- Card Header -->
  <div class="flex justify-between items-start mb-2 {isReady || isNeedsHuman ? 'pl-1' : ''}">
    <span class="text-xs text-secondary font-mono tracking-tight">{task.id.slice(0, 8).toUpperCase()}</span>
    <div class="flex items-center gap-1">
      {#if isInProgress && task.agentType}
        <span class="flex items-center gap-1 text-[10px] text-secondary">
          <span class="material-symbols-outlined text-[12px] animate-spin">sync</span>
          Working
        </span>
      {:else if isNeedsHuman}
        <span class="material-symbols-outlined text-[14px] text-error">warning</span>
      {:else if isReady}
        <span class="flex items-center gap-1 text-[10px] text-tertiary border border-tertiary/30 bg-tertiary/10 px-1.5 py-0.5 rounded">
          <span class="material-symbols-outlined text-[12px]">bolt</span> Agent Task
        </span>
      {:else}
        <span class="material-symbols-outlined text-[16px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">drag_indicator</span>
      {/if}
    </div>
  </div>

  <!-- Title -->
  <h4 class="text-sm {isInProgress ? 'font-semibold' : 'font-medium'} text-on-surface mb-2 leading-snug {isReady || isNeedsHuman ? 'pl-1' : ''}">
    {task.title}
  </h4>

  <!-- Description (if exists) -->
  {#if task.description}
    <p class="text-xs text-secondary mb-3 line-clamp-2 {isReady || isNeedsHuman ? 'pl-1' : ''}">
      {task.description}
    </p>
  {/if}

  <!-- Footer: Labels + Meta -->
  <div class="flex items-center justify-between mt-auto pt-2 border-t border-outline-variant/50 {isReady || isNeedsHuman ? 'pl-1' : ''}">
    <div class="flex gap-2 flex-wrap">
      {#if labelBadges.length > 0}
        {#each labelBadges.slice(0, 3) as label}
          <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-bright text-secondary border border-outline-variant">
            {label}
          </span>
        {/each}
      {:else if task.agentType}
        <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-bright text-secondary border border-outline-variant">
          {task.agentType}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if task.agentType && (isInProgress || status === 'in_review')}
        <div class="w-5 h-5 rounded-full bg-primary-container border border-primary overflow-hidden flex items-center justify-center">
          <span class="material-symbols-outlined text-[12px] text-on-primary-container">smart_toy</span>
        </div>
      {/if}
      {#if task.branch}
        <span class="material-symbols-outlined text-[14px] text-secondary">merge</span>
      {/if}
    </div>
  </div>
</div>
