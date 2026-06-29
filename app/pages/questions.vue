<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { QuestionBankListResponse } from '@/shared/dto';

const { t } = useI18n();
const api = useAPI();

const search = ref('');
const domain = ref('');
const role = ref('');
const type = ref('');

const { data, pending } = await useAsyncData('question-bank', () =>
  api<QuestionBankListResponse>('/api/question-bank')
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value?.items || []).filter((item) => {
    if (domain.value && item.domain !== domain.value) return false;
    if (role.value && item.role !== role.value) return false;
    if (type.value && item.type !== type.value) return false;
    if (q) {
      const text = [item.question, item.role, item.domainLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
});
</script>

<template>
  <div class="page">
    <header class="header">
      <p class="eyebrow">{{ t('nav.questionBank') }}</p>
      <h1>{{ t('questions.title') }}</h1>
      <p>{{ t('questions.subtitle') }}</p>
    </header>

    <section class="filters">
      <label>
        <span>{{ t('questions.search') }}</span>
        <input v-model="search" type="search" />
      </label>
      <label>
        <span>{{ t('questions.domain') }}</span>
        <select v-model="domain">
          <option value="">{{ t('questions.all') }}</option>
          <option v-for="item in data?.facets.domains || []" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
      </label>
      <label>
        <span>{{ t('questions.role') }}</span>
        <select v-model="role">
          <option value="">{{ t('questions.all') }}</option>
          <option v-for="item in data?.facets.roles || []" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
      </label>
      <label>
        <span>{{ t('questions.type') }}</span>
        <select v-model="type">
          <option value="">{{ t('questions.all') }}</option>
          <option v-for="item in data?.facets.types || []" :key="item" :value="item">
            {{ t(`questions.types.${item}`) }}
          </option>
        </select>
      </label>
    </section>

    <section class="grid">
      <p v-if="pending" class="muted">{{ t('common.loading') }}</p>
      <p v-else-if="!filtered.length" class="muted">{{ t('questions.empty') }}</p>
      <template v-else>
        <NuxtLink
          v-for="item in filtered"
          :key="item.slug"
          class="question"
          :to="`/questions/${item.slug}`"
        >
          <span>{{ item.domainLabel }} · {{ t(`questions.types.${item.type}`) }}</span>
          <h2>{{ item.question }}</h2>
          <p>{{ item.role || t('questions.all') }}</p>
        </NuxtLink>
      </template>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.header {
  max-width: 780px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin: 0;
}

.header h1 {
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1.06;
  margin-bottom: 10px;
}

.header p:last-child,
.muted,
.question p {
  color: var(--color-muted);
}

.filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.3fr) repeat(3, minmax(160px, 1fr));
  gap: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
}

label {
  display: grid;
  gap: 6px;
}

label span {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 800;
}

input,
select {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  padding: 9px 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.question {
  display: grid;
  gap: 10px;
  min-height: 190px;
  color: var(--color-text);
  text-decoration: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
}

.question span {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 900;
}

.question h2 {
  font-size: 20px;
  line-height: 1.2;
}

@media (max-width: 900px) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 620px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
