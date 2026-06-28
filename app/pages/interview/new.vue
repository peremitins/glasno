<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <div>
    <h1>{{ t('nav.newInterview') }}</h1>
    <p class="muted">
      Мастер настройки интервью: источник (вакансия hh.ru / текст / профессия),
      параметры, аватар интервьюера. {{ t('common.soon') }}
    </p>
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-muted);
}
</style>
