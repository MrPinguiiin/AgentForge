<script lang="ts">
  import {
    currentProject,
    projects,
    selectProject,
  } from '$lib/stores/tasks.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import type { Snippet } from 'svelte';

  let {
    actions,
  }: {
    actions?: Snippet;
  } = $props();

  let selectedProjectId = $state($currentProject?.id ?? '');

  // Sync when currentProject changes externally
  $effect(() => {
    selectedProjectId = $currentProject?.id ?? '';
  });

  // React to select changes
  $effect(() => {
    if (selectedProjectId && selectedProjectId !== $currentProject?.id) {
      const project = $projects.find((p) => p.id === selectedProjectId);
      if (project) selectProject(project);
    }
  });
</script>

<header class="w-full h-14 border-b border-border bg-background flex justify-between items-center px-6 sticky top-0 z-40 shrink-0">
  <!-- Left: Project Selector -->
  <div class="flex items-center gap-4">
    <div class="flex items-center gap-2">
      <div class="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
        <span class="text-xs font-bold text-primary">
          {$currentProject?.name?.charAt(0).toUpperCase() ?? 'P'}
        </span>
      </div>
      {#if $projects.length > 1}
        <Select.Root type="single" bind:value={selectedProjectId}>
          <Select.Trigger class="border-none shadow-none bg-transparent font-semibold text-foreground text-base tracking-tight h-auto py-1 px-2 hover:bg-accent">
            {$currentProject?.name ?? 'Select project'}
          </Select.Trigger>
          <Select.Content>
            {#each $projects as project}
              <Select.Item value={project.id} label={project.name}>{project.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
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
