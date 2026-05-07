<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { currentProject } from '$lib/stores/tasks.js';
  import TopAppBar from '$lib/components/common/TopAppBar.svelte';
  import * as api from '$lib/api/client.js';

  interface HistoryEntry {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    timestamp: number;
  }

  let cwd = $state('');
  let inputValue = $state('');
  let history = $state<HistoryEntry[]>([]);
  let isRunning = $state(false);
  let terminalEl: HTMLDivElement | undefined = $state();
  let inputEl: HTMLInputElement | undefined = $state();
  let commandHistory = $state<string[]>([]);
  let historyIndex = $state(-1);

  onMount(async () => {
    // Use the selected project's rootPath as cwd
    const project = get(currentProject);
    if (project?.rootPath) {
      cwd = project.rootPath;
    } else {
      try {
        const result = await api.terminalCwd();
        cwd = result.cwd;
      } catch {
        cwd = '~';
      }
    }
    inputEl?.focus();
  });

  // React to project changes
  $effect(() => {
    const project = $currentProject;
    if (project?.rootPath) {
      cwd = project.rootPath;
    }
  });

  function getShortCwd(fullPath: string): string {
    const home = '/home/' + (fullPath.split('/')[2] || '');
    if (fullPath.startsWith(home)) {
      return '~' + fullPath.slice(home.length);
    }
    // Show last 2 segments
    const parts = fullPath.split('/');
    if (parts.length > 3) {
      return '.../' + parts.slice(-2).join('/');
    }
    return fullPath;
  }

  async function handleSubmit() {
    const cmd = inputValue.trim();
    if (!cmd || isRunning) return;

    // Add to command history
    commandHistory = [cmd, ...commandHistory.filter((c) => c !== cmd)].slice(0, 50);
    historyIndex = -1;

    inputValue = '';
    isRunning = true;

    // Handle built-in commands
    if (cmd === 'clear') {
      history = [];
      isRunning = false;
      return;
    }

    if (cmd.startsWith('cd ')) {
      const newDir = cmd.slice(3).trim();
      try {
        // Resolve cd via server
        const result = await api.terminalExec(`cd ${newDir} && pwd`, cwd);
        if (result.exitCode === 0 && result.stdout) {
          cwd = result.stdout.trim();
          history = [...history, {
            command: cmd,
            stdout: '',
            stderr: '',
            exitCode: 0,
            timestamp: Date.now(),
          }];
        } else {
          history = [...history, {
            command: cmd,
            stdout: '',
            stderr: result.stderr || `cd: no such directory: ${newDir}`,
            exitCode: 1,
            timestamp: Date.now(),
          }];
        }
      } catch (err) {
        history = [...history, {
          command: cmd,
          stdout: '',
          stderr: String(err),
          exitCode: 1,
          timestamp: Date.now(),
        }];
      }
      isRunning = false;
      scrollToBottom();
      return;
    }

    try {
      const result = await api.terminalExec(cmd, cwd);
      history = [...history, {
        command: cmd,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timestamp: Date.now(),
      }];
    } catch (err) {
      history = [...history, {
        command: cmd,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: 1,
        timestamp: Date.now(),
      }];
    }

    isRunning = false;
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (terminalEl) {
        terminalEl.scrollTop = terminalEl.scrollHeight;
      }
      inputEl?.focus();
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        inputValue = commandHistory[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        inputValue = commandHistory[historyIndex];
      } else {
        historyIndex = -1;
        inputValue = '';
      }
    }
  }

  function handleTerminalClick() {
    inputEl?.focus();
  }
</script>

<svelte:head>
  <title>AgentForge - Terminal</title>
</svelte:head>

<div class="h-full flex flex-col overflow-hidden bg-surface-container-lowest">
  <!-- TopAppBar (shared navbar) -->
  <TopAppBar />

  <!-- Terminal Header -->
  <div class="flex items-center justify-between px-5 py-3 border-b border-outline-variant bg-surface shrink-0">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
        <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
        <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
      </div>
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary text-lg">terminal</span>
        <span class="text-sm font-medium text-on-surface">Terminal</span>
      </div>
    </div>
    <div class="flex items-center gap-3">
      {#if $currentProject}
        <span class="text-[10px] px-2 py-0.5 rounded bg-surface-container-highest text-secondary font-mono border border-outline-variant">
          {$currentProject.name}
        </span>
      {/if}
      <span class="text-[10px] text-secondary font-mono">{getShortCwd(cwd)}</span>
    </div>
  </div>

  <!-- Terminal Body -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={terminalEl}
    class="flex-1 overflow-y-auto p-4 font-mono text-sm cursor-text"
    onclick={handleTerminalClick}
  >
    <!-- Welcome message -->
    {#if history.length === 0}
      <div class="text-text-muted mb-4 space-y-1">
        <p class="text-green-400">AgentForge Terminal</p>
        <p class="text-text-muted text-xs">Connected to project directory. Type commands below.</p>
        <p class="text-text-muted text-xs">Type <span class="text-yellow-400">clear</span> to clear, <span class="text-yellow-400">cd &lt;dir&gt;</span> to navigate.</p>
        <p></p>
      </div>
    {/if}

    <!-- History -->
    {#each history as entry}
      <div class="mb-3">
        <!-- Prompt + command -->
        <div class="flex items-start gap-0">
          <span class="text-green-400 shrink-0">$</span>
          <span class="text-text ml-2">{entry.command}</span>
        </div>

        <!-- stdout -->
        {#if entry.stdout}
          <pre class="text-text/90 mt-0.5 whitespace-pre-wrap break-all text-[13px] leading-5">{entry.stdout}</pre>
        {/if}

        <!-- stderr -->
        {#if entry.stderr}
          <pre class="text-red-400/90 mt-0.5 whitespace-pre-wrap break-all text-[13px] leading-5">{entry.stderr}</pre>
        {/if}

        <!-- Exit code indicator for non-zero -->
        {#if entry.exitCode !== 0 && !entry.stderr}
          <span class="text-red-400 text-xs">exit code: {entry.exitCode}</span>
        {/if}
      </div>
    {/each}

    <!-- Current input line -->
    <div class="flex items-center gap-0">
      <span class="text-green-400 shrink-0">$</span>
      <form onsubmit={handleSubmit} class="flex-1 ml-2">
        <input
          bind:this={inputEl}
          bind:value={inputValue}
          onkeydown={handleKeydown}
          disabled={isRunning}
          class="w-full bg-transparent text-text outline-none caret-green-400 placeholder:text-text-muted/30 font-mono text-sm"
          placeholder={isRunning ? 'Running...' : ''}
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
        />
      </form>
      {#if isRunning}
        <span class="text-yellow-400 animate-pulse text-xs ml-2">running...</span>
      {/if}
    </div>
  </div>
</div>
