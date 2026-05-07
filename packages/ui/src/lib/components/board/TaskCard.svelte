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

  const isInProgress = $derived(status === 'in_progress' || status === 'planning' || status === 'coding');
  const isNeedsHuman = $derived(status === 'needs_human');
  const isReady = $derived(status === 'ready');
  const isFailed = $derived(status === 'failed');
  const isDone = $derived(status === 'done');
  const isPlanning = $derived(status === 'planning');

  // Get label badges from task labels
  const labelBadges = $derived(
    task.labels?.map(l => ({ category: l.category, value: l.value })) ?? []
  );

  // Extract risk label
  const riskLabel = $derived(
    labelBadges.find(l => l.category === 'risk')?.value ?? null
  );

  // Extract type label
  const typeLabel = $derived(
    labelBadges.find(l => l.category === 'type')?.value ?? null
  );

  // Status display text
  const statusText = $derived(() => {
    if (status === 'planning') return 'Planning...';
    if (status === 'coding') return 'Coding...';
    if (status === 'in_progress') return 'Working...';
    if (status === 'in_review') return 'In Review';
    if (status === 'qa') return 'QA';
    return null;
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="bg-card rounded-xl p-4 border transition-all duration-200 cursor-grab active:cursor-grabbing group relative overflow-hidden shadow-sm hover:shadow-md
    {isInProgress ? 'border-2 border-primary shadow-md' :
     isNeedsHuman ? 'border-destructive/30 hover:border-destructive' :
     isFailed ? 'border-destructive/20 hover:border-destructive/40' :
     isReady ? 'border-border hover:border-primary/50' :
     isDone ? 'border-chart-1/20' :
     'border-border hover:border-muted-foreground/30'}"
  onclick={() => onclick?.(task)}
>
  <!-- Left accent -->
  {#if isReady}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary/30 rounded-l-xl"></div>
  {:else if isNeedsHuman}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-destructive/50 rounded-l-xl"></div>
  {:else if isFailed}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-destructive/30 rounded-l-xl"></div>
  {:else if isDone}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-chart-1/30 rounded-l-xl"></div>
  {/if}

  <!-- Agent working indicator -->
  {#if isInProgress && task.agentType}
    <div class="absolute -top-2 -right-2 bg-card border border-primary rounded-full p-1 shadow-lg flex items-center justify-center animate-pulse">
      <span class="material-symbols-outlined text-[14px] text-primary" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
    </div>
  {/if}

  <!-- Card Header -->
  <div class="flex justify-between items-start mb-2 {isReady || isNeedsHuman || isFailed || isDone ? 'pl-1' : ''}">
    <span class="text-xs text-muted-foreground font-mono tracking-tight">{task.id.slice(0, 8).toUpperCase()}</span>
    <div class="flex items-center gap-1">
      {#if isPlanning}
        <span class="flex items-center gap-1 text-[10px] text-primary">
          <span class="material-symbols-outlined text-[12px] animate-spin">psychology</span>
          Planning
        </span>
      {:else if isInProgress && task.agentType}
        <span class="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span class="material-symbols-outlined text-[12px] animate-spin">sync</span>
          {statusText()}
        </span>
      {:else if isNeedsHuman}
        <span class="material-symbols-outlined text-[14px] text-destructive">warning</span>
      {:else if isReady}
        <span class="flex items-center gap-1 text-[10px] text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5 rounded-md">
          <span class="material-symbols-outlined text-[12px]">bolt</span> Ready
        </span>
      {:else if isDone}
        <span class="material-symbols-outlined text-[14px] text-chart-1" style="font-variation-settings: 'FILL' 1;">check_circle</span>
      {:else if isFailed}
        <span class="material-symbols-outlined text-[14px] text-destructive">error</span>
      {:else}
        <span class="material-symbols-outlined text-[16px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">drag_indicator</span>
      {/if}
    </div>
  </div>

  <!-- Title -->
  <h4 class="text-sm {isInProgress ? 'font-semibold' : 'font-medium'} text-card-foreground mb-2 leading-snug {isReady || isNeedsHuman || isFailed || isDone ? 'pl-1' : ''}">
    {task.title}
  </h4>

  <!-- Description (if exists) -->
  {#if task.description}
    <p class="text-xs text-muted-foreground mb-3 line-clamp-2 {isReady || isNeedsHuman || isFailed || isDone ? 'pl-1' : ''}">
      {task.description}
    </p>
  {/if}

  <!-- Footer: Labels + Meta -->
  <div class="flex items-center justify-between mt-auto pt-2 border-t border-border/50 {isReady || isNeedsHuman || isFailed || isDone ? 'pl-1' : ''}">
    <div class="flex gap-1.5 flex-wrap">
      <!-- Risk badge -->
      {#if riskLabel}
        <span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium
          {riskLabel === 'high' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
           riskLabel === 'medium' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20' :
           'bg-chart-1/10 text-chart-1 border border-chart-1/20'}
        ">
          {riskLabel}
        </span>
      {/if}

      <!-- Type badge -->
      {#if typeLabel}
        <span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground">
          {typeLabel}
        </span>
      {:else if task.agentType}
        <span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground">
          {task.agentType}
        </span>
      {/if}

      <!-- Extra labels (max 1 more) -->
      {#each labelBadges.filter(l => l.category !== 'risk' && l.category !== 'type').slice(0, 1) as label}
        <span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground">
          {label.value}
        </span>
      {/each}
    </div>

    <div class="flex items-center gap-2">
      {#if task.agentType && (isInProgress || status === 'in_review')}
        <div class="w-5 h-5 rounded-full bg-primary/10 border border-primary/30 overflow-hidden flex items-center justify-center">
          <span class="material-symbols-outlined text-[12px] text-primary">smart_toy</span>
        </div>
      {/if}
      {#if task.branch}
        <span class="material-symbols-outlined text-[14px] text-muted-foreground">merge</span>
      {/if}
    </div>
  </div>
</div>
