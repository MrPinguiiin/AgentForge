<script lang="ts">
  let {
    diff = '',
    activeFile = '',
    onFileSelect,
  }: {
    diff: string;
    activeFile?: string;
    onFileSelect?: (filePath: string) => void;
  } = $props();

  interface FileChange {
    path: string;
    action: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
  }

  function parseFileChanges(diffText: string): FileChange[] {
    if (!diffText) return [];

    const files: FileChange[] = [];
    const lines = diffText.split('\n');
    let currentFile: FileChange | null = null;

    for (const line of lines) {
      // Detect file headers
      if (line.startsWith('diff --git')) {
        // Save previous file
        if (currentFile) files.push(currentFile);

        // Parse file path from "diff --git a/path b/path"
        const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
        const filePath = match ? match[2] : '';
        currentFile = { path: filePath, action: 'modified', additions: 0, deletions: 0 };
      } else if (line.startsWith('new file mode')) {
        if (currentFile) currentFile.action = 'added';
      } else if (line.startsWith('deleted file mode')) {
        if (currentFile) currentFile.action = 'deleted';
      } else if (line.startsWith('rename from')) {
        if (currentFile) currentFile.action = 'renamed';
      } else if (currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.deletions++;
        }
      }
    }

    // Don't forget the last file
    if (currentFile) files.push(currentFile);

    return files;
  }

  let fileChanges = $derived(parseFileChanges(diff));
  let totalAdditions = $derived(fileChanges.reduce((sum, f) => sum + f.additions, 0));
  let totalDeletions = $derived(fileChanges.reduce((sum, f) => sum + f.deletions, 0));

  const actionIcons: Record<string, { icon: string; color: string }> = {
    added: { icon: 'add_circle', color: 'text-green-600 dark:text-green-400' },
    modified: { icon: 'edit', color: 'text-amber-600 dark:text-amber-400' },
    deleted: { icon: 'remove_circle', color: 'text-red-600 dark:text-red-400' },
    renamed: { icon: 'drive_file_rename_outline', color: 'text-blue-600 dark:text-blue-400' },
  };

  function getFileName(path: string): string {
    return path.split('/').pop() ?? path;
  }

  function getFileDir(path: string): string {
    const parts = path.split('/');
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/') + '/';
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="px-3 py-2 border-b border-border">
    <div class="flex items-center justify-between">
      <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Changed Files</span>
      <span class="text-[10px] font-mono text-muted-foreground">{fileChanges.length}</span>
    </div>
    <div class="flex items-center gap-2 mt-1">
      <span class="text-[10px] font-mono text-green-600 dark:text-green-400">+{totalAdditions}</span>
      <span class="text-[10px] font-mono text-red-600 dark:text-red-400">-{totalDeletions}</span>
    </div>
  </div>

  <!-- File list -->
  <div class="flex-1 overflow-y-auto">
    {#each fileChanges as file}
      {@const actionStyle = actionIcons[file.action] ?? actionIcons.modified}
      <button
        class="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors border-b border-border/50
          {activeFile === file.path ? 'bg-primary/5 border-l-2 border-l-primary' : ''}"
        onclick={() => onFileSelect?.(file.path)}
        title={file.path}
      >
        <span class="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0 {actionStyle.color}" style="font-variation-settings: 'FILL' 1;">
          {actionStyle.icon}
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-foreground truncate">{getFileName(file.path)}</div>
          {#if getFileDir(file.path)}
            <div class="text-[10px] text-muted-foreground font-mono truncate">{getFileDir(file.path)}</div>
          {/if}
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          {#if file.additions > 0}
            <span class="text-[10px] font-mono text-green-600 dark:text-green-400">+{file.additions}</span>
          {/if}
          {#if file.deletions > 0}
            <span class="text-[10px] font-mono text-red-600 dark:text-red-400">-{file.deletions}</span>
          {/if}
        </div>
      </button>
    {/each}

    {#if fileChanges.length === 0}
      <div class="flex flex-col items-center justify-center py-8 text-center px-3">
        <span class="material-symbols-outlined text-[24px] text-muted-foreground mb-2">folder_open</span>
        <p class="text-xs text-muted-foreground">No file changes detected</p>
      </div>
    {/if}
  </div>
</div>
