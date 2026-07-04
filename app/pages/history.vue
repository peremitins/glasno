<script setup lang="ts">
  import { TrashIcon } from '@radix-icons/vue';
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import TextWithInterviewTerms from '@/app/components/design/TextWithInterviewTerms.vue';
  import type {
    DeleteInterviewSessionResponse,
    InterviewHistoryResponse,
    LearningTermContext,
  } from '@/shared/dto';

  type HistoryItem = InterviewHistoryResponse['items'][number];

  const { t } = useI18n();
  const api = useAPI();
  const router = useRouter();

  const { data, pending, refresh } = await useLazyAsyncData(
    'interview-history',
    () => api<InterviewHistoryResponse>('/api/interview/sessions/history')
  );
  const deleteTargetId = ref('');
  const isDeleting = ref(false);
  const deleteError = ref('');
  const historyInitialPending = computed(() => pending.value && !data.value);

  const deleteTarget = computed(
    () =>
      data.value?.items.find((item) => item.id === deleteTargetId.value) ?? null
  );

  function formatDate(value: string) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function confirmDeleteSession(item: HistoryItem) {
    deleteTargetId.value = item.id;
    deleteError.value = '';
  }

  function cancelDeleteSession() {
    if (isDeleting.value) return;
    deleteTargetId.value = '';
    deleteError.value = '';
  }

  function historyItemPath(item: HistoryItem) {
    if (item.report?.id) return `/interview/report/${item.report.id}`;
    return `/interview/${item.id}`;
  }

  function historyItemActionLabel(item: HistoryItem) {
    if (item.status === 'running') return t('history.continue');
    if (item.report?.id) return t('history.openReport');
    return t('history.openReview');
  }

  function historyItemActionClass(item: HistoryItem) {
    const base =
      item.status === 'running' || item.report?.id
        ? 'primary-action primary-action--compact'
        : 'secondary-action secondary-action--compact';
    return base;
  }

  function historyTermContext(
    item: HistoryItem,
    label: string
  ): LearningTermContext {
    return {
      kind: 'history',
      interviewSessionId: item.id,
      label,
    };
  }

  async function openHistoryItem(item: HistoryItem) {
    await router.push(historyItemPath(item));
  }

  async function deleteSession() {
    if (!deleteTarget.value || isDeleting.value) return;

    isDeleting.value = true;
    deleteError.value = '';
    try {
      await api<DeleteInterviewSessionResponse>(
        `/api/interview/sessions/${deleteTarget.value.id}`,
        {
          method: 'DELETE',
        }
      );
      deleteTargetId.value = '';
      await refresh();
    } catch {
      deleteError.value = t('history.delete.error');
    } finally {
      isDeleting.value = false;
    }
  }
</script>

<template>
  <div class="history-page app-page">
    <section class="panel glass-frame">
      <GlassSkeletonStack
        v-if="historyInitialPending"
        class="history-skeleton"
        :heights="[118, 118, 118, 118]"
      />
      <div v-else-if="data?.items.length" class="list">
        <article
          v-for="item in data.items"
          :key="item.id"
          class="row glass-card glass-card--interactive"
          role="link"
          tabindex="0"
          :aria-label="t('history.openItemAria', { title: item.title })"
          @click="openHistoryItem(item)"
          @keydown.enter.prevent="openHistoryItem(item)"
          @keydown.space.prevent="openHistoryItem(item)"
        >
          <div class="main">
            <span class="status">{{ t(`common.status.${item.status}`) }}</span>
            <h2>
              <TextWithInterviewTerms
                :text="item.title"
                :context="historyTermContext(item, 'Название интервью')"
                :interactive="false"
              />
            </h2>
            <p>
              <TextWithInterviewTerms
                :text="
                  item.subtitle || item.role || t('interview.session.subtitle')
                "
                :context="historyTermContext(item, 'Описание интервью')"
                :interactive="false"
              />
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
          <div class="actions" @click.stop>
            <button
              type="button"
              :class="historyItemActionClass(item)"
              @click="openHistoryItem(item)"
            >
              {{ historyItemActionLabel(item) }}
            </button>
            <button
              type="button"
              class="delete-button"
              :aria-label="t('history.delete.aria', { title: item.title })"
              :disabled="isDeleting && deleteTarget?.id === item.id"
              @click="confirmDeleteSession(item)"
            >
              <TrashIcon aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>
      <div v-else class="empty">
        <p>{{ t('history.empty') }}</p>
        <NuxtLink
          to="/interview/new"
          class="primary-action primary-action--compact"
        >
          {{ t('history.newInterview') }}
        </NuxtLink>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="deleteTarget"
        class="delete-backdrop"
        role="presentation"
        @click.self="cancelDeleteSession"
      >
        <section
          class="delete-dialog glass-frame"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div>
            <p class="status">{{ t('history.delete.kicker') }}</p>
            <h2 id="delete-dialog-title">{{ t('history.delete.title') }}</h2>
            <p class="dialog-copy">
              {{ t('history.delete.text', { title: deleteTarget.title }) }}
            </p>
          </div>

          <p v-if="deleteError" class="delete-error">{{ deleteError }}</p>

          <div class="dialog-actions">
            <button
              type="button"
              class="secondary-action secondary-action--compact"
              :disabled="isDeleting"
              @click="cancelDeleteSession"
            >
              {{ t('history.delete.cancel') }}
            </button>
            <button
              type="button"
              class="delete-confirm button-loader-host"
              :disabled="isDeleting"
              @click="deleteSession"
            >
              <ButtonLoader v-if="isDeleting" />
              <span
                class="button-loader-content"
                :class="{ 'button-loader-content--loading': isDeleting }"
              >
                {{ t('history.delete.confirm') }}
              </span>
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
  .history-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .main p,
  .meta,
  .muted {
    color: var(--text-muted);
  }

  .panel {
    padding: clamp(18px, 2.2vw, 26px);
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
    cursor: pointer;
    padding: 14px;
  }

  .row:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 3px;
  }

  .main {
    min-width: 0;
  }

  .main h2 {
    color: var(--text-primary);
    font-size: 18px;
    margin: 4px 0;
  }

  .status {
    color: var(--accent-2);
    font-family: var(--font-mono);
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
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 17px;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
  }

  .delete-button,
  .delete-confirm {
    border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--glass-border));
    background: color-mix(in srgb, var(--danger) 13%, var(--surface-soft));
    color: var(--danger);
    cursor: pointer;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .delete-button {
    display: grid;
    flex: 0 0 42px;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 14px;
  }

  .delete-button svg {
    width: 16px;
    height: 16px;
  }

  .delete-button:hover,
  .delete-confirm:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--danger) 65%, var(--glass-border));
    background: color-mix(in srgb, var(--danger) 18%, var(--surface-raised));
    color: var(--text-primary);
  }

  .delete-button:disabled,
  .delete-confirm:disabled {
    cursor: default;
    opacity: 0.55;
    transform: none;
  }

  .delete-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in srgb, var(--app-bg) 72%, transparent);
    backdrop-filter: blur(18px);
  }

  .delete-dialog {
    display: grid;
    gap: 18px;
    width: min(440px, 100%);
    padding: clamp(18px, 2vw, 24px);
  }

  .delete-dialog h2 {
    color: var(--text-primary);
    font-size: 24px;
    margin: 6px 0 8px;
  }

  .dialog-copy {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .delete-error {
    color: var(--danger);
    font-weight: 800;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .delete-confirm {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    border-radius: var(--radius-control);
    font-weight: 900;
    padding: 0 16px;
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
      width: 100%;
    }

    .actions .primary-action,
    .actions .secondary-action {
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
    }

    .delete-button {
      flex-basis: 46px;
      width: 46px;
      height: 46px;
    }

    .dialog-actions {
      flex-direction: column-reverse;
    }

    .dialog-actions .secondary-action,
    .delete-confirm {
      width: 100%;
    }
  }
</style>
