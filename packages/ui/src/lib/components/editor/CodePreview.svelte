<script lang="ts">
  let {
    code,
    language = 'text',
    filePath = '',
    maxHeight = '400px',
  }: {
    code: string;
    language?: string;
    filePath?: string;
    maxHeight?: string;
  } = $props();

  let lines = $derived(code ? code.split('\n') : []);
</script>

<div class="rounded-lg border border-border overflow-hidden">
  {#if filePath}
    <div class="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border">
      <span class="text-xs text-muted-foreground font-mono">{filePath}</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{language}</span>
    </div>
  {/if}

  <div class="overflow-auto" style="max-height: {maxHeight}">
    <pre class="text-[11px] font-mono leading-5 p-0"><code>{#each lines as line, i}<div class="flex hover:bg-accent/50"><span class="select-none text-muted-foreground/40 text-right w-10 pr-3 shrink-0 inline-block">{i + 1}</span><span class="text-foreground flex-1">{line}</span></div>{/each}</code></pre>
  </div>

  {#if lines.length === 0}
    <div class="px-3 py-4 text-xs text-muted-foreground text-center">
      No content
    </div>
  {/if}
</div>
