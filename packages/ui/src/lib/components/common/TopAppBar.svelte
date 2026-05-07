<script lang="ts">
  import {
    currentProject,
    projects,
    selectProject,
  } from '$lib/stores/tasks.js';
  import type { Snippet } from 'svelte';

  let {
    actions,
  }: {
    actions?: Snippet;
  } = $props();

  function handleProjectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const project = $projects.find((p) => p.id === select.value);
    if (project) selectProject(project);
  }
</script>

<header class="w-full h-16 border-b border-outline-variant bg-background flex justify-between items-center px-8 sticky top-0 z-40 shrink-0">
  <!-- Left: Project Selector -->
  <div class="flex items-center gap-6">
    <div class="flex items-center gap-2 cursor-pointer group">
      <div class="h-6 w-6 rounded bg-surface-container-highest border border-outline-variant flex items-center justify-center group-hover:border-primary transition-colors">
        <span class="text-xs font-bold text-on-surface">
          {$currentProject?.name?.charAt(0).toUpperCase() ?? 'P'}
        </span>
      </div>
      {#if $projects.length > 1}
        <select
          class="font-bold text-on-surface text-lg tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer appearance-none pr-6"
          value={$currentProject?.id ?? ''}
          onchange={handleProjectChange}
        >
          {#each $projects as project}
            <option value={project.id} class="bg-surface-container text-on-surface">Project: {project.name}</option>
          {/each}
        </select>
        <span class="material-symbols-outlined text-secondary text-sm group-hover:text-on-surface transition-colors -ml-4">unfold_more</span>
      {:else if $currentProject}
        <span class="font-bold text-on-surface text-lg tracking-tight">Project: {$currentProject.name}</span>
      {/if}
    </div>

    {#if $currentProject?.framework}
      <span class="text-xs px-2 py-0.5 rounded bg-surface-container-highest text-secondary border border-outline-variant">
        {$currentProject.framework}
      </span>
    {/if}
  </div>

  <!-- Right: Actions -->
  <div class="flex items-center gap-4">
    {#if actions}
      {@render actions()}
    {/if}
  </div>
</header>
