<script lang="ts">
  let {
    diff,
    filePath = '',
    maxHeight = '600px',
  }: {
    diff: string;
    filePath?: string;
    maxHeight?: string;
  } = $props();

  let viewMode = $state<'inline' | 'side-by-side'>('inline');

  interface DiffLine {
    type: 'add' | 'remove' | 'context' | 'header';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
  }

  interface SideBySidePair {
    left: { lineNum?: number; content: string; type: 'remove' | 'context' | 'header' | 'empty' };
    right: { lineNum?: number; content: string; type: 'add' | 'context' | 'header' | 'empty' };
  }

  function parseDiff(diffText: string): DiffLine[] {
    if (!diffText) return [];

    const lines = diffText.split('\n');
    const result: DiffLine[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLine = parseInt(match[1], 10);
          newLine = parseInt(match[2], 10);
        }
        result.push({ type: 'header', content: line });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        result.push({ type: 'add', content: line.slice(1), newLineNum: newLine });
        newLine++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        result.push({ type: 'remove', content: line.slice(1), oldLineNum: oldLine });
        oldLine++;
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        continue;
      } else {
        const content = line.startsWith(' ') ? line.slice(1) : line;
        result.push({ type: 'context', content, oldLineNum: oldLine, newLineNum: newLine });
        oldLine++;
        newLine++;
      }
    }

    return result;
  }

  function buildSideBySide(lines: DiffLine[]): SideBySidePair[] {
    const pairs: SideBySidePair[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.type === 'header') {
        pairs.push({
          left: { content: line.content, type: 'header' },
          right: { content: '', type: 'header' },
        });
        i++;
      } else if (line.type === 'context') {
        pairs.push({
          left: { lineNum: line.oldLineNum, content: line.content, type: 'context' },
          right: { lineNum: line.newLineNum, content: line.content, type: 'context' },
        });
        i++;
      } else if (line.type === 'remove') {
        // Collect consecutive removes
        const removes: DiffLine[] = [];
        while (i < lines.length && lines[i].type === 'remove') {
          removes.push(lines[i]);
          i++;
        }
        // Collect consecutive adds
        const adds: DiffLine[] = [];
        while (i < lines.length && lines[i].type === 'add') {
          adds.push(lines[i]);
          i++;
        }
        // Pair them up
        const maxLen = Math.max(removes.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          const rem = removes[j];
          const add = adds[j];
          pairs.push({
            left: rem
              ? { lineNum: rem.oldLineNum, content: rem.content, type: 'remove' }
              : { content: '', type: 'empty' },
            right: add
              ? { lineNum: add.newLineNum, content: add.content, type: 'add' }
              : { content: '', type: 'empty' },
          });
        }
      } else if (line.type === 'add') {
        pairs.push({
          left: { content: '', type: 'empty' },
          right: { lineNum: line.newLineNum, content: line.content, type: 'add' },
        });
        i++;
      } else {
        i++;
      }
    }

    return pairs;
  }

  let parsedLines = $derived(parseDiff(diff));
  let sideBySidePairs = $derived(buildSideBySide(parsedLines));

  // Stats
  let addCount = $derived(parsedLines.filter(l => l.type === 'add').length);
  let removeCount = $derived(parsedLines.filter(l => l.type === 'remove').length);

  const inlineColors: Record<string, string> = {
    add: 'bg-green-500/10',
    remove: 'bg-red-500/10',
    context: '',
    header: 'bg-blue-500/10',
  };

  const inlineTextColors: Record<string, string> = {
    add: 'text-green-600 dark:text-green-400',
    remove: 'text-red-600 dark:text-red-400',
    context: 'text-foreground',
    header: 'text-blue-600 dark:text-blue-400',
  };

  const sbsColors: Record<string, string> = {
    add: 'bg-green-500/10',
    remove: 'bg-red-500/10',
    context: '',
    header: 'bg-blue-500/5',
    empty: 'bg-muted/50',
  };
</script>

<div class="rounded-lg border border-border overflow-hidden">
  <!-- File header -->
  <div class="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border">
    <div class="flex items-center gap-2">
      {#if filePath}
        <span class="material-symbols-outlined text-[14px] text-muted-foreground">description</span>
        <span class="text-xs text-muted-foreground font-mono truncate">{filePath}</span>
      {/if}
      {#if addCount > 0 || removeCount > 0}
        <span class="text-[10px] font-mono text-green-600 dark:text-green-400">+{addCount}</span>
        <span class="text-[10px] font-mono text-red-600 dark:text-red-400">-{removeCount}</span>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <button
        class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors
          {viewMode === 'inline'
            ? 'bg-primary/10 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground border border-transparent'}"
        onclick={() => viewMode = 'inline'}
      >
        Inline
      </button>
      <button
        class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors
          {viewMode === 'side-by-side'
            ? 'bg-primary/10 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground border border-transparent'}"
        onclick={() => viewMode = 'side-by-side'}
      >
        Side-by-Side
      </button>
    </div>
  </div>

  <!-- Diff content -->
  {#if parsedLines.length === 0}
    <div class="px-3 py-8 text-xs text-muted-foreground text-center">
      <span class="material-symbols-outlined text-[24px] mb-2 block">difference</span>
      No diff content
    </div>
  {:else if viewMode === 'inline'}
    <!-- Inline mode -->
    <div class="overflow-x-auto" style="max-height: {maxHeight};">
      <table class="w-full text-[11px] font-mono leading-5 border-collapse">
        <tbody>
          {#each parsedLines as line}
            <tr class="{inlineColors[line.type]}">
              <td class="select-none text-right pr-1 pl-2 text-muted-foreground/40 w-[1%] whitespace-nowrap align-top" style="min-width: 36px;">
                {line.type === 'header' ? '' : line.oldLineNum ?? ''}
              </td>
              <td class="select-none text-right pr-2 text-muted-foreground/40 w-[1%] whitespace-nowrap align-top border-r border-border/50" style="min-width: 36px;">
                {line.type === 'header' ? '' : line.newLineNum ?? ''}
              </td>
              <td class="select-none w-[1%] px-1 {inlineTextColors[line.type]} align-top">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : line.type === 'header' ? '' : ' '}
              </td>
              <td class="pr-3 whitespace-pre-wrap break-all {inlineTextColors[line.type]} align-top">
                {line.content}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <!-- Side-by-side mode -->
    <div class="overflow-x-auto" style="max-height: {maxHeight};">
      <table class="w-full text-[11px] font-mono leading-5 border-collapse">
        <tbody>
          {#each sideBySidePairs as pair}
            <tr>
              <!-- Left (old) -->
              <td class="select-none text-right pr-1 pl-2 text-muted-foreground/40 w-[1%] whitespace-nowrap align-top {sbsColors[pair.left.type]}" style="min-width: 32px;">
                {pair.left.type === 'header' || pair.left.type === 'empty' ? '' : pair.left.lineNum ?? ''}
              </td>
              <td class="select-none w-[1%] px-1 align-top {sbsColors[pair.left.type]}
                {pair.left.type === 'remove' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/40'}">
                {pair.left.type === 'remove' ? '-' : pair.left.type === 'context' ? ' ' : ''}
              </td>
              <td class="pr-2 whitespace-pre-wrap break-all w-[48%] align-top border-r border-border {sbsColors[pair.left.type]}
                {pair.left.type === 'remove' ? 'text-red-600 dark:text-red-400' :
                 pair.left.type === 'header' ? 'text-blue-600 dark:text-blue-400' :
                 pair.left.type === 'empty' ? '' : 'text-foreground'}">
                {pair.left.content}
              </td>
              <!-- Right (new) -->
              <td class="select-none text-right pr-1 pl-2 text-muted-foreground/40 w-[1%] whitespace-nowrap align-top {sbsColors[pair.right.type]}" style="min-width: 32px;">
                {pair.right.type === 'header' || pair.right.type === 'empty' ? '' : pair.right.lineNum ?? ''}
              </td>
              <td class="select-none w-[1%] px-1 align-top {sbsColors[pair.right.type]}
                {pair.right.type === 'add' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/40'}">
                {pair.right.type === 'add' ? '+' : pair.right.type === 'context' ? ' ' : ''}
              </td>
              <td class="pr-2 whitespace-pre-wrap break-all w-[48%] align-top {sbsColors[pair.right.type]}
                {pair.right.type === 'add' ? 'text-green-600 dark:text-green-400' :
                 pair.right.type === 'header' ? '' :
                 pair.right.type === 'empty' ? '' : 'text-foreground'}">
                {pair.right.content}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
