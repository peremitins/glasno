<script setup lang="ts">
  // Пейволл по образцу Mentala FeaturePaywallModal, два режима:
  // - 'minutes': у юзера есть пропуск, но кончились минуты голоса → пакеты;
  // - 'plans': пропуска нет (или истёк) → короткая подборка сроков,
  //   полная сетка — на /pricing.
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import { useYookassaWidget } from '@/app/composables/useYookassaWidget';
  import type {
    BillingCheckoutResponse,
    BillingPlansResponse,
  } from '@/shared/dto';

  const props = defineProps<{
    open: boolean;
    mode: 'minutes' | 'plans';
    // 'compact' — три ключевых срока (по умолчанию, для realtime-пейволла);
    // 'full' — вся линейка пропусков (пейволл при исчерпанной попытке).
    plansVariant?: 'compact' | 'full';
  }>();
  const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

  const { t } = useI18n();
  const api = useAPI();

  useBodyScrollLock(() => props.open);

  const plansData = ref<BillingPlansResponse | null>(null);
  const plansPending = ref(false);
  const checkoutPlanId = ref('');
  const errorMessage = ref('');
  // Нативное всплывающее окно YooKassa (карта, СБП, SberPay).
  const checkoutToken = ref('');
  const checkoutReturnUrl = ref('');
  const { mount: mountWidget, destroy: destroyWidget } = useYookassaWidget();

  watch(
    () => props.open,
    (open) => {
      if (open && !plansData.value && !plansPending.value) {
        void loadPlans();
      }
      if (open) {
        errorMessage.value = '';
      } else {
        resetWidget();
      }
    }
  );

  // Как только пришёл токен, скрываем пейволл и открываем собственное
  // всплывающее окно YooKassa. При закрытии возвращаем выбор тарифов.
  watch(
    () => [props.open, checkoutToken.value] as const,
    async ([open, token]) => {
      if (!open || !token || !checkoutReturnUrl.value) {
        destroyWidget();
        return;
      }
      await mountWidget({
        confirmationToken: token,
        returnUrl: checkoutReturnUrl.value,
        modal: true,
        onModalClose: resetWidget,
        onError: resetWidget,
      });
    }
  );

  function resetWidget() {
    checkoutToken.value = '';
    checkoutReturnUrl.value = '';
    checkoutPlanId.value = '';
  }

  onBeforeUnmount(destroyWidget);

  async function loadPlans() {
    plansPending.value = true;
    try {
      plansData.value = await api<BillingPlansResponse>('/api/billing/plans');
    } catch {
      errorMessage.value = t('paywall.loadError');
    } finally {
      plansPending.value = false;
    }
  }

  // 'compact' — входной/основной/выгодный срок, чтобы не перегружать быстрый
  // выбор. 'full' — вся линейка пропусков от 7 дней до года.
  const COMPACT_PASS_IDS = ['pass_7d', 'pass_30d', 'pass_90d'];
  const FULL_PASS_IDS = [
    'pass_7d',
    'pass_15d',
    'pass_30d',
    'pass_90d',
    'pass_180d',
    'pass_365d',
  ];

  const items = computed(() => {
    const plans = plansData.value?.plans || [];
    if (props.mode === 'minutes') {
      return plans.filter(
        (plan) => plan.type === 'minute_pack' && plan.isCheckoutEnabled
      );
    }
    const passIds =
      props.plansVariant === 'full' ? FULL_PASS_IDS : COMPACT_PASS_IDS;
    return passIds
      .map((id) => plans.find((plan) => plan.id === id && plan.isCheckoutEnabled))
      .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
  });

  const title = computed(() =>
    props.mode === 'minutes' ? t('paywall.minutesTitle') : t('paywall.plansTitle')
  );
  const description = computed(() =>
    props.mode === 'minutes'
      ? t('paywall.minutesDescription')
      : t('paywall.plansDescription')
  );

  function close() {
    emit('update:open', false);
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  async function checkout(planId: string) {
    if (checkoutPlanId.value) return;
    checkoutPlanId.value = planId;
    errorMessage.value = '';
    try {
      const response = await api<BillingCheckoutResponse>(
        '/api/billing/checkout',
        { method: 'POST', body: { planId } }
      );
      // Нативное окно YooKassa откроется watcher-ом после сохранения токена.
      checkoutToken.value = response.confirmationToken;
      checkoutReturnUrl.value = response.returnUrl;
    } catch (err) {
      const data = (err as { data?: { error?: { message?: string } } })?.data;
      errorMessage.value = data?.error?.message || t('paywall.checkoutError');
      checkoutPlanId.value = '';
    }
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="paywall-fade">
      <div
        v-if="open && !checkoutToken"
        class="paywall-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.self="close"
      >
        <div class="paywall glass-frame">
          <span class="paywall-badge" aria-hidden="true">⭐</span>
          <h2>{{ title }}</h2>
          <p class="paywall-description">{{ description }}</p>

          <GlassSkeletonStack v-if="plansPending" :heights="[64, 64]" />
          <ul v-else class="paywall-items">
              <li v-for="plan in items" :key="plan.id">
                <div class="paywall-item-copy">
                  <strong>{{ plan.name }}</strong>
                  <span>{{ plan.description }}</span>
                </div>
                <button
                  class="primary-action primary-action--compact button-loader-host"
                  type="button"
                  :disabled="Boolean(checkoutPlanId)"
                  @click="checkout(plan.id)"
                >
                  <ButtonLoader v-if="checkoutPlanId === plan.id" />
                  <span
                    class="button-loader-content"
                    :class="{
                      'button-loader-content--loading':
                        checkoutPlanId === plan.id,
                    }"
                  >
                    {{ formatPrice(plan.priceRub) }} ₽
                  </span>
                </button>
              </li>
          </ul>

            <!-- Автопродление включено по умолчанию: информируем до оплаты,
                 снять галочку можно в полном чекауте на /pricing. -->
          <p v-if="mode === 'plans'" class="paywall-disclosure">
            {{ t('paywall.autoRenewDisclosure') }}
          </p>

          <p v-if="errorMessage" class="paywall-error">{{ errorMessage }}</p>

          <div class="paywall-actions">
              <NuxtLink
                to="/pricing"
                class="secondary-action secondary-action--compact"
                @click="close"
              >
                {{ t('paywall.allPlans') }}
              </NuxtLink>
              <button
                type="button"
                class="secondary-action secondary-action--compact"
                @click="close"
              >
                {{ t('paywall.later') }}
              </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .paywall-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Overlay не скроллит — только держит отступ от краёв экрана. */
    overflow: hidden;
    padding: clamp(16px, 5vh, 44px) 16px;
    background: color-mix(in srgb, #000 62%, transparent);
    backdrop-filter: blur(4px);
  }

  .paywall {
    position: relative;
    width: min(440px, 100%);
    /* Модалка целиком вмещается в экран, а скролл — внутри неё. */
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    gap: 12px;
    padding: clamp(20px, 3vw, 26px);
  }

  .paywall-badge {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid var(--glass-border-strong);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    font-size: 16px;
  }

  .paywall h2 {
    margin: 0;
    font-size: 20px;
    color: var(--text-primary);
  }

  .paywall-description {
    margin: 0;
    color: var(--text-muted);
  }

  .paywall-items {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .paywall-items li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--surface-soft);
  }

  .paywall-item-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .paywall-item-copy strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  .paywall-item-copy span {
    color: var(--text-muted);
    font-size: 12px;
  }

  .paywall-item-copy + button {
    flex: none;
  }

  .paywall-error {
    margin: 0;
    color: var(--danger, #f87171);
    font-size: 13px;
  }

  .paywall-disclosure {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .paywall-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .paywall-fade-enter-active,
  .paywall-fade-leave-active {
    transition: opacity 0.18s ease;
  }

  .paywall-fade-enter-from,
  .paywall-fade-leave-to {
    opacity: 0;
  }

</style>
