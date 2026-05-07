<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { addTask } from '../../stores/tasks.js';

  let {
    open = $bindable(false),
  }: {
    open: boolean;
  } = $props();

  let title = $state('');
  let description = $state('');
  let acceptanceCriteria = $state('');
  let submitting = $state(false);

  // Labels state
  let labels = $state<Array<{ category: string; value: string }>>([]);
  let labelCategory = $state('type');
  let labelValue = $state('');

  const LABEL_CATEGORIES = ['type', 'risk', 'scope', 'area', 'priority'] as const;
  const LABEL_PRESETS: Record<string, string[]> = {
    type: ['frontend', 'backend', 'bug', 'test', 'docs', 'research', 'refactor', 'feature'],
    risk: ['low', 'medium', 'high'],
    scope: ['small', 'large'],
    priority: ['low', 'medium', 'high', 'critical'],
  };

  function addLabel() {
    const val = labelValue.trim();
    if (!val) return;
    // Prevent duplicates
    if (labels.some(l => l.category === labelCategory && l.value === val)) return;
    labels = [...labels, { category: labelCategory, value: val }];
    labelValue = '';
  }

  function addPresetLabel(category: string, value: string) {
    if (labels.some(l => l.category === category && l.value === value)) return;
    labels = [...labels, { category, value }];
  }

  function removeLabel(index: number) {
    labels = labels.filter((_, i) => i !== index);
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    submitting = true;
    try {
      await addTask(
        title.trim(),
        description.trim() || undefined,
        acceptanceCriteria.trim() || undefined,
        labels.length > 0 ? labels : undefined,
      );
      // Reset form
      title = '';
      description = '';
      acceptanceCriteria = '';
      labels = [];
      labelValue = '';
      open = false;
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[540px]">
    <Dialog.Header>
      <Dialog.Title>Create Task</Dialog.Title>
      <Dialog.Description>Add a new task to the current project board.</Dialog.Description>
    </Dialog.Header>

    <form class="space-y-4 py-4" onsubmit={handleSubmit}>
      <!-- Title -->
      <div class="space-y-2">
        <Label for="task-title">Title</Label>
        <Input
          id="task-title"
          bind:value={title}
          placeholder="What needs to be done?"
          required
        />
      </div>

      <!-- Description -->
      <div class="space-y-2">
        <Label for="task-desc">Description</Label>
        <Textarea
          id="task-desc"
          bind:value={description}
          placeholder="Describe the task in detail..."
          rows={3}
          class="resize-none"
        />
      </div>

      <!-- Acceptance Criteria -->
      <div class="space-y-2">
        <Label for="task-criteria">Acceptance Criteria</Label>
        <Textarea
          id="task-criteria"
          bind:value={acceptanceCriteria}
          placeholder="- Condition 1 is met&#10;- Condition 2 is verified&#10;- Tests are added"
          rows={3}
          class="resize-none"
        />
      </div>

      <!-- Labels -->
      <div class="space-y-2">
        <Label>Labels</Label>

        <!-- Current labels -->
        {#if labels.length > 0}
          <div class="flex flex-wrap gap-1.5 mb-2">
            {#each labels as label, i}
              <Badge variant="secondary" class="gap-1">
                <span class="text-muted-foreground">{label.category}:</span>{label.value}
                <button type="button" onclick={() => removeLabel(i)} class="ml-0.5 hover:text-destructive">
                  <span class="material-symbols-outlined text-[12px]">close</span>
                </button>
              </Badge>
            {/each}
          </div>
        {/if}

        <!-- Quick label presets -->
        <div class="space-y-2">
          {#each Object.entries(LABEL_PRESETS) as [cat, values]}
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] text-muted-foreground uppercase font-medium w-12 shrink-0">{cat}</span>
              {#each values as val}
                {@const isActive = labels.some(l => l.category === cat && l.value === val)}
                <button
                  type="button"
                  class="px-2 py-0.5 rounded-md text-[10px] border transition-colors
                    {isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary text-secondary-foreground border-border hover:border-primary/50'}"
                  onclick={() => isActive ? removeLabel(labels.findIndex(l => l.category === cat && l.value === val)) : addPresetLabel(cat, val)}
                >
                  {val}
                </button>
              {/each}
            </div>
          {/each}
        </div>

        <!-- Custom label input -->
        <div class="flex gap-2 mt-2">
          <Select.Root type="single" bind:value={labelCategory}>
            <Select.Trigger class="w-24 h-8 text-xs">
              {labelCategory}
            </Select.Trigger>
            <Select.Content>
              {#each LABEL_CATEGORIES as cat}
                <Select.Item value={cat} label={cat}>{cat}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <Input
            bind:value={labelValue}
            placeholder="Custom value..."
            class="flex-1 h-8 text-xs"
            onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
          />
          <Button variant="outline" size="sm" type="button" onclick={addLabel}>Add</Button>
        </div>
      </div>

      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={!title.trim() || submitting}>
          {submitting ? 'Creating...' : 'Create Task'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
