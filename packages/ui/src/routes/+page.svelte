<script lang="ts">
  import { onMount } from 'svelte';
  import {
    currentProject,
    projects,
    isLoading,
    loadProjects,
    selectProject,
    loadTasks,
  } from '$lib/stores/tasks.js';
  import { wsStore } from '$lib/stores/ws.js';
  import type { Project } from '$lib/types/index.js';
  import KanbanBoard from '$lib/components/board/KanbanBoard.svelte';
  import TaskDetail from '$lib/components/board/TaskDetail.svelte';
  import AddTaskModal from '$lib/components/board/AddTaskModal.svelte';
  import ActivityLog from '$lib/components/log/ActivityLog.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import * as api from '$lib/api/client.js';

  let showAddTask = $state(false);
  let showSetup = $state(false);
  let setupName = $state('');
  let setupPath = $state('');
  let setupLoading = $state(false);

  onMount(() => {
    wsStore.connect();
    loadProjects().then(() => {
      const projs = $projects;
      if (projs.length > 0) {
        selectProject(projs[0]);
      } else {
        showSetup = true;
      }
    });

    // Listen for real-time task updates
    const unsubCreated = wsStore.on('task:created', () => {
      if ($currentProject) loadTasks($currentProject.id);
    });
    const unsubUpdated = wsStore.on('task:updated', () => {
      if ($currentProject) loadTasks($currentProject.id);
    });
    const unsubStatus = wsStore.on('task:status_changed', () => {
      if ($currentProject) loadTasks($currentProject.id);
    });
    const unsubDeleted = wsStore.on('task:deleted', () => {
      if ($currentProject) loadTasks($currentProject.id);
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubStatus();
      unsubDeleted();
      wsStore.disconnect();
    };
  });

  async function handleCreateProject(e: SubmitEvent) {
    e.preventDefault();
    if (!setupName.trim() || !setupPath.trim()) return;

    setupLoading = true;
    try {
      const project = await api.createProject(setupName.trim(), setupPath.trim());
      await loadProjects();
      await selectProject(project);
      showSetup = false;
      setupName = '';
      setupPath = '';
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setupLoading = false;
    }
  }

  function handleProjectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const project = $projects.find((p) => p.id === select.value);
    if (project) selectProject(project);
  }
</script>

<svelte:head>
  <title>AI Coder - Board</title>
</svelte:head>

{#if showSetup && !$currentProject}
  <!-- Project Setup -->
  <div class="flex-1 flex items-center justify-center">
    <div class="w-[420px] p-6 bg-surface-light border border-border rounded-xl">
      <h2 class="text-lg font-semibold text-text mb-1">Welcome to AI Coder</h2>
      <p class="text-sm text-text-muted mb-6">Set up your first project to get started.</p>

      <form class="space-y-4" onsubmit={handleCreateProject}>
        <div>
          <label for="project-name" class="block text-xs font-medium text-text-muted mb-1.5">Project Name</label>
          <input
            id="project-name"
            type="text"
            bind:value={setupName}
            placeholder="My Project"
            class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary"
            required
          />
        </div>

        <div>
          <label for="project-path" class="block text-xs font-medium text-text-muted mb-1.5">Project Path</label>
          <input
            id="project-path"
            type="text"
            bind:value={setupPath}
            placeholder="/home/user/my-project"
            class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
            required
          />
        </div>

        <Button variant="primary" type="submit" loading={setupLoading}>
          Create Project
        </Button>
      </form>
    </div>
  </div>
{:else}
  <!-- Board View -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Top Bar -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <div class="flex items-center gap-3">
        {#if $projects.length > 1}
          <select
            class="text-sm bg-surface-lighter border border-border rounded-lg px-2 py-1 text-text focus:outline-none focus:border-primary"
            value={$currentProject?.id ?? ''}
            onchange={handleProjectChange}
          >
            {#each $projects as project}
              <option value={project.id}>{project.name}</option>
            {/each}
          </select>
        {:else if $currentProject}
          <h2 class="text-sm font-semibold text-text">{$currentProject.name}</h2>
        {/if}

        {#if $currentProject?.framework}
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-lighter text-text-muted">
            {$currentProject.framework}
          </span>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" onclick={() => (showSetup = true)}>
          + Project
        </Button>
        <Button variant="primary" size="sm" onclick={() => (showAddTask = true)}>
          + Task
        </Button>
      </div>
    </div>

    <!-- Kanban Board -->
    <div class="flex-1 overflow-hidden">
      {#if $isLoading && !$currentProject}
        <div class="flex items-center justify-center h-full text-sm text-text-muted">
          Loading...
        </div>
      {:else}
        <KanbanBoard />
      {/if}
    </div>

    <!-- Activity Log -->
    <ActivityLog />
  </div>

  <!-- Task Detail Slide-over -->
  <TaskDetail />

  <!-- Add Task Modal -->
  <AddTaskModal bind:open={showAddTask} />
{/if}
