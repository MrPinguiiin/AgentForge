<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
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
  import DiffViewer from '../editor/DiffViewer.svelte';
  import * as api from '../../api/client.js';

  let task = $derived($selectedTask);
  let files = $derived($selectedTaskFiles);
  let runs = $derived($selectedTaskRuns);
  let actionLoading = $state<string | null>(null);
  let autoReview = $state(false);
  let showFiles = $state(false);
  let errorMessage = $state('');
  let showDeleteConfirm = $state(false);

  let isOpen = $derived(!!task);

  // Pipeline stages with display info
  const PIPELINE_STAGES: { id: string; label: string; icon: string }[] = [
    { id: 'backlog', label: 'Backlog', icon: 'inventory_2' },
    { id: 'ready', label: 'Ready', icon: 'bolt' },
    { id: 'in_progress', label: 'In Progress', icon: 'sync' },
    { id: 'in_review', label: 'Review', icon: 'rate_review' },
    { id: 'qa', label: 'QA', icon: 'bug_report' },
    { id: 'done', label: 'Done', icon: 'check_circle' },
  ];

  const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: string }> = {
    backlog: { label: 'Backlog', variant: 'secondary', icon: 'inventory_2' },
    todo: { label: 'To Do', variant: 'secondary', icon: 'radio_button_unchecked' },
    ready: { label: 'Ready', variant: 'default', icon: 'bolt' },
    planning: { label: 'Planning', variant: 'default', icon: 'psychology' },
    coding: { label: 'Coding', variant: 'default', icon: 'code' },
    in_progress: { label: 'In Progress', variant: 'default', icon: 'sync' },
    needs_human: { label: 'Needs Human', variant: 'destructive', icon: 'warning' },
    in_review: { label: 'Review', variant: 'outline', icon: 'rate_review' },
    qa: { label: 'QA', variant: 'outline', icon: 'bug_report' },
    done: { label: 'Done', variant: 'secondary', icon: 'check_circle' },
    cancelled: { label: 'Cancelled', variant: 'secondary', icon: 'cancel' },
    failed: { label: 'Failed', variant: 'destructive', icon: 'error' },
  };

  // Map sub-statuses to their parent pipeline stage
  function getStageIndex(status: string): number {
    if (status === 'planning' || status === 'coding') return 2; // maps to in_progress
    if (status === 'needs_human') return 2;
    const idx = PIPELINE_STAGES.findIndex(s => s.id === status);
    return idx >= 0 ? idx : -1;
  }

  function getStageState(stageIdx: number, currentStatus: string): 'completed' | 'active' | 'pending' | 'failed' {
    if (currentStatus === 'failed' || currentStatus === 'cancelled') {
      const failIdx = getStageIndex(currentStatus);
      if (failIdx < 0) return 'pending';
      if (stageIdx < failIdx) return 'completed';
      if (stageIdx === failIdx) return 'failed';
      return 'pending';
    }
    const currentIdx = getStageIndex(currentStatus);
    if (currentIdx < 0) return 'pending';
    if (stageIdx < currentIdx) return 'completed';
    if (stageIdx === currentIdx) return 'active';
    return 'pending';
  }

  function getProgressPercent(status: string): number {
    const stageIds = PIPELINE_STAGES.map(s => s.id);
    const idx = stageIds.indexOf(status);
    if (status === 'planning' || status === 'coding') return 40;
    if (status === 'needs_human') return 40;
    if (status === 'failed' || status === 'cancelled') return 0;
    if (idx < 0) return 0;
    return Math.round((idx / (stageIds.length - 1)) * 100);
  }

  let meta = $derived(task ? STATUS_META[task.status] ?? STATUS_META['backlog'] : STATUS_META['backlog']);
  let progressPercent = $derived(task ? getProgressPercent(task.status) : 0);

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
    await removeTask(task.id);
    showDeleteConfirm = false;
  }

  function handleOpenChange(open: boolean) {
    if (!open) clearSelectedTask();
  }
</script>

<!-- Task Detail Sheet -->
<Sheet.Root open={isOpen} onOpenChange={handleOpenChange}>
  <Sheet.Content side="right" class="w-[560px] max-w-[90vw] p-0 flex flex-col">
    {#if task}
      <!-- Header -->
      <Sheet.Header class="px-6 py-4 border-b border-border space-y-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Badge variant={meta.variant}>
              <span class="material-symbols-outlined text-[12px] mr-1" style="font-variation-settings: 'FILL' 1;">{meta.icon}</span>
              {meta.label}
            </Badge>
            <span class="text-xs text-muted-foreground font-mono">{task.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <Button variant="ghost" size="icon-sm" onclick={() => (showDeleteConfirm = true)}>
            <span class="material-symbols-outlined text-[16px] text-destructive">delete</span>
          </Button>
        </div>
        <Sheet.Title class="text-lg font-bold text-foreground mt-3">{task.title}</Sheet.Title>
        {#if task.description}
          <Sheet.Description class="text-sm text-muted-foreground">{task.description}</Sheet.Description>
        {/if}
      </Sheet.Header>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Meta Info -->
        {#if task.acceptanceCriteria || task.agentType || task.branch || (task.labels && task.labels.length > 0)}
          <div class="px-6 py-4 border-b border-border space-y-3">
            {#if task.acceptanceCriteria}
              <div class="p-3 rounded-lg bg-muted border border-border">
                <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Acceptance Criteria</p>
                <p class="text-xs text-foreground whitespace-pre-wrap">{task.acceptanceCriteria}</p>
              </div>
            {/if}
            <div class="flex items-center gap-3 flex-wrap">
              {#if task.agentType}
                <Badge variant="outline">
                  <span class="material-symbols-outlined text-[12px] mr-1" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
                  {task.agentType}
                </Badge>
              {/if}
              {#if task.branch}
                <Badge variant="outline" class="font-mono text-[10px]">
                  <span class="material-symbols-outlined text-[12px] mr-1">merge</span>
                  {task.branch}
                </Badge>
              {/if}
              {#if task.labels}
                {#each task.labels as label}
                  <Badge variant="secondary">{label.category}:{label.value}</Badge>
                {/each}
              {/if}
            </div>
          </div>
        {/if}

        <!-- Pipeline Progress -->
        <div class="px-6 py-4 border-b border-border">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span class="material-symbols-outlined text-[14px]">timeline</span>
              Pipeline
            </h3>
            <span class="text-[10px] text-muted-foreground font-medium">{progressPercent}%</span>
          </div>

          <!-- Visual Stage Stepper -->
          <div class="flex items-start gap-0 mb-5">
            {#each PIPELINE_STAGES as stage, i}
              {@const state = getStageState(i, task.status)}
              <!-- Stage node -->
              <div class="flex flex-col items-center flex-1 relative">
                <!-- Connector line (before node, except first) -->
                {#if i > 0}
                  <div class="absolute top-3.5 right-1/2 w-full h-0.5 -z-10
                    {state === 'completed' || state === 'active' ? 'bg-primary' :
                     state === 'failed' ? 'bg-destructive' :
                     'bg-border'}
                  "></div>
                {/if}
                <!-- Connector line (after node, except last) -->
                {#if i < PIPELINE_STAGES.length - 1}
                  {@const nextState = getStageState(i + 1, task.status)}
                  <div class="absolute top-3.5 left-1/2 w-full h-0.5 -z-10
                    {nextState === 'completed' || nextState === 'active' ? 'bg-primary' :
                     nextState === 'failed' ? 'bg-destructive' :
                     'bg-border'}
                  "></div>
                {/if}

                <!-- Circle icon -->
                <div class="w-7 h-7 rounded-full flex items-center justify-center z-10 transition-all duration-300
                  {state === 'completed' ? 'bg-primary text-primary-foreground' :
                   state === 'active' ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                   state === 'failed' ? 'bg-destructive text-destructive-foreground ring-4 ring-destructive/20' :
                   'bg-secondary text-muted-foreground'}
                ">
                  {#if state === 'completed'}
                    <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">check</span>
                  {:else if state === 'active'}
                    <span class="material-symbols-outlined text-[14px] {task.status === 'in_progress' || task.status === 'planning' || task.status === 'coding' ? 'animate-spin' : ''}" style="font-variation-settings: 'FILL' 1;">{stage.icon}</span>
                  {:else if state === 'failed'}
                    <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">close</span>
                  {:else}
                    <span class="material-symbols-outlined text-[12px]">{stage.icon}</span>
                  {/if}
                </div>

                <!-- Label -->
                <span class="text-[10px] mt-1.5 text-center leading-tight
                  {state === 'completed' ? 'text-primary font-medium' :
                   state === 'active' ? 'text-primary font-semibold' :
                   state === 'failed' ? 'text-destructive font-medium' :
                   'text-muted-foreground'}
                ">{stage.label}</span>
              </div>
            {/each}
          </div>

          <!-- Sub-status indicator for planning/coding/needs_human -->
          {#if task.status === 'planning' || task.status === 'coding' || task.status === 'needs_human'}
            <div class="mb-4 px-3 py-2 rounded-lg bg-muted border border-border flex items-center gap-2">
              <span class="material-symbols-outlined text-[14px] text-primary {task.status !== 'needs_human' ? 'animate-spin' : ''}">{STATUS_META[task.status]?.icon ?? 'info'}</span>
              <span class="text-xs text-foreground font-medium">{STATUS_META[task.status]?.label}</span>
              <span class="text-[10px] text-muted-foreground">- sub-stage of In Progress</span>
            </div>
          {/if}

          <!-- Progress bar -->
          <Progress value={progressPercent} class="h-1.5 mb-4" />

          <!-- Error -->
          {#if errorMessage}
            <div class="mb-4 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
              <span class="material-symbols-outlined text-[14px] mt-0.5">error</span>
              <span>{errorMessage}</span>
            </div>
          {/if}

          <!-- Actions -->
          <div class="space-y-3">
            {#if task.status === 'backlog' || task.status === 'ready'}
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" bind:checked={autoReview} class="rounded border-input" />
                  Auto Review
                </label>
                <Button
                  class="flex-1"
                  disabled={actionLoading === 'pipeline'}
                  onclick={() => handleAction('pipeline')}
                >
                  {#if actionLoading === 'pipeline'}
                    <span class="material-symbols-outlined text-[16px] animate-spin mr-1">sync</span>
                    Running...
                  {:else}
                    <span class="material-symbols-outlined text-[16px] mr-1">play_arrow</span>
                    Run Full Pipeline
                  {/if}
                </Button>
              </div>
            {:else if task.status === 'planning' || task.status === 'coding' || task.status === 'in_progress'}
              <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
                <span class="material-symbols-outlined text-primary text-[20px] animate-spin">sync</span>
                <div>
                  <p class="text-sm font-medium text-foreground">Agent is working...</p>
                  <p class="text-xs text-muted-foreground">{task.agentType ?? 'AI'} agent active</p>
                </div>
              </div>
            {:else if task.status === 'needs_human'}
              <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <span class="material-symbols-outlined text-destructive text-[20px]">warning</span>
                <div>
                  <p class="text-sm font-medium text-foreground">Human intervention required</p>
                  <p class="text-xs text-muted-foreground">Agent could not complete automatically</p>
                </div>
              </div>
            {:else if task.status === 'in_review'}
              <div class="flex items-center gap-2">
                <Button class="flex-1" variant="default" disabled={actionLoading === 'accept'} onclick={() => handleAction('accept')}>
                  <span class="material-symbols-outlined text-[16px] mr-1">check</span>
                  Accept
                </Button>
                <Button class="flex-1" variant="destructive" disabled={actionLoading === 'decline'} onclick={() => handleAction('decline')}>
                  <span class="material-symbols-outlined text-[16px] mr-1">close</span>
                  Decline
                </Button>
                <Button variant="outline" disabled={actionLoading === 'review'} onclick={() => handleAction('review')}>
                  <span class="material-symbols-outlined text-[14px] mr-1" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
                  AI Review
                </Button>
              </div>
            {:else if task.status === 'done'}
              <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-chart-1/5 border border-chart-1/20">
                <span class="material-symbols-outlined text-chart-1 text-[20px]" style="font-variation-settings: 'FILL' 1;">check_circle</span>
                <p class="text-sm font-medium text-foreground">Task completed</p>
              </div>
            {:else if task.status === 'failed'}
              <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <span class="material-symbols-outlined text-destructive text-[20px]">error</span>
                <div class="flex-1">
                  <p class="text-sm font-medium text-foreground">Task failed</p>
                  <p class="text-xs text-muted-foreground">Retries: {task.retryCount ?? 0}</p>
                </div>
                <Button variant="outline" size="sm" onclick={() => handleAction('pipeline')}>Retry</Button>
              </div>
            {/if}

            <!-- Manual Steps -->
            {#if task.status !== 'done' && task.status !== 'cancelled'}
              <details class="group">
                <summary class="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1 select-none">
                  <span class="material-symbols-outlined text-[12px] group-open:rotate-90 transition-transform">chevron_right</span>
                  Manual Steps
                </summary>
                <div class="flex flex-wrap gap-2 mt-2 pl-4">
                  <Button variant="outline" size="sm" disabled={actionLoading === 'plan'} onclick={() => handleAction('plan')}>Plan</Button>
                  <Button variant="outline" size="sm" disabled={actionLoading === 'code'} onclick={() => handleAction('code')}>Code</Button>
                  <Button variant="outline" size="sm" disabled={actionLoading === 'review'} onclick={() => handleAction('review')}>Review</Button>
                </div>
              </details>
            {/if}
          </div>
        </div>

        <!-- File Changes -->
        {#if files.length > 0}
          <div class="px-6 py-4 border-b border-border">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span class="material-symbols-outlined text-[14px]">description</span>
                Files ({files.length})
              </h3>
              <div class="flex gap-2">
                {#if files.some((f) => f.status === 'pending')}
                  <Button variant="default" size="sm" onclick={handleApplyAll}>Apply All</Button>
                {/if}
                <Button variant="ghost" size="icon-sm" onclick={() => (showFiles = !showFiles)}>
                  <span class="material-symbols-outlined text-[16px]">{showFiles ? 'expand_less' : 'expand_more'}</span>
                </Button>
              </div>
            </div>

            {#if showFiles}
              <div class="space-y-2">
                {#each files as file}
                  <div class="rounded-lg border border-border overflow-hidden">
                    <div class="flex items-center justify-between px-3 py-2 bg-muted">
                      <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-[14px] {file.action === 'create' ? 'text-chart-1' : file.action === 'delete' ? 'text-destructive' : 'text-primary'}">
                          {file.action === 'create' ? 'add_circle' : file.action === 'delete' ? 'remove_circle' : 'edit'}
                        </span>
                        <span class="text-xs font-mono text-muted-foreground truncate max-w-[280px]">{file.filePath}</span>
                      </div>
                      {#if file.status === 'pending'}
                        <div class="flex gap-1">
                          <Button variant="default" size="xs" onclick={() => handleApplyFile(file.id)}>Apply</Button>
                          <Button variant="ghost" size="xs" onclick={() => handleRejectFile(file.id)}>Reject</Button>
                        </div>
                      {:else}
                        <Badge variant={file.status === 'applied' ? 'default' : 'destructive'}>{file.status}</Badge>
                      {/if}
                    </div>
                    {#if file.diff}
                      <DiffViewer diff={file.diff} />
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="flex flex-wrap gap-1.5">
                {#each files.slice(0, 5) as file}
                  <Badge variant="outline" class="font-mono text-[10px]">{file.filePath.split('/').pop()}</Badge>
                {/each}
                {#if files.length > 5}
                  <span class="text-[10px] text-muted-foreground">+{files.length - 5} more</span>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Agent Runs -->
        {#if runs.length > 0}
          <div class="px-6 py-4">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
              Agent Runs ({runs.length})
            </h3>
            <div class="space-y-2">
              {#each runs as run}
                <div class="p-3 rounded-lg border border-border bg-card">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="material-symbols-outlined text-[14px] {run.status === 'completed' ? 'text-chart-1' : run.status === 'running' ? 'text-primary' : 'text-destructive'}"
                        style={run.status === 'completed' ? "font-variation-settings: 'FILL' 1;" : ''}
                      >{run.status === 'completed' ? 'check_circle' : run.status === 'running' ? 'sync' : 'error'}</span>
                      <span class="text-xs font-medium text-foreground capitalize">{run.agentType}</span>
                      <Badge variant={run.status === 'completed' ? 'secondary' : run.status === 'running' ? 'default' : 'destructive'} class="text-[10px]">
                        {run.status}
                      </Badge>
                    </div>
                    <div class="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {#if run.durationMs}
                        <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                      {/if}
                      {#if run.tokensUsed}
                        <span>{run.tokensUsed.toLocaleString()} tok</span>
                      {/if}
                    </div>
                  </div>
                  {#if run.error}
                    <p class="text-xs text-destructive mt-2 px-2 py-1.5 rounded bg-destructive/5 border border-destructive/10">{run.error}</p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root bind:open={showDeleteConfirm}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete Task</AlertDialog.Title>
      <AlertDialog.Description>
        Are you sure you want to delete this task? This action cannot be undone.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action class="bg-destructive text-destructive-foreground hover:bg-destructive/90" onclick={handleDelete}>
        Delete
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
