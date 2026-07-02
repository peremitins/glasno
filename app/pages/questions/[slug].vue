<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import type { QuestionBankItemResponse } from '@/shared/dto';

  const { t } = useI18n();
  const route = useRoute();
  const api = useAPI();

  const slug = computed(() => String(route.params.slug || ''));
  const { data, pending } = await useLazyAsyncData(
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
  <div class="question-detail-page app-page">
    <NuxtLink to="/questions" class="inline-back">{{
      t('questions.back')
    }}</NuxtLink>

    <GlassSkeletonStack
      v-if="pending"
      class="question-detail-skeleton"
      :heights="[156, 146, 146, 112]"
    />

    <template v-else-if="data?.item">
      <header class="app-page-header glass-frame glass-frame--soft">
        <p class="page-kicker">
          {{ data.item.domainLabel }} ·
          {{ t(`questions.types.${data.item.type}`) }}
        </p>
        <h1 class="page-title">{{ data.item.question }}</h1>
        <NuxtLink
          class="primary-action primary-action--compact"
          :to="trainLink"
        >
          {{ t('questions.train') }}
        </NuxtLink>
      </header>

      <section class="panel glass-frame">
        <h2>{{ t('questions.strongAnswer') }}</h2>
        <p>{{ data.item.strongAnswer }}</p>
      </section>

      <section class="panel glass-frame">
        <h2>{{ t('questions.commonMistakes') }}</h2>
        <p>{{ data.item.commonMistakes }}</p>
      </section>

      <section v-if="data.related.length" class="panel glass-frame">
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
  .question-detail-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .panel {
    display: grid;
    gap: 10px;
    padding: clamp(18px, 2.2vw, 26px);
  }

  .panel h2 {
    color: var(--text-primary);
    font-size: 18px;
  }

  .panel p,
  .muted {
    color: var(--text-muted);
    line-height: 1.55;
  }

  .related {
    display: grid;
    gap: 8px;
  }

  .related a {
    color: var(--text-primary);
    text-decoration: none;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
    padding: 12px;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out);
  }

  .related a:hover {
    transform: translateY(-2px);
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
  }

  @media (max-width: 640px) {
    .primary-action {
      width: 100%;
    }
  }
</style>
