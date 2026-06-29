<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { InterviewHistoryResponse } from '@/shared/dto';

const { t } = useI18n();
const api = useAPI();

const { data, pending } = await useAsyncData('interview-history', () =>
  api<InterviewHistoryResponse>('/api/interview/sessions/history')
);

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
</script>

<template>
  <div class="page">
    <header class="header">
      <p class="eyebrow">{{ t('nav.history') }}</p>
      <h1>{{ t('history.title') }}</h1>
      <p>{{ t('history.subtitle') }}</p>
    </header>

    <section class="panel">
      <div v-if="pending" class="muted">{{ t('common.loading') }}</div>
      <div v-else-if="data?.items.length" class="list">
        <article v-for="item in data.items" :key="item.id" class="row">
          <div class="main">
            <span class="status">{{ t(`common.status.${item.status}`) }}</span>
            <h2>{{ item.title }}</h2>
            <p>
              {{ item.subtitle || item.role || t('interview.session.subtitle') }}
            </p>
          </div>
          <div class="meta">
            <span>{{ formatDate(item.createdAt) }}</span>
            <strong>
              {{
                item.report?.overallScore
                  ? t('common.score', { score: item.report.overallScore })
                  : t('history.progress', {
                      answered: item.answeredQuestions,
                      total: item.totalQuestions,
                    })
              }}
            </strong>
          </div>
          <div class="actions">
            <NuxtLink
              v-if="item.status === 'running'"
              class="primary"
              :to="`/interview/${item.id}`"
            >
              {{ t('history.continue') }}
            </NuxtLink>
            <NuxtLink
              v-else-if="item.report?.id"
              class="primary"
              :to="`/interview/report/${item.report.id}`"
            >
              {{ t('history.openReport') }}
            </NuxtLink>
            <NuxtLink v-else class="ghost" :to="`/interview/${item.id}`">
              {{ t('nav.history') }}
            </NuxtLink>
          </div>
        </article>
      </div>
      <div v-else class="empty">
        <p>{{ t('history.empty') }}</p>
        <NuxtLink to="/interview/new" class="primary">
          {{ t('history.newInterview') }}
        </NuxtLink>
      </div>
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
  max-width: 760px;
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
.main p,
.meta,
.muted {
  color: var(--color-muted);
}

.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 18px;
}

.list {
  display: grid;
  gap: 10px;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px auto;
  gap: 14px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
}

.main {
  min-width: 0;
}

.main h2 {
  font-size: 18px;
  margin: 4px 0;
}

.status {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.meta {
  display: grid;
  gap: 5px;
  font-size: 13px;
}

.meta strong {
  color: var(--color-text);
  font-size: 17px;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.primary,
.ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  border-radius: 8px;
  padding: 0 14px;
  text-decoration: none;
  font-weight: 800;
  white-space: nowrap;
}

.primary {
  color: #fff;
  background: var(--color-accent);
}

.ghost {
  color: var(--color-text);
  background: var(--color-bg);
}

.empty {
  display: grid;
  gap: 14px;
  justify-items: start;
}

@media (max-width: 760px) {
  .row {
    grid-template-columns: 1fr;
  }

  .actions {
    justify-content: stretch;
  }

  .primary,
  .ghost {
    width: 100%;
  }
}
</style>
