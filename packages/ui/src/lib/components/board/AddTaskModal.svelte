<script lang="ts">
  import Modal from '../common/Modal.svelte';
  import Button from '../common/Button.svelte';
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

<Modal bind:open title="Add Task" description="Create a new task for the current project.">
  <form class="p-4 space-y-4" onsubmit={handleSubmit}>
    <div>
      <label for="task-title" class="block text-xs font-medium text-text-muted mb-1.5">Title</label>
      <input
        id="task-title"
        type="text"
        bind:value={title}
        placeholder="What needs to be done?"
        class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary"
        required
      />
    </div>

    <div>
      <label for="task-desc" class="block text-xs font-medium text-text-muted mb-1.5">Description</label>
      <textarea
        id="task-desc"
        bind:value={description}
        placeholder="Describe the task in detail..."
        rows="4"
        class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary resize-none"
      ></textarea>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
      <Button variant="primary" type="submit" loading={submitting} disabled={!title.trim()}>
        Create Task
      </Button>
    </div>
  </form>
</Modal>
