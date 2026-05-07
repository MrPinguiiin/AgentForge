<script lang="ts">
  import {
    selectedTask,
    selectedTaskFiles,
    selectedTaskRuns,
    clearSelectedTask,
    removeTask,
    refreshSelectedTask,
    runPlan,
    runCode,
    runReview,
    runPublish,
    runFullPipeline,
    acceptReview,
    declineReview,
  } from '../../stores/tasks.js';
  import Badge from '../common/Badge.svelte';
  import DiffViewer from '../editor/DiffViewer.svelte';
  import * as api from '../../api/client.js';

  let task = $derived($selectedTask);
  let files = $derived($selectedTaskFiles);
  let runs = $derived($selectedTaskRuns);
  let actionLoading = $state<string | null>(null);
  let autoReview = $state(false);
  let showFiles = $state(false);
  let errorMessage = $state('');

  // Pipeline stages for progress tracking
  const PIPELINE_STAGES = [
    { id: 'backlog', label: 'Backlog', icon: 'inventory_2' },
    { id: 'ready', label: 'Ready', icon: 'bolt' },
    { id: 'in_progress', label: 'In Progress', icon: 'sync' },
    { id: 'in_review', label: 'Review', icon: 'rate_review' },
    { id: 'qa', label: 'QA', icon: 'bug_report' },
    { id: 'done', label: 'Done', icon: 'check_circle' },
  ];

  const STATUS_META: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
    backlog: { label: 'Backlog', color: 'text-secondary', bgColor: 'bg-secondary/10', icon: 'inventory_2' },
    todo: { label: 'To Do', color: 'text-secondary', bgColor: 'bg-secondary/10', icon: 'radio_button_unchecked' },
    ready: { label: 'Ready for Agent', color: 'text-primary-fixed-dim', bgColor: 'bg-primary/10', icon: 'bolt' },
    planning: { label: 'Planning', color: 'text-primary', bgColor: 'bg-primary/10', icon: 'psychology' },
    coding: { label: 'Coding', color: 'text-primary', bgColor: 'bg-primary/10', icon: 'code' },
    in_progress: { label: 'In Progress', color: 'text-primary', bgColor: 'bg-primary/10', icon: 'sync' },
    needs_human: { label: 'Needs Human', color: 'text-error', bgColor: 'bg-error/10', icon: 'warning' },
    in_review: { label: 'In Review', color: 'text-[#f59e0b]', bgColor: 'bg-[#f59e0b]/10', icon: 'rate_review' },
    qa: { label: 'QA Testing', color: 'text-tertiary', bgColor: 'bg-tertiary/10', icon: 'bug_report' },
    done: { label: 'Done', color: 'text-tertiary', bgColor: 'bg-tertiary/10', icon: 'check_circle' },
    cancelled: { label: 'Cancelled', color: 'text-secondary', bgColor: 'bg-secondary/10', icon: 'cancel' },
    failed: { label: 'Failed', color: 'text-error', bgColor: 'bg-error/10', icon: 'error' },
  };

  function getStageIndex(status: string): number {
    const idx = PIPELINE_STAGES.findIndex(s => s.id === status);
    // Map intermediate statuses to their closest stage
    if (status === 'planning' || status === 'coding') return 2; // in_progress
    if (status === 'needs_human') return 2;
    if (status === 'failed' || status === 'cancelled') return -1;
    return idx;
  }

  let currentStageIdx = $derived(task ? getStageIndex(task.status) : -1);
  let meta = $derived(task ? STATUS_META[task.status] ?? STATUS_META['backlog'] : STATUS_META['backlog']);

  async function handleAction(action: string) {
    if (!task) return;
    actionLoading = action;
    errorMessage = '';
    try {
      switch (action) {
        case 'plan': await runPlan(task.id); break;
        case 'code': await runCode(task.id); break;
        case 'review': await runReview(task.id); break;
        case 'publish': await runPublish(task.id); break;
        case 'pipeline': await runFullPipeline(task.id, autoReview); break;
        case 'accept': await acceptReview(task.id); break;
        case 'decline': await declineReview(task.id); break;
      }
      await refreshSelectedTask();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      actionLoading = null;
    }
  }

  async function handleApplyFile(fileId: string) {
    if (!task) return;
    await api.applyFile(task.id, fileId);
    await refreshSelectedTask();
  }

  async function handleRejectFile(fileId: string) {
    if (!task) return;
    await api.rejectFile(task.id, fileId);
    await refreshSelectedTask();
  }

  async function handleApplyAll() {
    if (!task) return;
    await api.applyAllFiles(task.id);
    await refreshSelectedTask();
  }

  async function handleDelete() {
    if (!task) return;
    if (confirm('Delete this task? This cannot be undone.')) {
      await removeTask(task.id);
    }
  }
</script>

{#if task}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
    onclick={clearSelectedTask}
    aria-label="Close panel"
  ></button>

  <!-- Slide-over Panel -->
  <div class="fixed top-0 right-0 h-full w-[560px] max-w-[90vw] bg-surface border-l border-outline-variant z-50 flex flex-col overflow-hidden shadow-2xl">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant shrink-0">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 px-2.5 py-1 rounded-lg {meta.bgColor}">
          <span class="material-symbols-outlined text-[16px] {meta.color}" style="font-variation-settings: 'FILL' 1;">{meta.icon}</span>
          <span class="text-xs font-semibold {meta.color}">{meta.label}</span>
        </div>
        <span class="text-xs text-secondary font-mono">{task.id.slice(0, 8).toUpperCase()}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:bg-error/10 hover:text-error transition-colors"
          onclick={handleDelete}
          title="Delete task"
        >
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:bg-surface-container-high hover:text-on-surface transition-colors"
          onclick={clearSelectedTask}
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto kanban-scroll">
      <!-- Task Info -->
      <div class="px-6 py-5 border-b border-outline-variant">
        <h2 class="text-lg font-bold text-on-surface mb-2 leading-snug">{task.title}</h2>
        {#if task.description}
          <p class="text-sm text-secondary leading-relaxed">{task.description}</p>
        {/if}
        {#if task.acceptanceCriteria}
          <div class="mt-3 p-3 rounded-lg bg-surface-container border border-outline-variant">
            <h4 class="text-[10px] font-semibold text-secondary uppercase tracking-wider mb-1.5">Acceptance Criteria</h4>
            <p class="text-xs text-on-surface-variant whitespace-pre-wrap">{task.acceptanceCriteria}</p>
          </div>
        {/if}
        <!-- Meta info -->
        <div class="flex items-center gap-4 mt-4">
          {#if task.agentType}
            <div class="flex items-center gap-1.5 text-xs text-secondary">
              <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
              <span class="capitalize">{task.agentType} agent</span>
            </div>
          {/if}
          {#if task.branch}
            <div class="flex items-center gap-1.5 text-xs text-secondary font-mono">
              <span class="material-symbols-outlined text-[14px]">merge</span>
              {task.branch}
            </div>
          {/if}
          {#if task.labels && task.labels.length > 0}
            <div class="flex items-center gap-1.5">
              {#each task.labels as label}
                <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-container-highest text-secondary border border-outline-variant">
                  {label.category}:{label.value}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Pipeline Progress -->
      <div class="px-6 py-5 border-b border-outline-variant">
        <h3 class="text-xs font-semibold text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-[14px]">timeline</span>
          Pipeline Progress
        </h3>

        <!-- Stage Progress -->
        <div class="flex items-center gap-1 mb-5">
          {#each PIPELINE_STAGES as stage, i}
            {@const isActive = i === currentStageIdx}
            {@const isCompleted = i < currentStageIdx}
            {@const isFailed = task.status === 'failed' || task.status === 'cancelled'}
            <div class="flex-1 flex flex-col items-center gap-1.5">
              <!-- Dot/Icon -->
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-[12px] transition-all
                {isActive ? 'bg-primary text-on-primary shadow-[0_0_12px_rgba(167,139,250,0.5)]' :
                 isCompleted ? 'bg-tertiary/20 text-tertiary' :
                 isFailed && i === currentStageIdx ? 'bg-error/20 text-error' :
                 'bg-surface-container-highest text-secondary'}">
                <span class="material-symbols-outlined text-[14px]"
                  style={isCompleted ? "font-variation-settings: 'FILL' 1;" : ''}
                >{isCompleted ? 'check' : stage.icon}</span>
              </div>
              <!-- Label -->
              <span class="text-[9px] font-medium tracking-tight
                {isActive ? 'text-primary' : isCompleted ? 'text-tertiary' : 'text-secondary'}">
                {stage.label}
              </span>
            </div>
            {#if i < PIPELINE_STAGES.length - 1}
              <!-- Connector line -->
              <div class="flex-1 h-0.5 rounded-full -mt-4
                {isCompleted ? 'bg-tertiary/40' : 'bg-outline-variant'}"></div>
            {/if}
          {/each}
        </div>

        <!-- Error Message -->
        {#if errorMessage}
          <div class="mb-4 px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-xs text-error flex items-start gap-2">
            <span class="material-symbols-outlined text-[14px] mt-0.5">error</span>
            <span>{errorMessage}</span>
          </div>
        {/if}

        <!-- Contextual Actions -->
        <div class="space-y-3">
          {#if task.status === 'backlog' || task.status === 'ready'}
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                <input type="checkbox" bind:checked={autoReview} class="rounded border-outline-variant bg-surface-container" />
                Auto Review
              </label>
              <button
                class="flex-1 bg-primary text-on-primary font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-primary-fixed-dim transition-colors disabled:opacity-50"
                disabled={actionLoading === 'pipeline'}
                onclick={() => handleAction('pipeline')}
              >
                {#if actionLoading === 'pipeline'}
                  <span class="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  Running Pipeline...
                {:else}
                  <span class="material-symbols-outlined text-[16px]">play_arrow</span>
                  Run Full Pipeline
                {/if}
              </button>
            </div>
          {:else if task.status === 'planning' || task.status === 'coding' || task.status === 'in_progress'}
            <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
              <span class="material-symbols-outlined text-primary text-[20px] animate-spin">sync</span>
              <div>
                <p class="text-sm font-medium text-on-surface">
                  {task.status === 'planning' ? 'AI is planning...' :
                   task.status === 'coding' ? 'AI is writing code...' :
                   'Agent is working...'}
                </p>
                <p class="text-xs text-secondary mt-0.5">
                  {task.agentType ? `${task.agentType} agent active` : 'Processing task'}
                </p>
              </div>
            </div>
          {:else if task.status === 'needs_human'}
            <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-error/5 border border-error/20">
              <span class="material-symbols-outlined text-error text-[20px]">warning</span>
              <div class="flex-1">
                <p class="text-sm font-medium text-on-surface">Human intervention required</p>
                <p class="text-xs text-secondary mt-0.5">Agent was unable to complete this task automatically</p>
              </div>
            </div>
          {:else if task.status === 'in_review'}
            <div class="flex items-center gap-2">
              <button
                class="flex-1 bg-tertiary text-on-tertiary font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-tertiary/80 transition-colors disabled:opacity-50"
                disabled={actionLoading === 'accept'}
                onclick={() => handleAction('accept')}
              >
                <span class="material-symbols-outlined text-[16px]">check</span>
                Accept
              </button>
              <button
                class="flex-1 bg-error/10 text-error font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-error/20 transition-colors border border-error/20 disabled:opacity-50"
                disabled={actionLoading === 'decline'}
                onclick={() => handleAction('decline')}
              >
                <span class="material-symbols-outlined text-[16px]">close</span>
                Decline
              </button>
              <button
                class="py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 text-secondary hover:bg-surface-container-high transition-colors border border-outline-variant text-sm disabled:opacity-50"
                disabled={actionLoading === 'review'}
                onclick={() => handleAction('review')}
              >
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
                AI Review
              </button>
            </div>
          {:else if task.status === 'done'}
            <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-tertiary/5 border border-tertiary/20">
              <span class="material-symbols-outlined text-tertiary text-[20px]" style="font-variation-settings: 'FILL' 1;">check_circle</span>
              <div>
                <p class="text-sm font-medium text-on-surface">Task completed</p>
                <p class="text-xs text-secondary mt-0.5">All changes have been applied</p>
              </div>
            </div>
          {:else if task.status === 'failed'}
            <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-error/5 border border-error/20">
              <span class="material-symbols-outlined text-error text-[20px]">error</span>
              <div class="flex-1">
                <p class="text-sm font-medium text-on-surface">Task failed</p>
                <p class="text-xs text-secondary mt-0.5">Retry count: {task.retryCount ?? 0}</p>
              </div>
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container-high text-on-surface hover:bg-surface-variant border border-outline-variant transition-colors"
                onclick={() => handleAction('pipeline')}
              >
                Retry
              </button>
            </div>
          {/if}

          <!-- Manual Steps (collapsible) -->
          {#if task.status !== 'done' && task.status !== 'cancelled'}
            <details class="group">
              <summary class="text-[11px] text-secondary cursor-pointer hover:text-on-surface flex items-center gap-1 select-none">
                <span class="material-symbols-outlined text-[12px] group-open:rotate-90 transition-transform">chevron_right</span>
                Manual Steps
              </summary>
              <div class="flex flex-wrap gap-2 mt-2 pl-4">
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-on-surface bg-surface-container hover:bg-surface-container-high border border-outline-variant transition-colors disabled:opacity-50"
                  disabled={actionLoading === 'plan'}
                  onclick={() => handleAction('plan')}
                >
                  {actionLoading === 'plan' ? 'Planning...' : 'Plan'}
                </button>
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-on-surface bg-surface-container hover:bg-surface-container-high border border-outline-variant transition-colors disabled:opacity-50"
                  disabled={actionLoading === 'code'}
                  onclick={() => handleAction('code')}
                >
                  {actionLoading === 'code' ? 'Coding...' : 'Code'}
                </button>
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-on-surface bg-surface-container hover:bg-surface-container-high border border-outline-variant transition-colors disabled:opacity-50"
                  disabled={actionLoading === 'review'}
                  onclick={() => handleAction('review')}
                >
                  {actionLoading === 'review' ? 'Reviewing...' : 'Review'}
                </button>
              </div>
            </details>
          {/if}
        </div>
      </div>

      <!-- File Changes -->
      {#if files.length > 0}
        <div class="px-6 py-5 border-b border-outline-variant">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-semibold text-secondary uppercase tracking-wider flex items-center gap-2">
              <span class="material-symbols-outlined text-[14px]">description</span>
              File Changes
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary">{files.length}</span>
            </h3>
            <div class="flex items-center gap-2">
              {#if files.some((f) => f.status === 'pending')}
                <button
                  class="px-3 py-1 rounded-lg text-xs font-medium bg-primary text-on-primary hover:bg-primary-fixed-dim transition-colors"
                  onclick={handleApplyAll}
                >
                  Apply All
                </button>
              {/if}
              <button
                class="text-secondary hover:text-on-surface transition-colors"
                onclick={() => (showFiles = !showFiles)}
              >
                <span class="material-symbols-outlined text-[18px]">{showFiles ? 'expand_less' : 'expand_more'}</span>
              </button>
            </div>
          </div>

          {#if showFiles}
            <div class="space-y-3">
              {#each files as file}
                <div class="rounded-lg border border-outline-variant overflow-hidden">
                  <div class="flex items-center justify-between px-3 py-2 bg-surface-container-high">
                    <div class="flex items-center gap-2">
                      <span class="material-symbols-outlined text-[14px] {file.action === 'create' ? 'text-tertiary' : file.action === 'delete' ? 'text-error' : 'text-primary'}">
                        {file.action === 'create' ? 'add_circle' : file.action === 'delete' ? 'remove_circle' : 'edit'}
                      </span>
                      <span class="text-xs font-mono text-on-surface-variant truncate max-w-[280px]">{file.filePath}</span>
                    </div>
                    {#if file.status === 'pending'}
                      <div class="flex items-center gap-1">
                        <button
                          class="px-2 py-0.5 rounded text-[10px] font-medium bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-colors"
                          onclick={() => handleApplyFile(file.id)}
                        >Apply</button>
                        <button
                          class="px-2 py-0.5 rounded text-[10px] font-medium text-secondary hover:text-error hover:bg-error/10 transition-colors"
                          onclick={() => handleRejectFile(file.id)}
                        >Reject</button>
                      </div>
                    {:else}
                      <span class="text-[10px] font-medium {file.status === 'applied' ? 'text-tertiary' : 'text-error'}">
                        {file.status}
                      </span>
                    {/if}
                  </div>
                  {#if file.diff}
                    <DiffViewer diff={file.diff} />
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <!-- Collapsed file list -->
            <div class="flex flex-wrap gap-1.5">
              {#each files.slice(0, 5) as file}
                <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container-highest text-secondary border border-outline-variant truncate max-w-[200px]">
                  {file.filePath.split('/').pop()}
                </span>
              {/each}
              {#if files.length > 5}
                <span class="text-[10px] text-secondary">+{files.length - 5} more</span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Agent Runs -->
      {#if runs.length > 0}
        <div class="px-6 py-5">
          <h3 class="text-xs font-semibold text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
            Agent Runs
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary">{runs.length}</span>
          </h3>
          <div class="space-y-2">
            {#each runs as run}
              <div class="p-3 rounded-lg border border-outline-variant bg-surface-container">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[14px] {run.status === 'completed' ? 'text-tertiary' : run.status === 'running' ? 'text-primary' : 'text-error'}"
                      style={run.status === 'completed' ? "font-variation-settings: 'FILL' 1;" : ''}
                    >{run.status === 'completed' ? 'check_circle' : run.status === 'running' ? 'sync' : 'error'}</span>
                    <span class="text-xs font-medium text-on-surface capitalize">{run.agentType}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded {run.status === 'completed' ? 'bg-tertiary/10 text-tertiary' : run.status === 'running' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}">
                      {run.status}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 text-[10px] text-secondary">
                    {#if run.durationMs}
                      <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                    {/if}
                    {#if run.tokensUsed}
                      <span>{run.tokensUsed.toLocaleString()} tok</span>
                    {/if}
                  </div>
                </div>
                {#if run.error}
                  <p class="text-xs text-error mt-1.5 px-2 py-1.5 rounded bg-error/5 border border-error/10">{run.error}</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
