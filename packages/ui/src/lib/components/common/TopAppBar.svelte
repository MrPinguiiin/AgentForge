<script lang="ts">
  import {
    currentProject,
    projects,
    selectProject,
  } from '$lib/stores/tasks.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
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

<header class="w-full h-14 border-b border-border bg-background flex justify-between items-center px-6 sticky top-0 z-40 shrink-0">
  <!-- Left: Project Selector -->
  <div class="flex items-center gap-4">
    <div class="flex items-center gap-2 cursor-pointer group">
      <div class="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
        <span class="text-xs font-bold text-primary">
          {$currentProject?.name?.charAt(0).toUpperCase() ?? 'P'}
        </span>
      </div>
      {#if $projects.length > 1}
        <select
          class="font-semibold text-foreground text-base tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer appearance-none pr-6"
          value={$currentProject?.id ?? ''}
          onchange={handleProjectChange}
        >
          {#each $projects as project}
            <option value={project.id} class="bg-popover text-popover-foreground">{project.name}</option>
          {/each}
        </select>
        <span class="material-symbols-outlined text-muted-foreground text-sm group-hover:text-foreground transition-colors -ml-4">unfold_more</span>
      {:else if $currentProject}
        <span class="font-semibold text-foreground text-base tracking-tight">{$currentProject.name}</span>
      {/if}
    </div>

    {#if $currentProject?.framework}
      <Badge variant="outline" class="text-xs">{$currentProject.framework}</Badge>
    {/if}
  </div>

  <!-- Right: Actions -->
  <div class="flex items-center gap-3">
    {#if actions}
      {@render actions()}
    {/if}
  </div>
</header>
