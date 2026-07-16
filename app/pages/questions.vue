<script setup lang="ts">
  import {
    CheckIcon,
    ChevronDownIcon,
    Cross2Icon,
    EyeNoneIcon,
    MagnifyingGlassIcon,
    MixerHorizontalIcon,
    ReloadIcon,
  } from '@radix-icons/vue';
  import { refDebounced } from '@vueuse/core';
  import { computed, reactive, ref, watch } from 'vue';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import QuestionPreferenceMenu from '@/app/components/interview/QuestionPreferenceMenu.vue';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/app/components/ui/shadcn';
  import { useAuthStore } from '@/app/stores/auth';
  import type {
    AdminQuestionBankItem,
    AdminQuestionBankListResponse,
    QuestionPreference,
    QuestionPreferenceListResponse,
    QuestionPreferenceStatus,
  } from '@/shared/dto';

  const auth = useAuthStore();
  const api = useAPI();
  const isAdmin = computed(() => auth.user?.role === 'admin');
  const search = ref('');
  const debouncedSearch = refDebounced(search, 300);
  const advancedFiltersOpen = ref(false);
  const expandedIds = ref(new Set<string>());
  const pendingPreferenceId = ref<string | null>(null);
  const preferenceFeedback = ref('');
  const filters = reactive({
    role: '',
    framework: '',
    topic: '',
    interviewType: '',
    seniority: '',
    difficulty: '',
    preferenceStatus: '',
    page: 1,
    pageSize: 25,
  });

  const query = computed(() =>
    Object.fromEntries(
      Object.entries({
        q: debouncedSearch.value.trim() || undefined,
        ...filters,
      }).filter(([, value]) => value !== '' && value !== undefined)
    )
  );

  const { data, pending, error, refresh } = await useLazyAsyncData(
    'question-bank-catalog',
    () =>
      api<AdminQuestionBankListResponse>('/api/question-bank/catalog', {
        query: query.value,
      }),
    { watch: [query] }
  );
  const { data: preferenceData, refresh: refreshPreferenceData } =
    await useLazyAsyncData('question-bank-preferences', () =>
      api<QuestionPreferenceListResponse>('/api/question-preferences')
    );

  const pageCount = computed(() =>
    Math.max(1, Math.ceil((data.value?.total ?? 0) / filters.pageSize))
  );
  const activeFilterCount = computed(
    () =>
      Object.entries(filters).filter(
        ([key, value]) => !['page', 'pageSize'].includes(key) && value !== ''
      ).length + (debouncedSearch.value.trim() ? 1 : 0)
  );

  watch(debouncedSearch, () => {
    filters.page = 1;
  });

  function applyFilter() {
    filters.page = 1;
  }

  function updateFilter(
    key: Exclude<keyof typeof filters, 'page' | 'pageSize'>,
    value: unknown
  ) {
    filters[key] = value === '__all__' ? '' : String(value ?? '');
    applyFilter();
  }

  function updatePageSize(value: unknown) {
    const nextPageSize = Number(value);
    if (![25, 50, 100].includes(nextPageSize)) return;
    filters.pageSize = nextPageSize;
    applyFilter();
  }

  function resetFilters() {
    search.value = '';
    Object.assign(filters, {
      role: '',
      framework: '',
      topic: '',
      interviewType: '',
      seniority: '',
      difficulty: '',
      preferenceStatus: '',
      page: 1,
      pageSize: 25,
    });
  }

  function isExpanded(id: string) {
    return expandedIds.value.has(id);
  }

  function toggleQuestion(id: string) {
    const next = new Set(expandedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedIds.value = next;
  }

  function facetLabel(value: string) {
    const labels: Record<string, string> = {
      none: 'Без фреймворка',
      react: 'React',
      vue: 'Vue',
      angular: 'Angular',
      javascript: 'JavaScript',
      web_platform: 'Web Platform',
      typescript: 'TypeScript',
      engineering: 'Архитектура и качество',
      interview_practice: 'Практика интервью',
      technical: 'Технический',
      behavioral: 'Поведенческий',
      live_coding: 'Live coding',
      system_design: 'System design',
      junior: 'Junior',
      middle: 'Middle',
      senior: 'Senior',
      pending: 'Ожидает проверки',
      passed: 'Проверено',
      rejected: 'Отклонено',
      review: 'На ревью',
      published: 'Опубликовано',
      deprecated: 'Устарело',
    };
    return labels[value] ?? value;
  }

  function visibleRange() {
    if (!data.value?.total) return '0';
    const first = (filters.page - 1) * filters.pageSize + 1;
    const last = Math.min(filters.page * filters.pageSize, data.value.total);
    return `${first}–${last}`;
  }

  function sourceLink(item: AdminQuestionBankItem) {
    return item.provenance?.sourceUrl ?? item.provenance?.repositoryUrl ?? null;
  }

  function preferenceLabel(status: QuestionPreferenceStatus | null) {
    if (status === 'repeat') return 'Повторять';
    if (status === 'mastered') return 'Освоено';
    if (status === 'hidden') return 'Не показывать';
    return 'Без отметки';
  }

  function preferenceIcon(status: QuestionPreferenceStatus | null) {
    if (status === 'repeat') return ReloadIcon;
    if (status === 'mastered') return CheckIcon;
    if (status === 'hidden') return EyeNoneIcon;
    return null;
  }

  async function updatePreference(
    item: AdminQuestionBankItem,
    status: QuestionPreferenceStatus
  ) {
    if (pendingPreferenceId.value || item.preference?.status === status) return;
    pendingPreferenceId.value = item.id;
    preferenceFeedback.value = '';
    try {
      await api<QuestionPreference>('/api/question-preferences/bank', {
        method: 'POST',
        body: { questionId: item.id, status },
      });
      await Promise.all([refresh(), refreshPreferenceData()]);
      preferenceFeedback.value = `Для вопроса выбрано: ${preferenceLabel(
        status
      )}`;
    } catch {
      preferenceFeedback.value = 'Не удалось сохранить настройку вопроса';
    } finally {
      pendingPreferenceId.value = null;
    }
  }

  async function clearPreference(item: AdminQuestionBankItem) {
    if (pendingPreferenceId.value || !item.preference) return;
    pendingPreferenceId.value = item.id;
    preferenceFeedback.value = '';
    try {
      await api(`/api/question-preferences/${item.preference.id}`, {
        method: 'DELETE',
      });
      await Promise.all([refresh(), refreshPreferenceData()]);
      preferenceFeedback.value = 'Отметка вопроса удалена';
    } catch {
      preferenceFeedback.value = 'Не удалось удалить отметку вопроса';
    } finally {
      pendingPreferenceId.value = null;
    }
  }
</script>

<template>
  <div class="questions-admin-page app-page">
    <section
      class="summary-strip glass-frame glass-frame--soft"
      aria-label="Сводка базы вопросов"
    >
      <template v-if="isAdmin">
        <div>
          <span>С ответом</span>
          <strong>{{ data?.summary.withAnswers ?? '—' }}</strong>
        </div>
        <div>
          <span>Ждут техпроверки</span>
          <strong>{{ data?.summary.pendingTechnical ?? '—' }}</strong>
        </div>
        <div>
          <span>Опубликовано</span>
          <strong>{{ data?.summary.published ?? '—' }}</strong>
        </div>
        <div>
          <span>По текущему фильтру</span>
          <strong>{{ data?.total ?? '—' }}</strong>
        </div>
      </template>
      <template v-else>
        <div>
          <span>В базе</span>
          <strong>{{ data?.summary.total ?? '—' }}</strong>
        </div>
        <div>
          <span>Повторять</span>
          <strong>{{ preferenceData?.counts.repeat ?? 0 }}</strong>
        </div>
        <div>
          <span>Освоено</span>
          <strong>{{ preferenceData?.counts.mastered ?? 0 }}</strong>
        </div>
        <div>
          <span>Не показывать</span>
          <strong>{{ preferenceData?.counts.hidden ?? 0 }}</strong>
        </div>
      </template>
    </section>

    <section class="filter-panel glass-frame glass-frame--soft">
      <div class="primary-filters">
        <label class="search-field">
          <span>Поиск</span>
          <span class="control-with-icon">
            <MagnifyingGlassIcon aria-hidden="true" />
            <input
              v-model="search"
              class="soft-control"
              type="search"
              placeholder="Вопрос, подтема или термин"
            />
          </span>
        </label>
        <label>
          <span>Должность</span>
          <Select
            :model-value="filters.role || '__all__'"
            @update:model-value="updateFilter('role', $event)"
          >
            <SelectTrigger class="question-select-trigger">
              <SelectValue placeholder="Все должности" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все должности</SelectItem>
              <SelectItem
                v-for="facet in data?.facets.roles ?? []"
                :key="facet.value"
                :value="facet.value"
              >
                {{ facet.value }} · {{ facet.count }}
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>Стек</span>
          <Select
            :model-value="filters.framework || '__all__'"
            @update:model-value="updateFilter('framework', $event)"
          >
            <SelectTrigger class="question-select-trigger">
              <SelectValue placeholder="Все стеки" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все стеки</SelectItem>
              <SelectItem
                v-for="facet in data?.facets.frameworks ?? []"
                :key="facet.value"
                :value="facet.value"
              >
                {{ facetLabel(facet.value) }} · {{ facet.count }}
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>Уровень</span>
          <Select
            :model-value="filters.seniority || '__all__'"
            @update:model-value="updateFilter('seniority', $event)"
          >
            <SelectTrigger class="question-select-trigger">
              <SelectValue placeholder="Все уровни" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все уровни</SelectItem>
              <SelectItem
                v-for="facet in data?.facets.seniorities ?? []"
                :key="facet.value"
                :value="facet.value"
              >
                {{ facetLabel(facet.value) }} · {{ facet.count }}
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div class="filter-actions">
        <button
          type="button"
          class="secondary-action"
          :aria-expanded="advancedFiltersOpen"
          aria-controls="advanced-question-filters"
          @click="advancedFiltersOpen = !advancedFiltersOpen"
        >
          <MixerHorizontalIcon aria-hidden="true" />
          Дополнительные фильтры
          <span v-if="activeFilterCount">{{ activeFilterCount }}</span>
        </button>
        <button
          v-if="activeFilterCount"
          type="button"
          class="quiet-action"
          @click="resetFilters"
        >
          <Cross2Icon aria-hidden="true" />
          Сбросить
        </button>
      </div>

      <div
        id="advanced-question-filters"
        class="advanced-filters-shell"
        :class="{ 'advanced-filters-shell--open': advancedFiltersOpen }"
      >
        <div>
          <div class="advanced-filters">
            <label>
              <span>Раздел</span>
              <Select
                :model-value="filters.topic || '__all__'"
                @update:model-value="updateFilter('topic', $event)"
              >
                <SelectTrigger class="question-select-trigger">
                  <SelectValue placeholder="Все разделы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Все разделы</SelectItem>
                  <SelectItem
                    v-for="facet in data?.facets.topics ?? []"
                    :key="facet.value"
                    :value="facet.value"
                  >
                    {{ facetLabel(facet.value) }} · {{ facet.count }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Тип интервью</span>
              <Select
                :model-value="filters.interviewType || '__all__'"
                @update:model-value="updateFilter('interviewType', $event)"
              >
                <SelectTrigger class="question-select-trigger">
                  <SelectValue placeholder="Все типы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Все типы</SelectItem>
                  <SelectItem
                    v-for="facet in data?.facets.interviewTypes ?? []"
                    :key="facet.value"
                    :value="facet.value"
                  >
                    {{ facetLabel(facet.value) }} · {{ facet.count }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Сложность</span>
              <Select
                :model-value="filters.difficulty || '__all__'"
                @update:model-value="updateFilter('difficulty', $event)"
              >
                <SelectTrigger class="question-select-trigger">
                  <SelectValue placeholder="Любая" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Любая</SelectItem>
                  <SelectItem
                    v-for="level in 5"
                    :key="level"
                    :value="String(level)"
                  >
                    {{ level }} из 5
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Моя отметка</span>
              <Select
                :model-value="filters.preferenceStatus || '__all__'"
                @update:model-value="updateFilter('preferenceStatus', $event)"
              >
                <SelectTrigger class="question-select-trigger">
                  <SelectValue placeholder="Все вопросы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Все вопросы</SelectItem>
                  <SelectItem value="repeat">Повторять</SelectItem>
                  <SelectItem value="mastered">Освоено</SelectItem>
                  <SelectItem value="hidden">Не показывать</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>
      </div>
    </section>

    <div class="results-toolbar glass-frame glass-frame--soft">
      <p>
        <strong>{{ data?.total ?? 0 }}</strong>
        {{ data?.total === 1 ? 'вопрос' : 'вопросов' }}
        <span v-if="data?.total">· показаны {{ visibleRange() }}</span>
      </p>
      <label>
        <span>На странице</span>
        <Select
          :model-value="String(filters.pageSize)"
          @update:model-value="updatePageSize"
        >
          <SelectTrigger size="sm" class="question-page-size-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>

    <GlassSkeletonStack
      v-if="pending && !data"
      class="questions-skeleton"
      :heights="[120, 120, 120, 120]"
    />

    <section
      v-else-if="error"
      class="state-panel glass-frame glass-frame--soft"
    >
      <ReloadIcon aria-hidden="true" />
      <h2>Не удалось загрузить вопросы</h2>
      <p>Проверьте подключение к базе данных и повторите запрос.</p>
      <button type="button" class="secondary-action" @click="() => refresh()">
        Повторить
      </button>
    </section>

    <section
      v-else-if="!data?.items.length"
      class="state-panel glass-frame glass-frame--soft"
    >
      <MagnifyingGlassIcon aria-hidden="true" />
      <h2>По этим фильтрам ничего нет</h2>
      <p>Сбросьте часть условий или измените поисковый запрос.</p>
      <button type="button" class="secondary-action" @click="resetFilters">
        Сбросить фильтры
      </button>
    </section>

    <section v-else class="question-list" aria-label="Вопросы">
      <article
        v-for="(item, index) in data.items"
        :key="item.id"
        class="question-row glass-frame glass-frame--soft"
        :class="{ 'question-row--expanded': isExpanded(item.id) }"
        :style="{ '--row-index': index }"
      >
        <div class="question-row-head">
          <button
            type="button"
            class="question-trigger"
            :aria-expanded="isExpanded(item.id)"
            :aria-controls="`question-body-${item.id}`"
            @click="toggleQuestion(item.id)"
          >
            <span class="question-index">{{
              String(
                (filters.page - 1) * filters.pageSize + index + 1
              ).padStart(3, '0')
            }}</span>
            <span class="question-main">
              <span class="question-meta">
                <b>{{ item.role }}</b>
                <span>{{ facetLabel(item.framework) }}</span>
                <span>{{ facetLabel(item.seniority) }}</span>
                <span>Сложность {{ item.difficulty }}/5</span>
              </span>
              <strong>{{ item.question }}</strong>
              <small
                >{{ facetLabel(item.topic)
                }}<template v-if="item.subtopic">
                  · {{ item.subtopic }}</template
                ></small
              >
            </span>
          </button>
          <div class="question-preference-cell">
            <span
              v-if="item.preference?.status"
              class="preference-indicator"
              :data-status="item.preference.status"
            >
              <component
                :is="preferenceIcon(item.preference.status)"
                aria-hidden="true"
              />
              {{ preferenceLabel(item.preference.status) }}
            </span>
            <QuestionPreferenceMenu
              :model-value="item.preference?.status ?? null"
              :loading="pendingPreferenceId === item.id"
              compact
              @select="updatePreference(item, $event)"
            />
          </div>
          <ChevronDownIcon class="question-chevron" aria-hidden="true" />
        </div>

        <div
          :id="`question-body-${item.id}`"
          class="question-body-shell"
          :class="{ 'question-body-shell--open': isExpanded(item.id) }"
        >
          <div>
            <div class="question-body">
              <section class="answer-panel">
                <p class="section-label">Ответ</p>
                <div v-if="item.answer" class="answer-copy">
                  {{ item.answer }}
                </div>
                <div v-else class="answer-empty">
                  <strong>Ответ пока не добавлен</strong>
                  <p>
                    Вопрос останется на редакторской проверке до появления
                    проверенного ответа.
                  </p>
                </div>
              </section>

              <aside class="question-details">
                <section v-if="item.expectedConcepts.length">
                  <p class="section-label">Что должен раскрыть кандидат</p>
                  <ul>
                    <li v-for="concept in item.expectedConcepts" :key="concept">
                      {{ concept }}
                    </li>
                  </ul>
                </section>
                <section v-if="item.variants.length">
                  <p class="section-label">Другие формулировки</p>
                  <ul>
                    <li v-for="variant in item.variants" :key="variant">
                      {{ variant }}
                    </li>
                  </ul>
                </section>
                <template v-if="isAdmin">
                  <section>
                    <p class="section-label">Происхождение</p>
                    <p>
                      {{ item.provenance?.sourceName ?? 'Источник не указан' }}
                    </p>
                    <a
                      v-if="sourceLink(item)"
                      :href="sourceLink(item) ?? undefined"
                      target="_blank"
                      rel="noreferrer"
                      >Открыть источник</a
                    >
                  </section>
                  <section v-if="item.provenance?.answerSources.length">
                    <p class="section-label">Источники ответа</p>
                    <a
                      v-for="answerSource in item.provenance.answerSources"
                      :key="answerSource.url"
                      :href="answerSource.url"
                      target="_blank"
                      rel="noreferrer"
                      >{{ answerSource.name }}</a
                    >
                  </section>
                </template>
              </aside>

              <footer class="question-footer">
                <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
                <button
                  v-if="item.preference"
                  type="button"
                  class="clear-preference"
                  :disabled="pendingPreferenceId === item.id"
                  @click="clearPreference(item)"
                >
                  Снять отметку
                </button>
                <code>{{ item.corpusId ?? item.id }}</code>
              </footer>
            </div>
          </div>
        </div>
      </article>
    </section>

    <nav v-if="pageCount > 1" class="pagination" aria-label="Страницы вопросов">
      <button
        type="button"
        class="quiet-action"
        :disabled="filters.page <= 1"
        @click="filters.page -= 1"
      >
        Назад
      </button>
      <span>Страница {{ filters.page }} из {{ pageCount }}</span>
      <button
        type="button"
        class="quiet-action"
        :disabled="filters.page >= pageCount"
        @click="filters.page += 1"
      >
        Дальше
      </button>
    </nav>
    <p class="sr-only" aria-live="polite">{{ preferenceFeedback }}</p>
  </div>
</template>

<style scoped>
  .questions-admin-page {
    display: grid;
    width: min(1440px, 100%);
    margin: 0 auto;
    gap: 16px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  button,
  input {
    font: inherit;
  }

  .question-main small,
  .results-toolbar,
  .state-panel p,
  .answer-empty p,
  .question-details {
    color: var(--text-muted);
  }

  .summary-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-block: 1px solid var(--glass-border);
  }

  .summary-strip div {
    display: grid;
    padding: 14px 18px;
    gap: 4px;
  }

  .summary-strip div + div {
    border-left: 1px solid var(--glass-border);
  }

  .summary-strip span {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .summary-strip strong {
    font-family: var(--font-mono);
    font-size: 24px;
  }

  .filter-panel {
    display: grid;
    padding: 16px;
    gap: 14px;
  }

  .primary-filters {
    display: grid;
    grid-template-columns: minmax(280px, 1.5fr) repeat(3, minmax(150px, 1fr));
    gap: 10px;

    label {
      display: block;
    }
  }

  label {
    display: grid;
    min-width: 0;
    gap: 6px;
  }

  label > span:first-child,
  .section-label {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 850;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .soft-control {
    width: 100%;
    min-height: 44px;
    padding: 9px 11px;
  }

  .question-select-trigger,
  .question-page-size-select {
    width: 100%;
  }

  .control-with-icon {
    position: relative;
    display: block;
  }

  .control-with-icon svg {
    position: absolute;
    top: 50%;
    left: 13px;
    width: 17px;
    height: 17px;
    color: var(--text-muted);
    transform: translateY(-50%);
    pointer-events: none;
  }

  .control-with-icon input {
    padding-left: 40px;
  }

  .filter-actions,
  .results-toolbar,
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .filter-actions {
    justify-content: flex-start;
  }

  .secondary-action,
  .quiet-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 8px 12px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-weight: 750;
    gap: 8px;
    cursor: pointer;
    transition: transform var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }

  .secondary-action:hover,
  .quiet-action:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .secondary-action:active,
  .quiet-action:active:not(:disabled) {
    transform: scale(0.98);
  }

  .secondary-action svg,
  .quiet-action svg {
    width: 15px;
    height: 15px;
  }

  .secondary-action > span {
    display: grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--surface-raised);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .advanced-filters-shell,
  .question-body-shell {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition: grid-template-rows var(--motion-normal) var(--ease-out),
      opacity var(--motion-fast) var(--ease-out);
  }

  .advanced-filters-shell > div,
  .question-body-shell > div {
    min-height: 0;
    overflow: hidden;
  }

  .advanced-filters-shell--open,
  .question-body-shell--open {
    grid-template-rows: 1fr;
    opacity: 1;
  }

  .advanced-filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    padding-top: 2px;
    gap: 10px;
  }

  .results-toolbar {
    padding: 10px 14px;
  }

  .results-toolbar p {
    font-size: 13px;
  }

  .results-toolbar strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
  }

  .results-toolbar label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .question-page-size-select {
    width: 78px;
  }

  .question-list {
    display: grid;
    gap: 8px;
  }

  .question-row {
    overflow: hidden;
    animation: row-enter var(--motion-normal) var(--ease-out) both;
    animation-delay: min(calc(var(--row-index) * 18ms), 220ms);
  }

  .question-row-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
  }

  .question-preference-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preference-indicator {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 5px 9px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 800;
    gap: 6px;
    white-space: nowrap;
  }

  .preference-indicator svg {
    width: 14px;
    height: 14px;
  }

  .preference-indicator[data-status='repeat'] {
    border-color: color-mix(in srgb, var(--accent) 42%, var(--glass-border));
    color: var(--accent-2);
  }

  .preference-indicator[data-status='mastered'] {
    border-color: color-mix(in srgb, var(--success) 38%, var(--glass-border));
    color: var(--success);
  }

  .preference-indicator[data-status='hidden'] {
    color: var(--text-muted);
    opacity: 0.82;
  }

  @keyframes row-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  .question-trigger {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    padding: 16px 18px;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    gap: 14px;
    cursor: pointer;
  }

  .question-trigger:active {
    transform: scale(0.998);
  }

  .question-index {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .question-main {
    display: grid;
    min-width: 0;
    gap: 6px;
  }

  .question-main > strong {
    font-size: 15px;
    line-height: 1.45;
  }

  .question-main small {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .question-meta {
    display: flex;
    flex-wrap: wrap;
    color: var(--text-muted);
    font-size: 10px;
    gap: 5px 10px;
  }

  .question-meta b {
    color: var(--text-secondary);
  }

  .question-chevron {
    width: 18px;
    height: 18px;
    margin-right: 16px;
    margin-left: 5px;
    color: var(--text-muted);
    transition: transform var(--motion-normal) var(--ease-out);
  }

  .question-row--expanded .question-chevron {
    transform: rotate(180deg);
  }

  .question-body {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.8fr);
    border-top: 1px solid var(--glass-border);
  }

  .answer-panel,
  .question-details {
    display: grid;
    align-content: start;
    padding: 20px;
    gap: 12px;
  }

  .answer-copy {
    font-size: 12px;
    white-space: pre-wrap;
    line-height: 1.65;
  }

  .answer-empty {
    display: grid;
    padding: 16px;
    border-left: 2px solid var(--glass-border-strong);
    background: var(--surface-soft);
    gap: 5px;
  }

  .question-details {
    border-left: 1px solid var(--glass-border);
  }

  .question-details section {
    display: grid;
    gap: 8px;
  }

  .question-details ul {
    display: grid;
    margin: 0;
    padding-left: 18px;
    gap: 6px;
  }

  .question-details li,
  .question-details p,
  .question-details a {
    font-size: 12px;
    line-height: 1.5;
  }

  .question-details a {
    width: fit-content;
    color: var(--accent-2);
  }

  .question-footer {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    padding: 12px 20px;
    border-top: 1px solid var(--glass-border);
    gap: 6px;
  }

  .question-footer span {
    padding: 4px 7px;
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-muted);
    font-size: 10px;
  }

  .question-footer code {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 10px;
  }

  .clear-preference {
    margin-left: auto;
    padding: 4px 7px;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 10px;
    cursor: pointer;
  }

  .clear-preference:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .clear-preference + code {
    margin-left: 0;
  }

  .state-panel {
    display: grid;
    place-items: center;
    min-height: 300px;
    padding: 36px;
    text-align: center;
    gap: 10px;
  }

  .state-panel > svg {
    width: 28px;
    height: 28px;
    color: var(--text-muted);
  }

  .state-panel p {
    max-width: 48ch;
  }

  .pagination {
    justify-content: center;
    padding: 8px 0 2px;
  }

  .pagination span {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .quiet-action:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    .question-row {
      animation: none;
    }
  }

  @media (max-width: 1100px) {
    .primary-filters,
    .advanced-filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .question-trigger {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .preference-indicator {
      width: 28px;
      overflow: hidden;
      padding-inline: 6px;
      color: transparent !important;
      gap: 0;
    }

    .preference-indicator svg {
      flex: 0 0 14px;
      color: var(--text-secondary);
    }
  }

  @media (max-width: 700px) {
    .questions-admin-page {
      gap: 12px;
    }

    .summary-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .summary-strip div:nth-child(3) {
      border-left: 0;
      border-top: 1px solid var(--glass-border);
    }

    .summary-strip div:nth-child(4) {
      border-top: 1px solid var(--glass-border);
    }

    .primary-filters,
    .advanced-filters,
    .question-body {
      grid-template-columns: 1fr;
    }

    .filter-actions,
    .results-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .filter-actions button {
      width: 100%;
    }

    .results-toolbar label {
      justify-content: space-between;
    }

    .question-trigger {
      grid-template-columns: minmax(0, 1fr);
      padding: 15px;
    }

    .question-row-head {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }

    .question-preference-cell {
      gap: 6px;
    }

    .question-chevron {
      margin-right: 12px;
    }

    .question-index {
      display: none;
    }

    .question-main small {
      white-space: normal;
    }

    .question-details {
      border-top: 1px solid var(--glass-border);
      border-left: 0;
    }

    .question-footer code {
      width: 100%;
      margin-left: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style>
