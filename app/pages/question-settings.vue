<script setup lang="ts">
  import {
    MagnifyingGlassIcon,
    ReloadIcon,
    CheckIcon,
    EyeNoneIcon,
    TrashIcon,
  } from '@radix-icons/vue';
  import { computed, ref } from 'vue';
  import type {
    QuestionPreference,
    QuestionPreferenceListResponse,
    QuestionPreferenceStatus,
  } from '@/shared/dto';
  import QuestionPreferenceMenu from '@/app/components/interview/QuestionPreferenceMenu.vue';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';

  const api = useAPI();
  const activeStatus = ref<QuestionPreferenceStatus>('repeat');
  const search = ref('');
  const roleKey = ref('');
  const pendingId = ref<string | null>(null);
  const feedback = ref('');

  const { data, pending, refresh } = await useLazyAsyncData(
    'question-preferences',
    () => api<QuestionPreferenceListResponse>('/api/question-preferences')
  );

  const tabs: Array<{
    value: QuestionPreferenceStatus;
    label: string;
    description: string;
    icon: typeof ReloadIcon;
  }> = [
    {
      value: 'repeat',
      label: 'Повторять',
      description: 'Вернутся в подходящих интервью',
      icon: ReloadIcon,
    },
    {
      value: 'mastered',
      label: 'Освоено',
      description: 'Сняты с обязательного повторения',
      icon: CheckIcon,
    },
    {
      value: 'hidden',
      label: 'Не показывать',
      description: 'Исключены из похожих интервью',
      icon: EyeNoneIcon,
    },
  ];

  const roles = computed(() => {
    const values = new Map<string, string>();
    for (const item of data.value?.items ?? []) {
      values.set(item.roleKey, item.roleLabel);
    }
    return [...values.entries()].sort((left, right) =>
      left[1].localeCompare(right[1], 'ru')
    );
  });

  const filteredItems = computed(() => {
    const query = search.value.trim().toLowerCase();
    return (data.value?.items ?? []).filter((item) => {
      if (item.status !== activeStatus.value) return false;
      if (roleKey.value && item.roleKey !== roleKey.value) return false;
      if (query && !item.question.toLowerCase().includes(query)) return false;
      return true;
    });
  });

  function count(status: QuestionPreferenceStatus): number {
    return data.value?.counts[status] ?? 0;
  }

  async function updateStatus(
    item: QuestionPreference,
    status: QuestionPreferenceStatus
  ) {
    if (pendingId.value || item.status === status) return;
    pendingId.value = item.id;
    feedback.value = '';
    try {
      await api<QuestionPreference>(`/api/question-preferences/${item.id}`, {
        method: 'PATCH',
        body: { status },
      });
      await refresh();
      activeStatus.value = status;
      feedback.value = 'Настройка обновлена';
    } catch {
      feedback.value = 'Не удалось обновить настройку';
    } finally {
      pendingId.value = null;
    }
  }

  async function removePreference(item: QuestionPreference) {
    if (pendingId.value) return;
    pendingId.value = item.id;
    feedback.value = '';
    try {
      await api(`/api/question-preferences/${item.id}`, { method: 'DELETE' });
      await refresh();
      feedback.value = 'Настройка удалена';
    } catch {
      feedback.value = 'Не удалось удалить настройку';
    } finally {
      pendingId.value = null;
    }
  }

  function levelLabel(level: QuestionPreference['level']) {
    return level.charAt(0).toUpperCase() + level.slice(1);
  }

  function formatDate(value: string | null) {
    if (!value) return 'Ещё не повторялся';
    return `Последняя практика ${new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))}`;
  }
</script>

<template>
  <div class="question-settings-page app-page">
    <header class="question-settings-header glass-frame glass-frame--soft">
      <div>
        <p class="panel-label">Персональная подготовка</p>
        <h1>Настройки вопросов</h1>
        <p>Управляйте вопросами, которые отметили во время собеседований.</p>
      </div>
    </header>

    <div class="preference-tabs" role="tablist" aria-label="Статус вопроса">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        class="preference-tab glass-frame glass-frame--soft"
        :class="{ 'preference-tab--active': activeStatus === tab.value }"
        :aria-selected="activeStatus === tab.value"
        @click="activeStatus = tab.value"
      >
        <component :is="tab.icon" aria-hidden="true" />
        <span>
          <strong>{{ tab.label }}</strong>
          <small>{{ tab.description }}</small>
        </span>
        <b>{{ count(tab.value) }}</b>
      </button>
    </div>

    <section class="preference-toolbar glass-frame glass-frame--soft">
      <label class="preference-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input v-model="search" type="search" placeholder="Найти вопрос" />
      </label>
      <label class="preference-role-filter">
        <span class="sr-only">Профессиональный контекст</span>
        <select v-model="roleKey">
          <option value="">Все профессии</option>
          <option v-for="role in roles" :key="role[0]" :value="role[0]">
            {{ role[1] }}
          </option>
        </select>
      </label>
    </section>

    <GlassSkeletonStack
      v-if="pending && !data"
      class="question-settings-skeleton"
      :heights="[104, 104, 104]"
    />

    <section
      v-else-if="filteredItems.length"
      class="preference-list glass-frame glass-frame--soft"
      aria-live="polite"
    >
      <article
        v-for="item in filteredItems"
        :key="item.id"
        class="preference-row"
      >
        <div class="preference-row__copy">
          <p>{{ item.question }}</p>
          <div class="preference-row__meta">
            <span>{{ item.roleLabel }}</span>
            <span>{{ levelLabel(item.level) }}</span>
            <span v-if="item.contextTags.length">
              {{ item.contextTags.join(' · ') }}
            </span>
            <span>{{ formatDate(item.lastPracticedAt) }}</span>
          </div>
        </div>
        <div class="preference-row__actions">
          <QuestionPreferenceMenu
            :model-value="item.status"
            :loading="pendingId === item.id"
            @select="updateStatus(item, $event)"
          />
          <button
            v-tooltip="'Удалить настройку'"
            type="button"
            class="preference-delete"
            :disabled="pendingId === item.id"
            aria-label="Удалить настройку"
            @click="removePreference(item)"
          >
            <TrashIcon aria-hidden="true" />
          </button>
        </div>
      </article>
    </section>

    <section v-else class="preference-empty glass-frame glass-frame--soft">
      <component
        :is="tabs.find((tab) => tab.value === activeStatus)?.icon"
        aria-hidden="true"
      />
      <h2>Здесь пока нет вопросов</h2>
      <p>
        Отметьте вопрос во время интервью — он появится в соответствующем
        разделе.
      </p>
      <NuxtLink
        to="/interview/new"
        class="primary-action primary-action--compact"
      >
        Начать интервью
      </NuxtLink>
    </section>

    <p class="sr-only" aria-live="polite">{{ feedback }}</p>
  </div>
</template>

<style scoped>
  .question-settings-page {
    display: grid;
    gap: 18px;
    margin: 0 auto;
  }
  .question-settings-header {
    padding: clamp(15px, 2.2vw, 26px);
  }
  .question-settings-header h1 {
    margin: 4px 0 8px;
    font-size: var(--page-title-size);
    line-height: 1.05;
  }
  .question-settings-header p:last-child {
    max-width: 680px;
    margin: 0;
    color: var(--text-secondary);
  }
  .preference-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .preference-tab {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 14px;
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
  }
  .preference-tab > svg {
    width: 20px;
    height: 20px;
  }
  .preference-tab span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .preference-tab strong {
    color: var(--text-primary);
    font-size: 14px;
  }
  .preference-tab small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preference-tab b {
    min-width: 26px;
    padding: 4px 7px;
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-primary);
    font-size: 12px;
    text-align: center;
  }
  .preference-tab--active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-border));
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-soft));
  }
  .preference-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(190px, 280px);
    gap: 10px;
    padding: 10px;
  }
  .preference-search {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    background: var(--surface-soft);
  }
  .preference-search svg {
    color: var(--text-muted);
  }
  .preference-search input,
  .preference-role-filter select {
    width: 100%;
    min-height: 42px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 13px;
  }
  .preference-role-filter select {
    padding: 0 12px;
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    background: var(--surface-soft);
  }
  .preference-list {
    overflow: hidden;
  }
  .preference-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 16px;
  }
  .preference-row + .preference-row {
    border-top: 1px solid var(--glass-border);
  }
  .preference-row__copy {
    min-width: 0;
  }
  .preference-row__copy > p {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.45;
  }
  .preference-row__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    color: var(--text-muted);
    font-size: 11px;
  }
  .preference-row__meta span + span::before {
    content: '·';
    margin-right: 12px;
  }
  .preference-row__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .preference-delete {
    display: inline-grid;
    place-items: center;
    width: 42px;
    height: 42px;
    padding: 0;
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--surface-soft);
    color: var(--text-muted);
    cursor: pointer;
  }
  .preference-delete:hover:not(:disabled) {
    color: var(--danger);
  }
  .preference-delete svg {
    width: 17px;
    height: 17px;
  }
  .preference-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: clamp(32px, 8vw, 72px) 20px;
    text-align: center;
  }
  .preference-empty > svg {
    width: 26px;
    height: 26px;
    color: var(--text-muted);
  }
  .preference-empty h2,
  .preference-empty p {
    margin: 0;
  }
  .preference-empty p {
    max-width: 460px;
    color: var(--text-secondary);
  }
  .preference-empty .primary-action {
    margin-top: 8px;
  }
  @media (max-width: 760px) {
    .preference-tabs {
      grid-template-columns: 1fr;
    }
    .preference-toolbar,
    .preference-row {
      grid-template-columns: 1fr;
    }
    .preference-row__actions {
      justify-content: space-between;
    }
  }
</style>
