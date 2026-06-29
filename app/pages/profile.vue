<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <div>
    <h1>{{ t('nav.profile') }}</h1>
    <p class="muted">Аккаунт, привязка Telegram, история оплат, согласия. {{ t('common.soon') }}</p>
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-muted);
}
</style>
