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
  import Button from '../common/Button.svelte';
  import Badge from '../common/Badge.svelte';
  import DiffViewer from '../editor/DiffViewer.svelte';
  import * as api from '../../api/client.js';

  let task = $derived($selectedTask);
  let files = $derived($selectedTaskFiles);
  let runs = $derived($selectedTaskRuns);
  let actionLoading = $state<string | null>(null);

  let autoReview = $state(false);

  const statusBadge: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
    todo: 'default',
    planning: 'info',
    coding: 'warning',
    in_review: 'warning',
    done: 'success',
  };

  const statusLabels: Record<string, string> = {
    todo: 'To Do',
    planning: 'Planning',
    coding: 'Coding',
    in_review: 'In Review',
    done: 'Done',
  };

  async function handleAction(action: string) {
    if (!task) return;
    actionLoading = action;
    try {
      switch (action) {
        case 'plan':
          await runPlan(task.id);
          break;
        case 'code':
          await runCode(task.id);
          break;
        case 'review':
          await runReview(task.id);
          break;
        case 'publish':
          await runPublish(task.id);
          break;
        case 'pipeline':
          await runFullPipeline(task.id, autoReview);
          break;
        case 'accept':
          await acceptReview(task.id);
          break;
        case 'decline':
          await declineReview(task.id);
          break;
      }
      await refreshSelectedTask();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
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
    if (confirm('Delete this task?')) {
      await removeTask(task.id);
    }
  }
</script>

{#if task}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/30 z-40"
    onclick={clearSelectedTask}
    aria-label="Close panel"
  ></button>

  <!-- Slide-over Panel -->
  <div class="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] bg-surface-light border-l border-border z-50 flex flex-col overflow-hidden shadow-2xl">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-border shrink-0">
      <div class="flex items-center gap-2">
        <Badge variant={statusBadge[task.status] ?? 'default'}>
          {statusLabels[task.status] ?? task.status}
        </Badge>
        <span class="text-[10px] text-text-muted">{task.id.slice(0, 8)}</span>
      </div>
      <div class="flex items-center gap-1">
        <Button variant="danger" size="sm" onclick={handleDelete}>Delete</Button>
        <Button variant="ghost" size="sm" onclick={clearSelectedTask}>
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Task Info -->
      <div class="p-4 border-b border-border">
        <h2 class="text-lg font-semibold text-text mb-1">{task.title}</h2>
        {#if task.description}
          <p class="text-sm text-text-muted">{task.description}</p>
        {/if}
      </div>

      <!-- Pipeline Progress -->
      <div class="p-4 border-b border-border">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Pipeline</h3>

        <!-- Progress bar -->
        <div class="flex items-center gap-1 mb-4">
          {#each ['todo', 'planning', 'coding', 'in_review', 'done'] as stage, i}
            {@const stages = ['todo', 'planning', 'coding', 'in_review', 'done']}
            {@const currentIdx = stages.indexOf(task.status)}
            <div class="flex-1 h-1.5 rounded-full {i <= currentIdx ? 'bg-primary' : 'bg-surface-lighter'}"></div>
          {/each}
        </div>

        <!-- Contextual actions based on status -->
        <div class="flex flex-wrap gap-2">
          {#if task.status === 'todo'}
            <!-- Auto-review toggle -->
            <label class="flex items-center gap-2 text-xs text-text-muted mr-2 cursor-pointer">
              <input type="checkbox" bind:checked={autoReview} class="rounded" />
              Auto Review
            </label>
            <Button
              variant="primary"
              size="sm"
              loading={actionLoading === 'pipeline'}
              onclick={() => handleAction('pipeline')}
            >Run Full Pipeline</Button>
          {:else if task.status === 'planning'}
            <span class="text-xs text-info flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-info animate-pulse"></span>
              AI is planning...
            </span>
          {:else if task.status === 'coding'}
            <Button
              variant="secondary"
              size="sm"
              loading={actionLoading === 'code'}
              onclick={() => handleAction('code')}
            >Run Coder</Button>
            <span class="text-xs text-text-muted">AI is writing code</span>
          {:else if task.status === 'in_review'}
            <Button
              variant="primary"
              size="sm"
              loading={actionLoading === 'accept'}
              onclick={() => handleAction('accept')}
            >Accept</Button>
            <Button
              variant="danger"
              size="sm"
              loading={actionLoading === 'decline'}
              onclick={() => handleAction('decline')}
            >Decline</Button>
            <Button
              variant="secondary"
              size="sm"
              loading={actionLoading === 'review'}
              onclick={() => handleAction('review')}
            >AI Review</Button>
          {:else if task.status === 'done'}
            <span class="text-xs text-success flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-success"></span>
              Completed
            </span>
          {/if}
        </div>

        <!-- Manual step buttons (collapsed) -->
        {#if task.status !== 'done'}
          <details class="mt-3">
            <summary class="text-[10px] text-text-muted cursor-pointer hover:text-text">Manual Steps</summary>
            <div class="flex flex-wrap gap-2 mt-2">
              <Button variant="ghost" size="sm" loading={actionLoading === 'plan'} onclick={() => handleAction('plan')}>Plan</Button>
              <Button variant="ghost" size="sm" loading={actionLoading === 'code'} onclick={() => handleAction('code')}>Code</Button>
              <Button variant="ghost" size="sm" loading={actionLoading === 'review'} onclick={() => handleAction('review')}>Review</Button>
            </div>
          </details>
        {/if}
      </div>

      <!-- File Changes -->
      {#if files.length > 0}
        <div class="p-4 border-b border-border">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
              File Changes ({files.length})
            </h3>
            {#if files.some((f) => f.status === 'pending')}
              <Button variant="primary" size="sm" onclick={handleApplyAll}>Apply All</Button>
            {/if}
          </div>
          <div class="space-y-3">
            {#each files as file}
              <div class="rounded-lg border border-border overflow-hidden">
                <div class="flex items-center justify-between px-3 py-2 bg-surface-lighter">
                  <div class="flex items-center gap-2">
                    <Badge variant={file.action === 'create' ? 'success' : file.action === 'delete' ? 'danger' : 'info'}>
                      {file.action}
                    </Badge>
                    <span class="text-xs font-mono text-text-muted">{file.filePath}</span>
                  </div>
                  {#if file.status === 'pending'}
                    <div class="flex items-center gap-1">
                      <Button variant="primary" size="sm" onclick={() => handleApplyFile(file.id)}>Apply</Button>
                      <Button variant="ghost" size="sm" onclick={() => handleRejectFile(file.id)}>Reject</Button>
                    </div>
                  {:else}
                    <Badge variant={file.status === 'applied' ? 'success' : 'danger'}>
                      {file.status}
                    </Badge>
                  {/if}
                </div>
                {#if file.diff}
                  <DiffViewer diff={file.diff} />
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Agent Runs -->
      {#if runs.length > 0}
        <div class="p-4">
          <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Agent Runs ({runs.length})
          </h3>
          <div class="space-y-2">
            {#each runs as run}
              <div class="p-3 rounded-lg border border-border bg-surface">
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <Badge variant={run.status === 'completed' ? 'success' : run.status === 'running' ? 'info' : 'danger'}>
                      {run.agentType}
                    </Badge>
                    <Badge variant={run.status === 'completed' ? 'success' : run.status === 'running' ? 'info' : 'danger'}>
                      {run.status}
                    </Badge>
                  </div>
                  {#if run.durationMs}
                    <span class="text-[10px] text-text-muted">{(run.durationMs / 1000).toFixed(1)}s</span>
                  {/if}
                </div>
                {#if run.tokensUsed}
                  <span class="text-[10px] text-text-muted">{run.tokensUsed.toLocaleString()} tokens</span>
                {/if}
                {#if run.error}
                  <p class="text-xs text-danger mt-1">{run.error}</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
