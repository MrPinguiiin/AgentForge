<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { batchStart, clearBacklogSelection } from '../../stores/tasks.js';
  import * as api from '../../api/client.js';
  import type { ReviewMode, ApprovalMode } from '../../types/index.js';

  let {
    open = $bindable(false),
    taskCount = 0,
  }: {
    open: boolean;
    taskCount: number;
  } = $props();

  let reviewMode = $state<ReviewMode>('auto');
  let approvalMode = $state<ApprovalMode>('auto');
  let submitting = $state(false);
  let errorMessage = $state('');
  let defaultsLoaded = $state(false);

  // Load defaults when modal opens
  $effect(() => {
    if (open && !defaultsLoaded) {
      loadDefaults();
    }
    if (!open) {
      defaultsLoaded = false;
      errorMessage = '';
    }
  });

  async function loadDefaults() {
    try {
      const result = await api.getPipelineDefaults();
      reviewMode = (result.defaults.reviewMode as ReviewMode) ?? 'auto';
      approvalMode = (result.defaults.approvalMode as ApprovalMode) ?? 'auto';
      defaultsLoaded = true;
    } catch {
      // Use defaults
      defaultsLoaded = true;
    }
  }

  async function handleStart() {
    submitting = true;
    errorMessage = '';
    try {
      const result = await batchStart({ reviewMode, approvalMode });
      console.log(
        `%c[BATCH] %cStarted ${result.queued.length} tasks, skipped ${result.skipped.length}`,
        'color: #a78bfa; font-weight: bold', 'color: #34d399'
      );
      open = false;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      submitting = false;
    }
  }

  function handleCancel() {
    open = false;
  }

  // Flow description based on settings
  let flowDescription = $derived(() => {
    if (reviewMode === 'auto' && approvalMode === 'auto') {
      return 'Full auto — Planning → In Progress → AI Review → QA → Done';
    }
    if (reviewMode === 'auto' && approvalMode === 'manual') {
      return 'Planning → Need Human (approve plan) → In Progress → AI Review → QA → Done';
    }
    if (reviewMode === 'human' && approvalMode === 'auto') {
      return 'Planning → In Progress → Need Human (review code) → QA → Done';
    }
    return 'Planning → Need Human (approve plan) → In Progress → Need Human (review code) → QA → Done';
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[520px]">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[20px] text-primary">rocket_launch</span>
        Start Tasks
      </Dialog.Title>
      <Dialog.Description>
        Configure how {taskCount} {taskCount === 1 ? 'task' : 'tasks'} will be processed by the AI pipeline.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6 py-4">
      <!-- Task count badge -->
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
        <span class="material-symbols-outlined text-[18px] text-primary">checklist</span>
        <span class="text-sm font-medium">{taskCount} {taskCount === 1 ? 'task' : 'tasks'} selected</span>
      </div>

      <!-- Review Mode -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px] text-muted-foreground">rate_review</span>
          <span class="text-sm font-semibold">Review Mode</span>
        </div>
        <p class="text-xs text-muted-foreground ml-6">Who reviews the AI's code changes after execution?</p>
        <div class="grid grid-cols-2 gap-2 ml-6">
          <button
            class="flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm
              {reviewMode === 'auto'
                ? 'border-primary bg-primary/5 text-primary font-semibold'
                : 'border-border hover:border-muted-foreground/30 text-muted-foreground'}"
            onclick={() => reviewMode = 'auto'}
          >
            <span class="material-symbols-outlined text-[20px]">smart_toy</span>
            <span>Auto (AI Review)</span>
          </button>
          <button
            class="flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm
              {reviewMode === 'human'
                ? 'border-primary bg-primary/5 text-primary font-semibold'
                : 'border-border hover:border-muted-foreground/30 text-muted-foreground'}"
            onclick={() => reviewMode = 'human'}
          >
            <span class="material-symbols-outlined text-[20px]">front_hand</span>
            <span>Human Review</span>
          </button>
        </div>
      </div>

      <!-- Approval Mode -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px] text-muted-foreground">approval</span>
          <span class="text-sm font-semibold">Approval Mode</span>
        </div>
        <p class="text-xs text-muted-foreground ml-6">Auto-approve plan and start execution, or review plan first?</p>
        <div class="grid grid-cols-2 gap-2 ml-6">
          <button
            class="flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm
              {approvalMode === 'auto'
                ? 'border-primary bg-primary/5 text-primary font-semibold'
                : 'border-border hover:border-muted-foreground/30 text-muted-foreground'}"
            onclick={() => approvalMode = 'auto'}
          >
            <span class="material-symbols-outlined text-[20px]">bolt</span>
            <span>Auto Approve</span>
          </button>
          <button
            class="flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm
              {approvalMode === 'manual'
                ? 'border-primary bg-primary/5 text-primary font-semibold'
                : 'border-border hover:border-muted-foreground/30 text-muted-foreground'}"
            onclick={() => approvalMode = 'manual'}
          >
            <span class="material-symbols-outlined text-[20px]">front_hand</span>
            <span>Manual Approve</span>
          </button>
        </div>
      </div>

      <!-- Flow Preview -->
      <div class="px-3 py-2 rounded-lg bg-muted border border-border">
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-[14px] text-muted-foreground">route</span>
          <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pipeline Flow</span>
        </div>
        <p class="text-xs text-foreground">{flowDescription()}</p>
      </div>

      <!-- High risk warning -->
      <div class="px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-[14px] text-destructive mt-0.5">info</span>
          <p class="text-[11px] text-muted-foreground">High-risk tasks will always stop for human review regardless of these settings.</p>
        </div>
      </div>

      <!-- Error -->
      {#if errorMessage}
        <div class="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {errorMessage}
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={handleCancel} disabled={submitting}>Cancel</Button>
      <Button onclick={handleStart} disabled={submitting || taskCount === 0}>
        {#if submitting}
          <span class="material-symbols-outlined text-[16px] animate-spin mr-1">sync</span>
          Starting...
        {:else}
          <span class="material-symbols-outlined text-[16px] mr-1">rocket_launch</span>
          Start {taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
