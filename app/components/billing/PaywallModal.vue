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
  }>();
  const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

  const { t } = useI18n();
  const api = useAPI();

  useBodyScrollLock(() => props.open);

  const plansData = ref<BillingPlansResponse | null>(null);
  const plansPending = ref(false);
  const checkoutPlanId = ref('');
  // Автопродление по умолчанию включено (ТЗ тарифы v2); юзер может снять
  // тумблер до оплаты и сделать покупку разовой. Актуально только для пропусков.
  const autoRenew = ref(true);
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
        autoRenew.value = true;
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

  // Вся линейка пропусков от 7 дней до года — одинаково во всех местах, где
  // показываем пейволл (realtime, исчерпанная попытка и т.д.).
  const PASS_IDS = [
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
    return PASS_IDS.map((id) =>
      plans.find((plan) => plan.id === id && plan.isCheckoutEnabled)
    ).filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
  });

  const title = computed(() =>
    props.mode === 'minutes'
      ? t('paywall.minutesTitle')
      : t('paywall.plansTitle')
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

  // В режиме пропусков заголовок общий («Полный доступ»), поэтому в строке
  // показываем только срок, без дублирующего описания. В режиме минут —
  // короткое имя пакета.
  function itemLabel(plan: BillingPlansResponse['plans'][number]) {
    return props.mode === 'plans'
      ? t('paywall.planLabelDays', { days: plan.durationDays })
      : plan.name;
  }

  async function checkout(planId: string) {
    if (checkoutPlanId.value) return;
    checkoutPlanId.value = planId;
    errorMessage.value = '';
    try {
      const response = await api<BillingCheckoutResponse>(
        '/api/billing/checkout',
        {
          method: 'POST',
          // Автопродление осмысленно только для пропусков; пакеты минут —
          // всегда разовые.
          body: {
            planId,
            autoRenew: props.mode === 'plans' ? autoRenew.value : false,
          },
        }
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
          <span class="paywall-badge" aria-hidden="true">💎</span>
          <!-- Скролл вынесен во внутренний контейнер, чтобы светящаяся рамка
               glass-frame::before покрывала всю модалку, а не только видимую
               часть при прокрутке на низких экранах. -->
          <div class="paywall-body">
            <header class="paywall-head">
              <h2>{{ title }}</h2>
              <p class="paywall-description">{{ description }}</p>
            </header>

            <GlassSkeletonStack v-if="plansPending" :heights="[52, 52]" />
            <ul v-else class="paywall-items">
              <li v-for="plan in items" :key="plan.id">
                <button
                  class="paywall-option button-loader-host"
                  type="button"
                  :disabled="Boolean(checkoutPlanId)"
                  @click="checkout(plan.id)"
                >
                  <span class="paywall-option-label">{{
                    itemLabel(plan)
                  }}</span>
                  <ButtonLoader v-if="checkoutPlanId === plan.id" />
                  <span
                    class="paywall-option-price button-loader-content"
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

            <!-- Автопродление можно снять до оплаты, а не только в полном
                 чекауте на /pricing. -->
            <label v-if="mode === 'plans'" class="paywall-renew">
              <span class="paywall-renew-copy">
                <strong>{{ t('pricing.autoRenewSwitchLabel') }}</strong>
                <small v-if="autoRenew">
                  {{ t('paywall.autoRenewDisclosure') }}
                </small>
                <small v-else>{{ t('pricing.autoRenewSwitchOffHint') }}</small>
              </span>
              <input v-model="autoRenew" type="checkbox" />
              <span class="paywall-renew-control" aria-hidden="true" />
            </label>

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
    /* Модалка целиком вмещается в экран. Сама она НЕ скроллит (иначе рамка
       glass-frame::before считает высоту по видимой части), скролл — в
       .paywall-body. */
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .paywall-body {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    gap: 12px;
    padding: clamp(20px, 3vw, 26px);
  }

  /* Звёздочка вынесена в угол, чтобы не занимать отдельную строку и не
     наслаиваться на заголовок (у него есть правый отступ под бейдж). */
  .paywall-badge {
    position: absolute;
    top: clamp(16px, 3vw, 22px);
    right: clamp(16px, 3vw, 22px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid var(--glass-border-strong);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    font-size: 15px;
    pointer-events: none;
  }

  .paywall-head {
    display: grid;
    gap: 4px;
    /* Оставляем место под бейдж в углу. */
    padding-right: 40px;
  }

  .paywall h2 {
    margin: 0;
    font-size: 19px;
    line-height: 1.25;
    color: var(--text-primary);
  }

  .paywall-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  /* Строки-тарифы перестраиваются по ширине: на широком экране 2–3 в ряд,
     на узком — по одному. */
  .paywall-items {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .paywall-option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--surface-soft);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .paywall-option:hover:not(:disabled) {
    border-color: var(--glass-border-strong);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-soft));
  }

  .paywall-option:disabled {
    cursor: default;
  }

  .paywall-option-label {
    font-size: 14px;
    font-weight: 600;
  }

  .paywall-option-price {
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
    white-space: nowrap;
  }

  .paywall-error {
    margin: 0;
    color: var(--danger, #f87171);
    font-size: 13px;
  }

  /* Тумблер автопродления — по образцу gift-switch из чекаута. */
  .paywall-renew {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    cursor: pointer;
  }

  .paywall-renew-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .paywall-renew-copy strong {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 700;
  }

  .paywall-renew-copy small {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .paywall-renew input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .paywall-renew-control {
    position: relative;
    flex: 0 0 44px;
    width: 44px;
    height: 24px;
    border: 1px solid var(--glass-border-strong);
    border-radius: 999px;
    background: var(--surface-soft);
    transition: background var(--motion-fast) var(--ease-out);
  }

  .paywall-renew-control::after {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-primary);
    content: '';
    transition: transform var(--motion-fast) var(--ease-out);
  }

  .paywall-renew input:checked + .paywall-renew-control {
    background: color-mix(in srgb, var(--accent) 72%, var(--surface-soft));
  }

  .paywall-renew input:checked + .paywall-renew-control::after {
    transform: translateX(20px);
  }

  .paywall-renew input:focus-visible + .paywall-renew-control {
    outline: 2px solid var(--accent-2);
    outline-offset: 3px;
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
