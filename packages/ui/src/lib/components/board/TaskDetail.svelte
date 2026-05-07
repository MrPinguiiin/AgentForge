<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
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
  } from '../../stores/tasks.js';
  import { wsStore } from '../../stores/ws.svelte.js';
  import DiffViewer from '../editor/DiffViewer.svelte';
  import * as api from '../../api/client.js';

  let task = $derived($selectedTask);
  let files = $derived($selectedTaskFiles);
  let runs = $derived($selectedTaskRuns);
  let actionLoading = $state<string | null>(null);
  let autoReview = $state(false);
  let errorMessage = $state('');
  let showDeleteConfirm = $state(false);

  // Pipeline data
  let taskPlan = $state<api.TaskPlan | null>(null);
  let taskRuns = $state<api.TaskRun[]>([]);
  let taskArtifacts = $state<api.TaskArtifact[]>([]);
  let planLoading = $state(false);

  let isOpen = $derived(!!task);
  let activeTab = $state('overview');

  // Load pipeline data when task changes
  $effect(() => {
    if (task) {
      loadPipelineData(task.id);
    } else {
      taskPlan = null;
      taskRuns = [];
      taskArtifacts = [];
      activeTab = 'overview';
    }
  });

  // Keep the detail panel fresh when backend pipeline events update the task.
  $effect(() => {
    if (!task) return;

    const taskId = task.id;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        await refreshSelectedTask();
        await loadPipelineData(taskId);
      }, 150);
    };

    const onStage = (payload: { taskId?: string }) => {
      if (payload.taskId === taskId) refresh();
    };
    const onAgentDone = (payload: { taskId?: string }) => {
      if (payload.taskId === taskId) refresh();
    };

    const offStage = wsStore.on('pipeline:stage', onStage);
    const offComplete = wsStore.on('agent:complete', onAgentDone);
    const offError = wsStore.on('agent:error', onAgentDone);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      offStage();
      offComplete();
      offError();
    };
  });

  async function loadPipelineData(taskId: string) {
    planLoading = true;
    try {
      const [planResult, runsResult, artifactsResult] = await Promise.all([
        api.getTaskPlan(taskId),
        api.getTaskRuns(taskId),
        api.getTaskArtifacts(taskId),
      ]);

      taskPlan = planResult.plan;
      taskRuns = runsResult.runs;
      taskArtifacts = artifactsResult.artifacts;
    } catch {
      // Ignore - pipeline data may not exist yet
      taskPlan = null;
      taskRuns = [];
      taskArtifacts = [];
    } finally {
      planLoading = false;
    }
  }

  // Pipeline stages
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

  function getStageIndex(status: string): number {
    if (status === 'planning' || status === 'coding') return 2;
    if (status === 'needs_human') return 2;
    return PIPELINE_STAGES.findIndex(s => s.id === status);
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
    const idx = PIPELINE_STAGES.findIndex(s => s.id === status);
    if (status === 'planning' || status === 'coding') return 40;
    if (status === 'needs_human') return 40;
    if (status === 'failed' || status === 'cancelled') return 0;
    if (idx < 0) return 0;
    return Math.round((idx / (PIPELINE_STAGES.length - 1)) * 100);
  }

  let meta = $derived(task ? STATUS_META[task.status] ?? STATUS_META['backlog'] : STATUS_META['backlog']);
  let progressPercent = $derived(task ? getProgressPercent(task.status) : 0);

  // Get specific artifacts
  let gitDiff = $derived(taskArtifacts.find(a => a.artifactType === 'git_diff')?.content ?? '');
  let gitDiffStat = $derived(taskArtifacts.find(a => a.artifactType === 'git_diff_stat')?.content ?? '');
  let reviewVerdict = $derived(taskArtifacts.find(a => a.artifactType === 'review_verdict')?.content ?? '');
  let qaReport = $derived(taskArtifacts.find(a => a.artifactType === 'qa_report')?.content ?? '');

  // ===== Actions =====

  async function handleAction(action: string) {
    if (!task) return;
    actionLoading = action;
    errorMessage = '';

    const taskShort = task.id.slice(0, 8).toUpperCase();
    console.log(
      `%c[ACTION] %c${action.toUpperCase()} %ctask=${taskShort} "${task.title}"`,
      'color: #a78bfa; font-weight: bold', 'color: #fbbf24; font-weight: bold', 'color: #9ca3af'
    );

    try {
      switch (action) {
        case 'run-planning':
          await api.runPlanning(task.id);
          console.log(`%c[ACTION] %cPlanning job queued`, 'color: #a78bfa; font-weight: bold', 'color: #34d399');
          break;
        case 'approve-plan':
          await api.approvePlan(task.id);
          console.log(`%c[ACTION] %cPlan approved, execution queued`, 'color: #a78bfa; font-weight: bold', 'color: #34d399');
          break;
        case 'retry-planning':
          await api.retryPlanning(task.id);
          console.log(`%c[ACTION] %cPlanning retry queued`, 'color: #a78bfa; font-weight: bold', 'color: #fbbf24');
          break;
        case 'cancel':
          await api.cancelTask(task.id);
          console.log(`%c[ACTION] %cTask cancelled`, 'color: #a78bfa; font-weight: bold', 'color: #f87171');
          break;
        case 'run-review':
          await api.runReviewPipeline(task.id);
          console.log(`%c[ACTION] %cReview job queued`, 'color: #a78bfa; font-weight: bold', 'color: #34d399');
          break;
        case 'run-qa':
          await api.runQAPipeline(task.id);
          console.log(`%c[ACTION] %cQA job queued`, 'color: #a78bfa; font-weight: bold', 'color: #34d399');
          break;
        case 'accept-review':
          await api.acceptReviewPipeline(task.id);
          console.log(`%c[ACTION] %cReview accepted, QA queued`, 'color: #a78bfa; font-weight: bold', 'color: #34d399');
          break;
        case 'decline-review':
          await api.declineReviewPipeline(task.id);
          console.log(`%c[ACTION] %cReview declined`, 'color: #a78bfa; font-weight: bold', 'color: #f87171');
          break;
      }
      // Refresh task data
      await refreshSelectedTask();
      if (task) await loadPipelineData(task.id);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `%c[ACTION] %c${action.toUpperCase()} FAILED %c${errorMessage}`,
        'color: #a78bfa; font-weight: bold', 'color: #f87171; font-weight: bold', 'color: #f87171'
      );
    } finally {
      actionLoading = null;
    }
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
  <Sheet.Content side="right" class="w-[600px] max-w-[90vw] p-0 flex flex-col">
    {#if task}
      <!-- Header -->
      <Sheet.Header class="px-6 py-4 border-b border-border space-y-0 shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Badge variant={meta.variant}>
              <span class="material-symbols-outlined text-[12px] mr-1" style="font-variation-settings: 'FILL' 1;">{meta.icon}</span>
              {meta.label}
            </Badge>
            <span class="text-xs text-muted-foreground font-mono">{task.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div class="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onclick={() => (showDeleteConfirm = true)}>
              <span class="material-symbols-outlined text-[16px] text-destructive">delete</span>
            </Button>
          </div>
        </div>
        <Sheet.Title class="text-lg font-bold text-foreground mt-3">{task.title}</Sheet.Title>
        {#if task.description}
          <Sheet.Description class="text-sm text-muted-foreground">{task.description}</Sheet.Description>
        {/if}
      </Sheet.Header>

      <!-- Tabs -->
      <Tabs.Root bind:value={activeTab} class="flex-1 flex flex-col min-h-0">
        <Tabs.List class="px-6 border-b border-border shrink-0">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="planning">
            Planning
            {#if taskPlan}<span class="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>{/if}
          </Tabs.Trigger>
          <Tabs.Trigger value="runs">
            Runs
            {#if taskRuns.length > 0}<span class="ml-1 text-[10px] text-muted-foreground">({taskRuns.length})</span>{/if}
          </Tabs.Trigger>
          <Tabs.Trigger value="diff">
            Diff
            {#if gitDiff}<span class="ml-1 w-1.5 h-1.5 rounded-full bg-chart-1 inline-block"></span>{/if}
          </Tabs.Trigger>
        </Tabs.List>

        <!-- ===== OVERVIEW TAB ===== -->
        <Tabs.Content value="overview" class="flex-1 overflow-y-auto p-0">
          <!-- Pipeline Stepper -->
          <div class="px-6 py-4 border-b border-border">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span class="material-symbols-outlined text-[14px]">timeline</span>
                Pipeline
              </h3>
              <span class="text-[10px] text-muted-foreground font-medium">{progressPercent}%</span>
            </div>

            <!-- Visual Stage Stepper -->
            <div class="flex items-start gap-0 mb-4">
              {#each PIPELINE_STAGES as stage, i}
                {@const state = getStageState(i, task.status)}
                <div class="flex flex-col items-center flex-1 relative">
                  {#if i > 0}
                    <div class="absolute top-3.5 right-1/2 w-full h-0.5 -z-10
                      {state === 'completed' || state === 'active' ? 'bg-primary' : state === 'failed' ? 'bg-destructive' : 'bg-border'}
                    "></div>
                  {/if}
                  {#if i < PIPELINE_STAGES.length - 1}
                    {@const nextState = getStageState(i + 1, task.status)}
                    <div class="absolute top-3.5 left-1/2 w-full h-0.5 -z-10
                      {nextState === 'completed' || nextState === 'active' ? 'bg-primary' : nextState === 'failed' ? 'bg-destructive' : 'bg-border'}
                    "></div>
                  {/if}
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
                  <span class="text-[10px] mt-1.5 text-center leading-tight
                    {state === 'completed' ? 'text-primary font-medium' :
                     state === 'active' ? 'text-primary font-semibold' :
                     state === 'failed' ? 'text-destructive font-medium' :
                     'text-muted-foreground'}
                  ">{stage.label}</span>
                </div>
              {/each}
            </div>

            <Progress value={progressPercent} class="h-1.5 mb-4" />

            <!-- Error -->
            {#if errorMessage}
              <div class="mb-4 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
                <span class="material-symbols-outlined text-[14px] mt-0.5">error</span>
                <span>{errorMessage}</span>
              </div>
            {/if}

            <!-- Status-specific Actions -->
            <div class="space-y-3">
              {#if task.status === 'backlog'}
                <Button class="w-full" disabled={actionLoading === 'run-planning'} onclick={() => handleAction('run-planning')}>
                  {#if actionLoading === 'run-planning'}
                    <span class="material-symbols-outlined text-[16px] animate-spin mr-2">sync</span>
                    Queuing...
                  {:else}
                    <span class="material-symbols-outlined text-[16px] mr-2">play_arrow</span>
                    Run Planning
                  {/if}
                </Button>
              {:else if task.status === 'ready'}
                <div class="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                  <p class="text-sm font-medium text-foreground mb-1">Plan ready for review</p>
                  <p class="text-xs text-muted-foreground">Check the Planning tab to review the implementation plan before approving.</p>
                </div>
                <div class="flex gap-2">
                  <Button class="flex-1" disabled={actionLoading === 'approve-plan'} onclick={() => handleAction('approve-plan')}>
                    <span class="material-symbols-outlined text-[16px] mr-1">check</span>
                    Approve & Execute
                  </Button>
                  <Button variant="outline" disabled={actionLoading === 'retry-planning'} onclick={() => handleAction('retry-planning')}>
                    <span class="material-symbols-outlined text-[16px] mr-1">refresh</span>
                    Re-plan
                  </Button>
                </div>
              {:else if task.status === 'planning'}
                <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
                  <span class="material-symbols-outlined text-primary text-[20px] animate-spin">psychology</span>
                  <div>
                    <p class="text-sm font-medium text-foreground">Planning in progress...</p>
                    <p class="text-xs text-muted-foreground">OpenCode is analyzing the task and creating a plan</p>
                  </div>
                </div>
              {:else if task.status === 'in_progress' || task.status === 'coding'}
                <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
                  <span class="material-symbols-outlined text-primary text-[20px] animate-spin">sync</span>
                  <div>
                    <p class="text-sm font-medium text-foreground">Agent is working...</p>
                    <p class="text-xs text-muted-foreground">{task.agentType ?? 'AI'} agent executing the plan</p>
                  </div>
                </div>
              {:else if task.status === 'needs_human'}
                <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <span class="material-symbols-outlined text-destructive text-[20px]">warning</span>
                  <div>
                    <p class="text-sm font-medium text-foreground">Human intervention required</p>
                    <p class="text-xs text-muted-foreground">The task requires clarification or has high risk</p>
                  </div>
                </div>
                <Button variant="outline" class="w-full" onclick={() => handleAction('retry-planning')}>
                  <span class="material-symbols-outlined text-[16px] mr-1">refresh</span>
                  Retry Planning
                </Button>
              {:else if task.status === 'in_review'}
                <div class="flex items-center gap-2">
                  <Button class="flex-1" variant="default" disabled={actionLoading === 'accept-review'} onclick={() => handleAction('accept-review')}>
                    <span class="material-symbols-outlined text-[16px] mr-1">check</span>
                    Accept
                  </Button>
                  <Button class="flex-1" variant="destructive" disabled={actionLoading === 'decline-review'} onclick={() => handleAction('decline-review')}>
                    <span class="material-symbols-outlined text-[16px] mr-1">close</span>
                    Decline
                  </Button>
                  <Button variant="outline" disabled={actionLoading === 'run-review'} onclick={() => handleAction('run-review')}>
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
                  <Button variant="outline" size="sm" onclick={() => handleAction('retry-planning')}>Retry</Button>
                </div>
              {/if}

              <!-- Cancel button (always available except done/cancelled) -->
              {#if task.status !== 'done' && task.status !== 'cancelled'}
                <Button variant="ghost" size="sm" class="w-full text-muted-foreground" onclick={() => handleAction('cancel')}>
                  Cancel Task
                </Button>
              {/if}
            </div>
          </div>

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
        </Tabs.Content>

        <!-- ===== PLANNING TAB ===== -->
        <Tabs.Content value="planning" class="flex-1 overflow-y-auto p-0">
          <div class="px-6 py-4">
            {#if planLoading}
              <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <span class="material-symbols-outlined animate-spin mr-2">sync</span>
                Loading plan...
              </div>
            {:else if taskPlan}
              {@const plan = taskPlan.planJson}
              <!-- Plan Header -->
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-semibold text-foreground">Implementation Plan</h3>
                  {#if taskPlan.approved}
                    <Badge variant="default">Approved</Badge>
                  {:else}
                    <Badge variant="outline">Pending Review</Badge>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  {#if taskPlan.riskLevel}
                    <Badge variant={taskPlan.riskLevel === 'high' ? 'destructive' : taskPlan.riskLevel === 'medium' ? 'outline' : 'secondary'}>
                      Risk: {taskPlan.riskLevel}
                    </Badge>
                  {/if}
                  {#if taskPlan.recommendedAgent}
                    <Badge variant="secondary">
                      <span class="material-symbols-outlined text-[12px] mr-1" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
                      {taskPlan.recommendedAgent}
                    </Badge>
                  {/if}
                </div>
              </div>

              <!-- Summary -->
              {#if plan.summary}
                <div class="p-3 rounded-lg bg-muted border border-border mb-4">
                  <p class="text-xs text-foreground">{plan.summary}</p>
                </div>
              {/if}

              <!-- Implementation Steps -->
              {#if plan.implementation_steps?.length > 0}
                <div class="mb-4">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Implementation Steps</h4>
                  <ol class="space-y-1.5">
                    {#each plan.implementation_steps as step, i}
                      <li class="flex items-start gap-2 text-xs text-foreground">
                        <span class="text-muted-foreground font-mono shrink-0 w-5 text-right">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    {/each}
                  </ol>
                </div>
              {/if}

              <!-- Files to Change -->
              {#if plan.likely_files_to_change?.length > 0}
                <div class="mb-4">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Files to Change</h4>
                  <div class="flex flex-wrap gap-1.5">
                    {#each plan.likely_files_to_change as file}
                      <Badge variant="outline" class="font-mono text-[10px]">{file}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Test Plan -->
              {#if plan.test_plan?.length > 0}
                <div class="mb-4">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Test Plan</h4>
                  <ul class="space-y-1">
                    {#each plan.test_plan as test}
                      <li class="flex items-start gap-2 text-xs text-foreground">
                        <span class="material-symbols-outlined text-[12px] text-muted-foreground mt-0.5">check_box_outline_blank</span>
                        <span>{test}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Acceptance Checklist -->
              {#if plan.acceptance_checklist?.length > 0}
                <div class="mb-4">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acceptance Checklist</h4>
                  <ul class="space-y-1">
                    {#each plan.acceptance_checklist as item}
                      <li class="flex items-start gap-2 text-xs text-foreground">
                        <span class="material-symbols-outlined text-[12px] text-muted-foreground mt-0.5">check_box_outline_blank</span>
                        <span>{item}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Human Questions -->
              {#if plan.human_questions?.length > 0}
                <div class="mb-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <h4 class="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">Questions for Human</h4>
                  <ul class="space-y-1">
                    {#each plan.human_questions as q}
                      <li class="text-xs text-foreground">- {q}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Approve/Re-plan buttons -->
              {#if task.status === 'ready' && !taskPlan.approved}
                <Separator class="my-4" />
                <div class="flex gap-2">
                  <Button class="flex-1" disabled={actionLoading === 'approve-plan'} onclick={() => handleAction('approve-plan')}>
                    <span class="material-symbols-outlined text-[16px] mr-1">check</span>
                    Approve Plan
                  </Button>
                  <Button variant="outline" disabled={actionLoading === 'retry-planning'} onclick={() => handleAction('retry-planning')}>
                    <span class="material-symbols-outlined text-[16px] mr-1">refresh</span>
                    Re-plan
                  </Button>
                </div>
              {/if}
            {:else}
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <span class="material-symbols-outlined text-[32px] text-muted-foreground mb-2">psychology</span>
                <p class="text-sm text-muted-foreground">No plan generated yet</p>
                <p class="text-xs text-muted-foreground mt-1">Click "Run Planning" in the Overview tab to generate a plan</p>
              </div>
            {/if}
          </div>
        </Tabs.Content>

        <!-- ===== RUNS TAB ===== -->
        <Tabs.Content value="runs" class="flex-1 overflow-y-auto p-0">
          <div class="px-6 py-4">
            {#if taskRuns.length > 0}
              <div class="space-y-3">
                {#each taskRuns as run}
                  <div class="p-3 rounded-lg border border-border bg-card">
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-[14px]
                          {run.status === 'completed' ? 'text-chart-1' :
                           run.status === 'running' ? 'text-primary' :
                           run.status === 'queued' ? 'text-muted-foreground' :
                           'text-destructive'}
                        "
                          style={run.status === 'completed' ? "font-variation-settings: 'FILL' 1;" : ''}
                        >
                          {run.status === 'completed' ? 'check_circle' :
                           run.status === 'running' ? 'sync' :
                           run.status === 'queued' ? 'schedule' :
                           'error'}
                        </span>
                        <span class="text-xs font-medium text-foreground capitalize">{run.runType}</span>
                        {#if run.agentName}
                          <Badge variant="secondary" class="text-[10px]">{run.agentName}</Badge>
                        {/if}
                        <Badge variant={run.status === 'completed' ? 'secondary' : run.status === 'running' ? 'default' : run.status === 'queued' ? 'outline' : 'destructive'} class="text-[10px]">
                          {run.status}
                        </Badge>
                      </div>
                      <div class="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {#if run.durationMs}
                          <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                        {/if}
                        {#if run.exitCode !== null && run.exitCode !== undefined}
                          <span>exit: {run.exitCode}</span>
                        {/if}
                      </div>
                    </div>

                    {#if run.error}
                      <p class="text-xs text-destructive mt-2 px-2 py-1.5 rounded bg-destructive/5 border border-destructive/10">{run.error}</p>
                    {/if}

                    <!-- Expandable stdout/stderr -->
                    {#if run.stdout || run.stderr}
                      <details class="mt-2 group">
                        <summary class="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                          <span class="material-symbols-outlined text-[12px] group-open:rotate-90 transition-transform">chevron_right</span>
                          Output
                        </summary>
                        {#if run.stdout}
                          <pre class="mt-2 p-2 rounded bg-muted text-[10px] font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">{run.stdout}</pre>
                        {/if}
                        {#if run.stderr}
                          <pre class="mt-1 p-2 rounded bg-destructive/5 text-[10px] font-mono text-destructive overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">{run.stderr}</pre>
                        {/if}
                      </details>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <span class="material-symbols-outlined text-[32px] text-muted-foreground mb-2">history</span>
                <p class="text-sm text-muted-foreground">No runs yet</p>
                <p class="text-xs text-muted-foreground mt-1">Runs will appear here when the pipeline executes</p>
              </div>
            {/if}
          </div>
        </Tabs.Content>

        <!-- ===== DIFF TAB ===== -->
        <Tabs.Content value="diff" class="flex-1 overflow-y-auto p-0">
          <div class="px-6 py-4">
            {#if gitDiff}
              <!-- Diff stat -->
              {#if gitDiffStat}
                <div class="mb-4 p-3 rounded-lg bg-muted border border-border">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Diff Summary</h4>
                  <pre class="text-[11px] font-mono text-foreground whitespace-pre-wrap">{gitDiffStat}</pre>
                </div>
              {/if}

              <!-- Full diff -->
              <DiffViewer diff={gitDiff} />

              <!-- Review verdict -->
              {#if reviewVerdict}
                <div class="mt-4 p-3 rounded-lg bg-muted border border-border">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Review Verdict</h4>
                  <pre class="text-[11px] font-mono text-foreground whitespace-pre-wrap">{reviewVerdict}</pre>
                </div>
              {/if}

              <!-- QA report -->
              {#if qaReport}
                <div class="mt-4 p-3 rounded-lg bg-muted border border-border">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">QA Report</h4>
                  <pre class="text-[11px] font-mono text-foreground whitespace-pre-wrap">{qaReport}</pre>
                </div>
              {/if}
            {:else if files.length > 0}
              <!-- Legacy file changes -->
              <div class="space-y-2">
                {#each files as file}
                  <div class="rounded-lg border border-border overflow-hidden">
                    <div class="flex items-center justify-between px-3 py-2 bg-muted">
                      <span class="text-xs font-mono text-muted-foreground truncate">{file.filePath}</span>
                    </div>
                    {#if file.diff}
                      <DiffViewer diff={file.diff} />
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <span class="material-symbols-outlined text-[32px] text-muted-foreground mb-2">difference</span>
                <p class="text-sm text-muted-foreground">No changes yet</p>
                <p class="text-xs text-muted-foreground mt-1">Code changes will appear here after execution</p>
              </div>
            {/if}
          </div>
        </Tabs.Content>
      </Tabs.Root>
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
