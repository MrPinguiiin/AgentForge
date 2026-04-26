<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    onclick,
    type = 'button',
    children,
  }: {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    onclick?: (e: MouseEvent) => void;
    type?: 'button' | 'submit' | 'reset';
    children: Snippet;
  } = $props();

  const variantClasses: Record<string, string> = {
    primary: 'bg-primary hover:bg-primary-dark text-white',
    secondary: 'bg-surface-lighter hover:bg-border text-text',
    danger: 'bg-danger/20 hover:bg-danger/30 text-danger',
    ghost: 'hover:bg-surface-light text-text-muted hover:text-text',
  };

  const sizeClasses: Record<string, string> = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-sm',
  };
</script>

<button
  {type}
  class="inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed {variantClasses[variant]} {sizeClasses[size]}"
  disabled={disabled || loading}
  {onclick}
>
  {#if loading}
    <svg class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  {/if}
  {@render children()}
</button>
