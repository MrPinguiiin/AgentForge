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
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
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
    const unsubStatus = wsStore.on('task:statusChanged', () => {
      if ($currentProject) loadTasks($currentProject.id);
    });
    const unsubDeleted = wsStore.on('task:deleted', () => {
      if ($currentProject) loadTasks($currentProject.id);
    });
    const unsubPipeline = wsStore.on('pipeline:stage', () => {
      if ($currentProject) loadTasks($currentProject.id);
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubStatus();
      unsubDeleted();
      unsubPipeline();
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
    <div class="w-[420px] p-6 bg-card border border-border rounded-xl shadow-lg">
      <h2 class="text-lg font-semibold text-foreground mb-1">Welcome to AgentForge</h2>
      <p class="text-sm text-muted-foreground mb-6">Set up your first project to get started.</p>

      {#if setupError}
        <div class="mb-4 px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          {setupError}
        </div>
      {/if}

      <form class="space-y-4" onsubmit={handleCreateProject}>
        <div>
          <label for="project-name" class="block text-xs font-medium text-muted-foreground mb-1.5">Project Name</label>
          <Input
            id="project-name"
            type="text"
            bind:value={setupName}
            placeholder="My Project"
            required
          />
        </div>

        <div>
          <label for="project-path" class="block text-xs font-medium text-muted-foreground mb-1.5">Project Folder</label>
          <div class="flex gap-2">
            <Input
              id="project-path"
              type="text"
              bind:value={setupPath}
              placeholder="Select a folder..."
              class="flex-1 font-mono"
              readonly
              required
            />
            <Button variant="outline" type="button" onclick={openBrowser}>
              Browse
            </Button>
          </div>
        </div>

        {#if setupPath}
          <div class="px-3 py-2 text-xs font-mono text-muted-foreground bg-muted rounded-lg border border-border truncate">
            {setupPath}
          </div>
        {/if}

        <Button variant="default" type="submit" disabled={!setupPath} class="w-full">
          Create Project
        </Button>
      </form>

      <!-- Directory Browser Modal -->
      {#if showBrowser}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="w-[520px] max-h-[70vh] flex flex-col bg-popover border border-border rounded-xl shadow-xl">
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 class="text-sm font-semibold text-foreground">Select Project Folder</h3>
              <button
                onclick={() => (showBrowser = false)}
                class="text-muted-foreground hover:text-foreground text-lg leading-none transition-colors"
              >&times;</button>
            </div>

            <!-- Current path -->
            <div class="px-4 py-2 border-b border-border bg-muted shrink-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono text-muted-foreground truncate flex-1">{browseCurrent}</span>
                {#if browseIsGitRepo}
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-chart-1/10 text-chart-1 shrink-0">git</span>
                {/if}
              </div>
            </div>

            <!-- Directory list -->
            <div class="flex-1 overflow-y-auto min-h-0">
              {#if browseLoading}
                <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading...</div>
              {:else}
                <!-- Parent directory -->
                {#if browseParent !== browseCurrent}
                  <button
                    class="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
                    onclick={() => loadDirectory(browseParent)}
                  >
                    <span class="text-muted-foreground">..</span>
                    <span class="text-muted-foreground text-xs">(parent)</span>
                  </button>
                {/if}

                {#each browseDirs as dir}
                  <button
                    class="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
                    onclick={() => loadDirectory(dir.path)}
                  >
                    <span class="text-primary/70 material-symbols-outlined text-[16px]">folder</span>
                    <span>{dir.name}</span>
                  </button>
                {/each}

                {#if browseDirs.length === 0}
                  <div class="px-4 py-6 text-center text-xs text-muted-foreground">No subdirectories</div>
                {/if}
              {/if}
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
              <Button variant="ghost" onclick={() => (showBrowser = false)}>Cancel</Button>
              <Button onclick={selectDirectory}>Select This Folder</Button>
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
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">search</span>
          <Input
            type="text"
            placeholder="Search tasks..."
            class="pl-9 w-48 focus:w-64 transition-all rounded-full h-8"
          />
        </div>

        <Separator orientation="vertical" class="h-6" />

        <!-- Icon Actions -->
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onclick={() => (showSetup = true)} title="Add Project">
            <span class="material-symbols-outlined text-[18px]">create_new_folder</span>
          </Button>
          <Button variant="ghost" size="icon-sm">
            <span class="material-symbols-outlined text-[18px]">notifications</span>
          </Button>
        </div>

        <Separator orientation="vertical" class="h-6" />

        <!-- Create Task Button -->
        <Button onclick={() => (showAddTask = true)}>
          <span class="material-symbols-outlined text-[16px] mr-1">add</span>
          Create Task
        </Button>
      {/snippet}
    </TopAppBar>

    <!-- Board Canvas -->
    <main class="flex-1 overflow-hidden flex flex-col p-6">
      <!-- Board Header -->
      <div class="flex justify-between items-center mb-6 shrink-0">
        <div class="flex items-center gap-4">
          <h2 class="text-2xl font-bold text-foreground tracking-tight">Active Board</h2>
        </div>
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="sm" class="text-muted-foreground">
            <span class="material-symbols-outlined text-[18px] mr-1">filter_list</span>
            Filter
          </Button>
        </div>
      </div>

      <!-- Kanban Board -->
      <div class="flex-1 overflow-hidden">
        {#if $isLoading && !$currentProject}
          <div class="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading...
          </div>
        {:else}
          <KanbanBoard onCreateTask={() => (showAddTask = true)} />
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
      <div class="w-[420px] p-6 bg-popover border border-border rounded-xl shadow-xl">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-foreground">Add Project</h2>
          <button
            onclick={() => { showSetup = false; setupName = ''; setupPath = ''; setupError = ''; }}
            class="text-muted-foreground hover:text-foreground text-lg leading-none transition-colors"
          >&times;</button>
        </div>

        {#if setupError}
          <div class="mb-4 px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
            {setupError}
          </div>
        {/if}

        <form class="space-y-4" onsubmit={handleCreateProject}>
          <div>
            <label for="modal-project-name" class="block text-xs font-medium text-muted-foreground mb-1.5">Project Name</label>
            <Input
              id="modal-project-name"
              type="text"
              bind:value={setupName}
              placeholder="My Project"
              required
            />
          </div>

          <div>
            <label for="modal-project-path" class="block text-xs font-medium text-muted-foreground mb-1.5">Project Folder</label>
            <div class="flex gap-2">
              <Input
                id="modal-project-path"
                type="text"
                bind:value={setupPath}
                placeholder="Select a folder..."
                class="flex-1 font-mono"
                readonly
                required
              />
              <Button variant="outline" type="button" onclick={openBrowser}>
                Browse
              </Button>
            </div>
          </div>

          {#if setupPath}
            <div class="px-3 py-2 text-xs font-mono text-muted-foreground bg-muted rounded-lg border border-border truncate">
              {setupPath}
            </div>
          {/if}

          <div class="flex justify-end gap-2">
            <Button variant="ghost" onclick={() => { showSetup = false; setupName = ''; setupPath = ''; setupError = ''; }}>
              Cancel
            </Button>
            <Button variant="default" type="submit" disabled={!setupPath}>
              Create Project
            </Button>
          </div>
        </form>

        <!-- Directory Browser Modal -->
        {#if showBrowser}
          <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div class="w-[520px] max-h-[70vh] flex flex-col bg-popover border border-border rounded-xl shadow-xl">
              <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <h3 class="text-sm font-semibold text-foreground">Select Project Folder</h3>
                <button
                  onclick={() => (showBrowser = false)}
                  class="text-muted-foreground hover:text-foreground text-lg leading-none transition-colors"
                >&times;</button>
              </div>

              <div class="px-4 py-2 border-b border-border bg-muted shrink-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono text-muted-foreground truncate flex-1">{browseCurrent}</span>
                  {#if browseIsGitRepo}
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-chart-1/10 text-chart-1 shrink-0">git</span>
                  {/if}
                </div>
              </div>

              <div class="flex-1 overflow-y-auto min-h-0">
                {#if browseLoading}
                  <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading...</div>
                {:else}
                  {#if browseParent !== browseCurrent}
                    <button
                      class="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
                      onclick={() => loadDirectory(browseParent)}
                    >
                      <span class="text-muted-foreground">..</span>
                      <span class="text-muted-foreground text-xs">(parent)</span>
                    </button>
                  {/if}

                  {#each browseDirs as dir}
                    <button
                      class="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
                      onclick={() => loadDirectory(dir.path)}
                    >
                      <span class="text-primary/70 material-symbols-outlined text-[16px]">folder</span>
                      <span>{dir.name}</span>
                    </button>
                  {/each}

                  {#if browseDirs.length === 0}
                    <div class="px-4 py-6 text-center text-xs text-muted-foreground">No subdirectories</div>
                  {/if}
                {/if}
              </div>

              <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
                <Button variant="ghost" onclick={() => (showBrowser = false)}>Cancel</Button>
                <Button onclick={selectDirectory}>Select This Folder</Button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}
