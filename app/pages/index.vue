<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Заглушка здоровья API — проверка, что бэкенд жив.
const { data: health } = await useFetch('/api/health');
</script>

<template>
  <div class="dash">
    <h1>{{ t('app.name') }}</h1>
    <p class="tagline">{{ t('app.tagline') }}</p>

    <section class="cta">
      <div>
        <h2>{{ t('dashboard.startCta') }}</h2>
        <p>{{ t('dashboard.startHint') }}</p>
      </div>
      <NuxtLink to="/interview/new" class="btn">{{ t('dashboard.startCta') }}</NuxtLink>
    </section>

    <section class="grid">
      <div class="card">
        <h3>{{ t('dashboard.progress') }}</h3>
        <p class="muted">{{ t('common.soon') }}</p>
      </div>
      <div class="card">
        <h3>{{ t('dashboard.fixBeforeInterview') }}</h3>
        <p class="muted">{{ t('common.soon') }}</p>
      </div>
    </section>

    <p class="health">API: {{ health?.status ?? '—' }}</p>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
h1 {
  margin: 0;
  font-size: 26px;
}
.tagline {
  margin: 0;
  color: var(--color-muted);
}
.cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 22px;
}
.cta h2 {
  margin: 0 0 4px;
}
.cta p {
  margin: 0;
  color: var(--color-muted);
}
.btn {
  background: var(--color-accent);
  color: #fff;
  text-decoration: none;
  padding: 12px 20px;
  border-radius: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 18px;
}
.card h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.muted {
  color: var(--color-muted);
  margin: 0;
}
.health {
  color: var(--color-muted);
  font-size: 13px;
}
</style>
