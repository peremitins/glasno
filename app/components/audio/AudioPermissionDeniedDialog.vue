<script setup lang="ts">
import BrowserPermissionDialog from '@/app/components/permissions/BrowserPermissionDialog.vue';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();
</script>

<template>
  <BrowserPermissionDialog
    :open="open"
    subject="sound"
    @update:open="emit('update:open', $event)"
  />
</template>

<style scoped>
/* Keeps Vite HMR style requests valid after the component was reduced to a wrapper. */
</style>
