<script lang="ts">
  let {
    diff,
    filePath = '',
  }: {
    diff: string;
    filePath?: string;
  } = $props();

  interface DiffLine {
    type: 'add' | 'remove' | 'context' | 'header';
    content: string;
    lineNum?: number;
  }

  function parseDiff(diffText: string): DiffLine[] {
    if (!diffText) return [];

    const lines = diffText.split('\n');
    const result: DiffLine[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        result.push({ type: 'header', content: line });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        result.push({ type: 'add', content: line.slice(1) });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        result.push({ type: 'remove', content: line.slice(1) });
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        // Skip file headers
        continue;
      } else {
        result.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line });
      }
    }

    return result;
  }

  let parsedLines = $derived(parseDiff(diff));

  const lineColors: Record<string, string> = {
    add: 'bg-green-500/10 text-green-400',
    remove: 'bg-red-500/10 text-red-400',
    context: 'text-muted-foreground',
    header: 'bg-blue-500/10 text-blue-400',
  };

  const linePrefix: Record<string, string> = {
    add: '+',
    remove: '-',
    context: ' ',
    header: '',
  };
</script>

<div class="rounded-lg border border-border overflow-hidden">
  {#if filePath}
    <div class="px-3 py-1.5 bg-muted border-b border-border text-xs text-muted-foreground font-mono">
      {filePath}
    </div>
  {/if}

  <div class="overflow-x-auto max-h-96">
    <pre class="text-[11px] font-mono leading-5">{#each parsedLines as line}<div class="px-3 {lineColors[line.type]}"><span class="select-none text-muted-foreground/50 mr-2">{linePrefix[line.type]}</span>{line.content}</div>{/each}</pre>
  </div>

  {#if parsedLines.length === 0}
    <div class="px-3 py-4 text-xs text-muted-foreground text-center">
      No diff content
    </div>
  {/if}
</div>
