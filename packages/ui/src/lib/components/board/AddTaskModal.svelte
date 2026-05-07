<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { addTask } from '../../stores/tasks.js';

  let {
    open = $bindable(false),
  }: {
    open: boolean;
  } = $props();

  let title = $state('');
  let description = $state('');
  let submitting = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    submitting = true;
    try {
      await addTask(title.trim(), description.trim() || undefined);
      title = '';
      description = '';
      open = false;
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[480px]">
    <Dialog.Header>
      <Dialog.Title>Create Task</Dialog.Title>
      <Dialog.Description>Add a new task to the current project board.</Dialog.Description>
    </Dialog.Header>

    <form class="space-y-4 py-4" onsubmit={handleSubmit}>
      <div class="space-y-2">
        <Label for="task-title">Title</Label>
        <Input
          id="task-title"
          bind:value={title}
          placeholder="What needs to be done?"
          required
        />
      </div>

      <div class="space-y-2">
        <Label for="task-desc">Description</Label>
        <Textarea
          id="task-desc"
          bind:value={description}
          placeholder="Describe the task in detail..."
          rows={4}
          class="resize-none"
        />
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
