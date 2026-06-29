<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { QuestionBankItemResponse } from '@/shared/dto';

const { t } = useI18n();
const route = useRoute();
const api = useAPI();

const slug = computed(() => String(route.params.slug || ''));
const { data, pending } = await useAsyncData(
  () => `question-${slug.value}`,
  () => api<QuestionBankItemResponse>(`/api/question-bank/${slug.value}`)
);

const trainLink = computed(() => ({
  path: '/interview/new',
  query: {
    source: 'profession',
    role: data.value?.item.role || data.value?.item.domainLabel || '',
  },
}));
</script>

<template>
  <div class="page">
    <NuxtLink to="/questions" class="back">{{ t('questions.back') }}</NuxtLink>

    <p v-if="pending" class="muted">{{ t('common.loading') }}</p>

    <template v-else-if="data?.item">
      <header class="header">
        <p class="eyebrow">
          {{ data.item.domainLabel }} · {{ t(`questions.types.${data.item.type}`) }}
        </p>
        <h1>{{ data.item.question }}</h1>
        <NuxtLink class="primary" :to="trainLink">
          {{ t('questions.train') }}
        </NuxtLink>
      </header>

      <section class="panel">
        <h2>{{ t('questions.strongAnswer') }}</h2>
        <p>{{ data.item.strongAnswer }}</p>
      </section>

      <section class="panel">
        <h2>{{ t('questions.commonMistakes') }}</h2>
        <p>{{ data.item.commonMistakes }}</p>
      </section>

      <section v-if="data.related.length" class="panel">
        <h2>{{ t('questions.related') }}</h2>
        <div class="related">
          <NuxtLink
            v-for="item in data.related"
            :key="item.slug"
            :to="`/questions/${item.slug}`"
          >
            {{ item.question }}
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.back {
  color: var(--color-accent);
  font-weight: 800;
  text-decoration: none;
}

.header,
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 20px;
}

.header {
  display: grid;
  gap: 14px;
}

.eyebrow {
  margin: 0;
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  max-width: 900px;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.08;
}

.panel {
  display: grid;
  gap: 10px;
}

.panel h2 {
  font-size: 18px;
}

.panel p,
.muted {
  color: var(--color-muted);
  line-height: 1.55;
}

.primary {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: 8px;
  background: var(--color-accent);
  color: #fff;
  padding: 0 16px;
  text-decoration: none;
  font-weight: 800;
}

.related {
  display: grid;
  gap: 8px;
}

.related a {
  color: var(--color-text);
  text-decoration: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
}

@media (max-width: 640px) {
  .primary {
    width: 100%;
  }
}
</style>
