<template>
  <span class="button-loader" aria-hidden="true">
    <span class="button-loader__spinner"/>
  </span>
</template>

<style scoped>
  .button-loader {
    pointer-events: none;
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  }

  .button-loader__spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid color-mix(in srgb, currentColor 28%, transparent);
    border-top-color: currentColor;
    border-radius: 999px;
    animation: button-loader-spin 0.72s linear infinite;
  }

  @keyframes button-loader-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
