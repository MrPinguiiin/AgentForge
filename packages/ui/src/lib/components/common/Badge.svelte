<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'default',
    children,
  }: {
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
    children: Snippet;
  } = $props();

  const variantClasses: Record<string, string> = {
    default: 'bg-surface-lighter text-text-muted',
    success: 'bg-green-500/20 text-success',
    warning: 'bg-yellow-500/20 text-warning',
    danger: 'bg-red-500/20 text-danger',
    info: 'bg-blue-500/20 text-info',
    primary: 'bg-primary/20 text-primary-light',
  };
</script>

<span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium {variantClasses[variant]}">
  {@render children()}
</span>
