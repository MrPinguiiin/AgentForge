<script lang="ts">
  import type { Task, TaskStatus } from '../../types/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import { onMount } from 'svelte';

  let {
    task,
    status,
    onclick,
    selectable = false,
    selected = false,
    onselect,
  }: {
    task: Task;
    status?: TaskStatus;
    onclick?: (task: Task) => void;
    selectable?: boolean;
    selected?: boolean;
    onselect?: (task: Task) => void;
  } = $props();

  const isInProgress = $derived(status === 'in_progress' || status === 'coding');
  const isPlanningActive = $derived(status === 'planning');
  const isPlanningQueued = $derived(task.status === 'planning_queued');
  const isPlanned = $derived(task.status === 'planned');
  const isNeedsHuman = $derived(status === 'needs_human');
  const isReady = $derived(status === 'ready');
  const isFailed = $derived(status === 'failed');
  const isDone = $derived(status === 'done');
  const isPlanning = $derived(status === 'planning');
  const isInReview = $derived(status === 'in_review');
  const isQA = $derived(status === 'qa');
  const isActive = $derived(isInProgress || isPlanning || isInReview || isQA);
  const isBacklogCard = $derived(task.status === 'backlog' || task.status === 'planning_queued' || task.status === 'planned');

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

  // Pipeline stage progress (0-100)
  const pipelineProgress = $derived(() => {
    const s = task.status;
    if (s === 'backlog') return 0;
    if (s === 'planning_queued') return 10;
    if (s === 'planned') return 20;
    if (s === 'planning') return 25;
    if (s === 'in_progress' || s === 'coding') return 45;
    if (s === 'in_review') return 65;
    if (s === 'qa') return 80;
    if (s === 'done') return 100;
    if (s === 'failed') return 100;
    if (s === 'needs_human') return 50;
    return 0;
  });

  // Animated progress value
  let animatedProgress = $state(0);
  $effect(() => {
    const target = pipelineProgress();
    if (target > 0) {
      // Start low then animate to target
      animatedProgress = Math.max(animatedProgress, target - 15);
      const t = setTimeout(() => { animatedProgress = target; }, 300);
      return () => clearTimeout(t);
    } else {
      animatedProgress = 0;
    }
  });

  // All labels for backlog display
  const allLabels = $derived(
    task.labels?.map(l => ({ category: l.category, value: l.value })) ?? []
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="bg-card rounded-xl p-4 border transition-all duration-300 cursor-grab active:cursor-grabbing group relative overflow-hidden shadow-sm hover:shadow-md
    {isInProgress ? 'border-2 border-primary shadow-md' :
     isPlanning ? 'border-2 border-primary/60 shadow-md' :
     isInReview ? 'border-2 border-amber-500/40 shadow-md' :
     isQA ? 'border-2 border-violet-500/40 shadow-md' :
     isNeedsHuman ? 'border-destructive/30 hover:border-destructive' :
     isFailed ? 'border-destructive/20 hover:border-destructive/40' :
     isReady ? 'border-border hover:border-primary/50' :
     isDone ? 'border-chart-1/20' :
     'border-border hover:border-muted-foreground/30'}"
  onclick={(e: MouseEvent) => {
    // If clicking the checkbox area, handle selection instead
    if (selectable && (e.target as HTMLElement)?.closest('.select-checkbox')) {
      e.stopPropagation();
      onselect?.(task);
      return;
    }
    onclick?.(task);
  }}
>
  <!-- Selection checkbox -->
  {#if selectable}
    <div class="select-checkbox absolute top-3 left-3 z-10">
      <button
        class="w-5 h-5 rounded border-2 flex items-center justify-center transition-all
          {selected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/40 hover:border-primary/60'}"
        onclick={(e: MouseEvent) => { e.stopPropagation(); onselect?.(task); }}
      >
        {#if selected}
          <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">check</span>
        {/if}
      </button>
    </div>
  {/if}

  <!-- Left accent -->
  {#if isInProgress || isPlanning}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl animate-pulse"></div>
  {:else if isInReview}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-xl animate-pulse"></div>
  {:else if isQA}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-violet-500 rounded-l-xl animate-pulse"></div>
  {:else if isReady}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary/30 rounded-l-xl"></div>
  {:else if isNeedsHuman}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-destructive/50 rounded-l-xl"></div>
  {:else if isFailed}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-destructive/30 rounded-l-xl"></div>
  {:else if isDone}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-chart-1/30 rounded-l-xl"></div>
  {/if}

  <!-- Agent working indicator -->
  {#if isActive}
    <div class="absolute -top-2 -right-2 bg-card border {isInReview ? 'border-amber-500' : isQA ? 'border-violet-500' : 'border-primary'} rounded-full p-1 shadow-lg flex items-center justify-center animate-pulse">
      <span class="material-symbols-outlined text-[14px] {isInReview ? 'text-amber-500' : isQA ? 'text-violet-500' : 'text-primary'}" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
    </div>
  {/if}

  <!-- Execution order badge (in planning column) -->
  {#if isPlanningActive && task.executionOrder}
    <div class="absolute -top-2 -left-2 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg z-10">
      {task.executionOrder}
    </div>
  {/if}

  <!-- Card Header -->
  <div class="flex justify-between items-start mb-2 {selectable ? 'pl-7' : isReady || isNeedsHuman || isFailed || isDone ? 'pl-1' : ''}">
    <span class="text-xs text-muted-foreground font-mono tracking-tight">{task.id.slice(0, 8).toUpperCase()}</span>
    <div class="flex items-center gap-1">
      {#if isPlanningQueued}
        <span class="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <span class="material-symbols-outlined text-[12px]">psychology</span>
          Planning...
        </span>
      {:else if isPlanned}
        <span class="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
          <span class="material-symbols-outlined text-[12px]" style="font-variation-settings: 'FILL' 1;">check_circle</span>
          Plan Ready
        </span>
      {:else if isPlanning}
        <span class="flex items-center gap-1 text-[10px] text-primary">
          <span class="material-symbols-outlined text-[12px] animate-spin">psychology</span>
          Planning{task.executionOrder ? ` #${task.executionOrder}` : ''}
        </span>
      {:else if isInProgress}
        <span class="flex items-center gap-1 text-[10px] text-primary">
          <span class="material-symbols-outlined text-[12px] animate-spin">code</span>
          Coding...
        </span>
      {:else if isInReview}
        <span class="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <span class="material-symbols-outlined text-[12px] animate-spin">rate_review</span>
          Reviewing...
        </span>
      {:else if isQA}
        <span class="flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400">
          <span class="material-symbols-outlined text-[12px] animate-spin">bug_report</span>
          QA...
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

  <!-- Pipeline Progress Bar (shown for all active stages) -->
  {#if animatedProgress > 0 && animatedProgress < 100}
    <div class="mb-3 {selectable ? 'pl-7' : ''}">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[9px] text-muted-foreground uppercase tracking-wider">
          {task.status === 'planning_queued' ? 'Planning' :
           task.status === 'planned' ? 'Plan Ready' :
           task.status === 'planning' ? 'Planning' :
           task.status === 'in_progress' || task.status === 'coding' ? 'Coding' :
           task.status === 'in_review' ? 'Review' :
           task.status === 'qa' ? 'QA' :
           task.status === 'needs_human' ? 'Waiting' : ''}
        </span>
        <span class="text-[9px] text-muted-foreground">{animatedProgress}%</span>
      </div>
      <Progress value={animatedProgress} max={100} class="h-1.5" />
    </div>
  {/if}

  <!-- Footer: Labels + Meta -->
  <div class="flex items-center justify-between mt-auto pt-2 border-t border-border/50 {isReady || isNeedsHuman || isFailed || isDone ? 'pl-1' : ''}">
    <div class="flex gap-1.5 flex-wrap">
      {#if allLabels.length > 0}
        {#each allLabels as label}
          <span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium
            {label.category === 'risk' && label.value === 'high' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
             label.category === 'risk' && label.value === 'medium' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20' :
             label.category === 'risk' ? 'bg-chart-1/10 text-chart-1 border border-chart-1/20' :
             label.category === 'priority' && label.value === 'high' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' :
             label.category === 'priority' && label.value === 'critical' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
             label.category === 'priority' ? 'bg-secondary text-secondary-foreground' :
             label.category === 'type' ? 'bg-primary/10 text-primary border border-primary/20' :
             label.category === 'scope' && label.value === 'large' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20' :
             label.category === 'scope' ? 'bg-secondary text-secondary-foreground' :
             'bg-secondary text-secondary-foreground'}
          ">
            {label.value}
          </span>
        {/each}
      {:else if task.agentType}
        <span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground">
          {task.agentType}
        </span>
      {/if}
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
