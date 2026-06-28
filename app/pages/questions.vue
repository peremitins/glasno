<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <div>
    <h1>{{ t('nav.questionBank') }}</h1>
    <p class="muted">
      Каталог вопросов по сферам/ролям (своя LLM-база). SEO + тренировка.
      {{ t('common.soon') }}
    </p>
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-muted);
}
</style>
