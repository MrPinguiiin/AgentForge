<script lang="ts">
  import { onMount } from 'svelte';
  import {
    currentProject,
    projects,
    isLoading,
    loadProjects,
    selectProject,
    loadTasks,
    getPersistedProjectId,
  } from '$lib/stores/tasks.js';
  import { wsStore } from '$lib/stores/ws.svelte.js';
  import type { Project } from '$lib/types/index.js';
  import KanbanBoard from '$lib/components/board/KanbanBoard.svelte';
  import TaskDetail from '$lib/components/board/TaskDetail.svelte';
  import AddTaskModal from '$lib/components/board/AddTaskModal.svelte';
  import ActivityLog from '$lib/components/log/ActivityLog.svelte';
  import TopAppBar from '$lib/components/common/TopAppBar.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import * as api from '$lib/api/client.js';

  let showAddTask = $state(false);
  let showSetup = $state(false);
  let setupName = $state('');
  let setupPath = $state('');
  let setupLoading = $state(false);
  let setupError = $state('');

  // Directory browser state
  let showBrowser = $state(false);
  let browseDirs = $state<{ name: string; path: string }[]>([]);
  let browseCurrent = $state('');
  let browseParent = $state('');
  let browseIsGitRepo = $state(false);
  let browseLoading = $state(false);

  async function openBrowser() {
    showBrowser = true;
    await loadDirectory();
  }

  async function loadDirectory(dirPath?: string) {
    browseLoading = true;
    try {
      const result = await api.browseDirectory(dirPath);
      browseDirs = result.dirs;
      browseCurrent = result.current;
      browseParent = result.parent;
      browseIsGitRepo = result.isGitRepo;
    } catch (err) {
      console.error('Failed to browse directory:', err);
    } finally {
      browseLoading = false;
    }
  }

  function selectDirectory() {
    setupPath = browseCurrent;
    if (!setupName.trim()) {
      // Auto-fill project name from folder name
      const folderName = browseCurrent.split('/').filter(Boolean).pop() || '';
      setupName = folderName;
    }
    showBrowser = false;
  }

  onMount(() => {
    wsStore.connect();
    loadProjects().then(() => {
      const projs = $projects;
      if (projs.length > 0) {
        // Don't overwrite if already selected (e.g. navigating back from /terminal)
        if ($currentProject) {
          // Just reload tasks for the current project
          loadTasks($currentProject.id);
        } else {
          // Try to restore from localStorage, fallback to first project
          const savedId = getPersistedProjectId();
          const saved = savedId ? projs.find((p) => p.id === savedId) : null;
          selectProject(saved ?? projs[0]);
        }
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
    setupError = '';
    try {
      const project = await api.createProject(setupName.trim(), setupPath.trim());
      await loadProjects();
      await selectProject(project);
      showSetup = false;
      setupName = '';
      setupPath = '';
    } catch (err) {
      setupError = err instanceof Error ? err.message : 'Failed to create project';
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
  <title>AgentForge - Kanban Board</title>
</svelte:head>

{#if showSetup && !$currentProject}
  <!-- Project Setup (first time, full page) -->
  <div class="flex-1 flex items-center justify-center">
    <div class="w-[420px] p-6 bg-surface-container border border-outline-variant rounded-xl">
      <h2 class="text-lg font-semibold text-on-surface mb-1">Welcome to AgentForge</h2>
      <p class="text-sm text-secondary mb-6">Set up your first project to get started.</p>

      {#if setupError}
        <div class="mb-4 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
          {setupError}
        </div>
      {/if}

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
          <label for="project-path" class="block text-xs font-medium text-text-muted mb-1.5">Project Folder</label>
          <div class="flex gap-2">
            <input
              id="project-path"
              type="text"
              bind:value={setupPath}
              placeholder="Select a folder..."
              class="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
              readonly
              required
            />
            <button
              type="button"
              onclick={openBrowser}
              class="px-3 py-2 text-sm bg-surface-lighter border border-border rounded-lg text-text hover:bg-surface-lighter/80 transition-colors shrink-0"
            >
              Browse
            </button>
          </div>
        </div>

        {#if setupPath}
          <div class="px-3 py-2 text-xs font-mono text-text-muted bg-surface rounded-lg border border-border truncate">
            {setupPath}
          </div>
        {/if}

        <Button variant="primary" type="submit" loading={setupLoading} disabled={!setupPath}>
          Create Project
        </Button>
      </form>

      <!-- Directory Browser Modal -->
      {#if showBrowser}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="w-[520px] max-h-[70vh] flex flex-col bg-surface-light border border-border rounded-xl shadow-xl">
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 class="text-sm font-semibold text-text">Select Project Folder</h3>
              <button
                onclick={() => (showBrowser = false)}
                class="text-text-muted hover:text-text text-lg leading-none"
              >&times;</button>
            </div>

            <!-- Current path -->
            <div class="px-4 py-2 border-b border-border bg-surface shrink-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono text-text-muted truncate flex-1">{browseCurrent}</span>
                {#if browseIsGitRepo}
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 shrink-0">git</span>
                {/if}
              </div>
            </div>

            <!-- Directory list -->
            <div class="flex-1 overflow-y-auto min-h-0">
              {#if browseLoading}
                <div class="flex items-center justify-center py-8 text-sm text-text-muted">Loading...</div>
              {:else}
                <!-- Parent directory -->
                {#if browseParent !== browseCurrent}
                  <button
                    class="w-full flex items-center gap-2 px-4 py-2 text-sm text-text hover:bg-surface-lighter transition-colors text-left"
                    onclick={() => loadDirectory(browseParent)}
                  >
                    <span class="text-text-muted">..</span>
                    <span class="text-text-muted text-xs">(parent)</span>
                  </button>
                {/if}

                {#each browseDirs as dir}
                  <button
                    class="w-full flex items-center gap-2 px-4 py-2 text-sm text-text hover:bg-surface-lighter transition-colors text-left"
                    onclick={() => loadDirectory(dir.path)}
                  >
                    <span class="text-primary/70">&#128193;</span>
                    <span>{dir.name}</span>
                  </button>
                {/each}

                {#if browseDirs.length === 0}
                  <div class="px-4 py-6 text-center text-xs text-text-muted">No subdirectories</div>
                {/if}
              {/if}
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
              <button
                onclick={() => (showBrowser = false)}
                class="px-3 py-1.5 text-sm text-text-muted hover:text-text transition-colors"
              >Cancel</button>
              <button
                onclick={selectDirectory}
                class="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >Select This Folder</button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <!-- Board View -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- TopAppBar -->
    <TopAppBar>
      {#snippet actions()}
        <!-- Search -->
        <div class="relative hidden sm:block">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">search</span>
          <input
            type="text"
            placeholder="Search tasks..."
            class="bg-surface-container text-sm text-on-surface border border-outline-variant rounded-full pl-9 pr-4 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent w-48 placeholder:text-secondary transition-all focus:w-64"
          />
        </div>

        <!-- Icon Actions -->
        <div class="flex items-center gap-2 border-r border-outline-variant pr-4">
          <button
            class="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container-high hover:text-on-surface transition-colors active:scale-95"
            onclick={() => (showSetup = true)}
            title="Add Project"
          >
            <span class="material-symbols-outlined text-[20px]">create_new_folder</span>
          </button>
          <button class="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container-high hover:text-on-surface transition-colors relative active:scale-95">
            <span class="material-symbols-outlined text-[20px]">notifications</span>
          </button>
        </div>

        <!-- Create Task Button -->
        <button
          class="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-fixed-dim transition-colors active:scale-95"
          onclick={() => (showAddTask = true)}
        >
          Create Task
        </button>
      {/snippet}
    </TopAppBar>

    <!-- Board Canvas -->
    <main class="flex-1 overflow-hidden flex flex-col p-6">
      <!-- Board Header -->
      <div class="flex justify-between items-center mb-6 shrink-0">
        <div class="flex items-center gap-4">
          <h2 class="text-2xl font-bold text-on-surface tracking-tight">Active Board</h2>
        </div>
        <div class="flex items-center gap-3">
          <button class="text-secondary hover:text-on-surface text-sm flex items-center gap-1 transition-colors">
            <span class="material-symbols-outlined text-[18px]">filter_list</span>
            Filter
          </button>
        </div>
      </div>

      <!-- Kanban Board -->
      <div class="flex-1 overflow-hidden">
        {#if $isLoading && !$currentProject}
          <div class="flex items-center justify-center h-full text-sm text-secondary">
            Loading...
          </div>
        {:else}
          <KanbanBoard />
        {/if}
      </div>
    </main>
  </div>

  <!-- Task Detail Slide-over -->
  <TaskDetail />

  <!-- Add Task Modal -->
  <AddTaskModal bind:open={showAddTask} />

  <!-- Add Project Modal (when already have a project) -->
  {#if showSetup && $currentProject}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="w-[420px] p-6 bg-surface-light border border-border rounded-xl shadow-xl">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-text">Add Project</h2>
          <button
            onclick={() => { showSetup = false; setupName = ''; setupPath = ''; setupError = ''; }}
            class="text-text-muted hover:text-text text-lg leading-none"
          >&times;</button>
        </div>

        {#if setupError}
          <div class="mb-4 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
            {setupError}
          </div>
        {/if}

        <form class="space-y-4" onsubmit={handleCreateProject}>
          <div>
            <label for="modal-project-name" class="block text-xs font-medium text-text-muted mb-1.5">Project Name</label>
            <input
              id="modal-project-name"
              type="text"
              bind:value={setupName}
              placeholder="My Project"
              class="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div>
            <label for="modal-project-path" class="block text-xs font-medium text-text-muted mb-1.5">Project Folder</label>
            <div class="flex gap-2">
              <input
                id="modal-project-path"
                type="text"
                bind:value={setupPath}
                placeholder="Select a folder..."
                class="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary font-mono"
                readonly
                required
              />
              <button
                type="button"
                onclick={openBrowser}
                class="px-3 py-2 text-sm bg-surface-lighter border border-border rounded-lg text-text hover:bg-surface-lighter/80 transition-colors shrink-0"
              >
                Browse
              </button>
            </div>
          </div>

          {#if setupPath}
            <div class="px-3 py-2 text-xs font-mono text-text-muted bg-surface rounded-lg border border-border truncate">
              {setupPath}
            </div>
          {/if}

          <div class="flex justify-end gap-2">
            <Button variant="ghost" onclick={() => { showSetup = false; setupName = ''; setupPath = ''; setupError = ''; }}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={setupLoading} disabled={!setupPath}>
              Create Project
            </Button>
          </div>
        </form>

        <!-- Directory Browser Modal -->
        {#if showBrowser}
          <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div class="w-[520px] max-h-[70vh] flex flex-col bg-surface-light border border-border rounded-xl shadow-xl">
              <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <h3 class="text-sm font-semibold text-text">Select Project Folder</h3>
                <button
                  onclick={() => (showBrowser = false)}
                  class="text-text-muted hover:text-text text-lg leading-none"
                >&times;</button>
              </div>

              <div class="px-4 py-2 border-b border-border bg-surface shrink-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono text-text-muted truncate flex-1">{browseCurrent}</span>
                  {#if browseIsGitRepo}
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 shrink-0">git</span>
                  {/if}
                </div>
              </div>

              <div class="flex-1 overflow-y-auto min-h-0">
                {#if browseLoading}
                  <div class="flex items-center justify-center py-8 text-sm text-text-muted">Loading...</div>
                {:else}
                  {#if browseParent !== browseCurrent}
                    <button
                      class="w-full flex items-center gap-2 px-4 py-2 text-sm text-text hover:bg-surface-lighter transition-colors text-left"
                      onclick={() => loadDirectory(browseParent)}
                    >
                      <span class="text-text-muted">..</span>
                      <span class="text-text-muted text-xs">(parent)</span>
                    </button>
                  {/if}

                  {#each browseDirs as dir}
                    <button
                      class="w-full flex items-center gap-2 px-4 py-2 text-sm text-text hover:bg-surface-lighter transition-colors text-left"
                      onclick={() => loadDirectory(dir.path)}
                    >
                      <span class="text-primary/70">&#128193;</span>
                      <span>{dir.name}</span>
                    </button>
                  {/each}

                  {#if browseDirs.length === 0}
                    <div class="px-4 py-6 text-center text-xs text-text-muted">No subdirectories</div>
                  {/if}
                {/if}
              </div>

              <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
                <button
                  onclick={() => (showBrowser = false)}
                  class="px-3 py-1.5 text-sm text-text-muted hover:text-text transition-colors"
                >Cancel</button>
                <button
                  onclick={selectDirectory}
                  class="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >Select This Folder</button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}
