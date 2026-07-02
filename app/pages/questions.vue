<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import type { QuestionBankListResponse } from '@/shared/dto';

  const { t } = useI18n();
  const api = useAPI();

  const search = ref('');
  const domain = ref('');
  const role = ref('');
  const type = ref('');

  const { data, pending } = await useLazyAsyncData('question-bank', () =>
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
  <div class="questions-page app-page">
    <section class="filters glass-frame glass-frame--soft">
      <label>
        <span>{{ t('questions.search') }}</span>
        <input v-model="search" class="soft-control" type="search" />
      </label>
      <label>
        <span>{{ t('questions.domain') }}</span>
        <select v-model="domain" class="soft-control">
          <option value="">{{ t('questions.all') }}</option>
          <option
            v-for="item in data?.facets.domains || []"
            :key="item"
            :value="item"
          >
            {{ item }}
          </option>
        </select>
      </label>
      <label>
        <span>{{ t('questions.role') }}</span>
        <select v-model="role" class="soft-control">
          <option value="">{{ t('questions.all') }}</option>
          <option
            v-for="item in data?.facets.roles || []"
            :key="item"
            :value="item"
          >
            {{ item }}
          </option>
        </select>
      </label>
      <label>
        <span>{{ t('questions.type') }}</span>
        <select v-model="type" class="soft-control">
          <option value="">{{ t('questions.all') }}</option>
          <option
            v-for="item in data?.facets.types || []"
            :key="item"
            :value="item"
          >
            {{ t(`questions.types.${item}`) }}
          </option>
        </select>
      </label>
    </section>

    <section class="grid">
      <GlassSkeletonStack
        v-if="pending"
        class="questions-skeleton"
        :heights="[172, 172, 172, 172, 172, 172]"
      />
      <p v-else-if="!filtered.length" class="muted">
        {{ t('questions.empty') }}
      </p>
      <template v-else>
        <NuxtLink
          v-for="item in filtered"
          :key="item.slug"
          class="question glass-frame glass-frame--soft glass-frame--interactive"
          :to="`/questions/${item.slug}`"
        >
          <span
            >{{ item.domainLabel }} ·
            {{ t(`questions.types.${item.type}`) }}</span
          >
          <h2>{{ item.question }}</h2>
          <p>{{ item.role || t('questions.all') }}</p>
        </NuxtLink>
      </template>
    </section>
  </div>
</template>

<style scoped>
  .questions-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .muted,
  .question p {
    color: var(--text-muted);
  }

  .filters {
    display: grid;
    grid-template-columns: minmax(220px, 1.3fr) repeat(3, minmax(160px, 1fr));
    gap: 10px;
    padding: clamp(14px, 1.8vw, 18px);
  }

  label {
    display: grid;
    gap: 6px;
  }

  label span {
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 800;
  }

  input,
  select {
    width: 100%;
    min-height: 42px;
    padding: 9px 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: clamp(12px, 1.6vw, 16px);
  }

  .question {
    display: grid;
    gap: 10px;
    min-height: 190px;
    color: var(--text-primary);
    text-decoration: none;
    padding: 16px;
  }

  .question span {
    color: var(--accent-2);
    font-family: var(--font-mono);
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
