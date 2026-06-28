<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <div>
    <h1>{{ t('nav.pricing') }}</h1>
    <p class="muted">Тарифы и оплата (YooKassa на сайте, Stars в боте). {{ t('common.soon') }}</p>
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-muted);
}
</style>
