<script setup lang="ts">
  withDefaults(
    defineProps<{
      heights?: number[];
    }>(),
    {
      heights: () => [42, 118, 196, 132, 110, 88],
    }
  );
</script>

<template>
  <div class="glass-skeleton-stack" aria-hidden="true">
    <section
      v-for="height in heights"
      :key="height"
      class="glass-skeleton-block"
      :style="{ height: `${height}px` }"
    />
  </div>
</template>

<style scoped>
  .glass-skeleton-stack {
    display: grid;
    gap: 10px;
  }

  .glass-skeleton-block {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-raised) 74%, transparent),
        color-mix(in srgb, var(--surface-soft) 88%, transparent)
      ),
      var(--surface-soft);
    box-shadow: inset 1px 1px 0
        color-mix(in srgb, var(--inner-highlight) 82%, transparent),
      0 12px 28px color-mix(in srgb, var(--app-bg) 24%, transparent);
    animation: glass-skeleton-pulse 1.8s ease-in-out infinite;
  }

  @keyframes glass-skeleton-pulse {
    0%,
    100% {
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
  }
</style>
