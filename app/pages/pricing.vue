<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { toast } from 'vue-sonner';
  import { CheckIcon } from '@radix-icons/vue';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import ConfirmModal from '@/app/components/design/ConfirmModal.vue';
  import BillingCheckoutModal from '@/app/components/billing/BillingCheckoutModal.vue';
  import PaymentHistory from '@/app/components/billing/PaymentHistory.vue';
  import type {
    BillingBindCardResponseDto,
    BillingCheckoutResponse,
    BillingPlansResponse,
    BillingStatusResponse,
  } from '@/shared/dto';
  import { YandexMetrikaGoal } from '@/shared/analytics/yandexMetrika';
  import { reachYandexMetrikaGoal } from '@/app/utils/yandexMetrika';
  import type { z } from 'zod';

  const { t } = useI18n();
  const api = useAPI();
  const route = useRoute();
  const router = useRouter();

  const checkoutPlanId = ref('');
  const selectedPlanId = ref('');
  const giftMode = ref(false);
  // Автопродление по умолчанию включено (ТЗ тарифы v2); в модалке чекаута
  // пользователь видит дату/сумму списания и может снять галочку.
  const autoRenew = ref(true);
  const recipientEmail = ref('');
  const senderName = ref('');
  const recipientEmailError = ref('');
  const senderNameError = ref('');
  const checkoutError = ref('');
  const checkoutModalOpen = ref(false);
  // Токен и return_url встроенного виджета YooKassa: заполняются после
  // создания платежа, переключают модалку с формы на виджет оплаты.
  const checkoutToken = ref('');
  const checkoutReturnUrl = ref('');
  // Заказ текущего чекаута — для репорта «окно оплаты не открылось».
  const checkoutOrderId = ref('');
  const paymentHistoryRef = ref<InstanceType<typeof PaymentHistory> | null>(
    null
  );
  const errorMessage = ref('');
  const cardActionPending = ref(false);

  const { data: plansData, pending: plansPending } = await useLazyAsyncData(
    'billing-plans',
    () => api<BillingPlansResponse>('/api/billing/plans')
  );
  const {
    data: status,
    pending: statusPending,
    refresh: refreshStatus,
  } = await useLazyAsyncData('billing-status', () =>
    api<BillingStatusResponse>('/api/billing/status')
  );

  // Сверка оплаты после возврата с YooKassa — общий composable (используется
  // также страницей интервью при покупке пакета минут из пейволла).
  const {
    returnVisible: returnNoticeVisible,
    message: paymentStatusMessage,
    reconcile: reconcileReturnedPayment,
  } = usePaymentReturn({
    refresh: refreshStatus,
    onPaid: () => paymentHistoryRef.value?.refresh(),
  });
  const bindingReturnVisible = computed(() => route.query.binding === 'return');
  const giftReceivedVisible = computed(() => route.query.gift === 'received');
  const plansInitialPending = computed(
    () => plansPending.value && !plansData.value
  );
  const statusInitialPending = computed(
    () => statusPending.value && !status.value
  );

  // Один продукт «Полный доступ» с выбором срока + пакеты минут отдельным
  // блоком (расходник к активному пропуску).
  const passPlans = computed(() =>
    (plansData.value?.plans || [])
      .filter((plan) => plan.type === 'pass' && plan.isCheckoutEnabled)
      .sort((a, b) => a.durationDays - b.durationDays)
  );
  const minutePacks = computed(() =>
    (plansData.value?.plans || []).filter((plan) => plan.type === 'minute_pack')
  );

  // Выбранный срок: по умолчанию — выделенный в каталоге (30 дней).
  const selectedPassId = ref('');
  watch(
    passPlans,
    (plans) => {
      if (!plans.length) return;
      if (plans.some((plan) => plan.id === selectedPassId.value)) return;
      selectedPassId.value =
        plans.find((plan) => plan.isHighlighted)?.id ?? plans[0]!.id;
    },
    { immediate: true }
  );
  const selectedPass = computed(
    () =>
      passPlans.value.find((plan) => plan.id === selectedPassId.value) ?? null
  );
  const selectedPassPerDay = computed(() => {
    const plan = selectedPass.value;
    if (!plan) return 0;
    return Math.round(plan.priceRub / plan.durationDays);
  });

  const selectedPlan = computed(
    () =>
      (plansData.value?.plans || []).find(
        (plan) => plan.id === selectedPlanId.value
      ) ?? null
  );
  // Серверная правда: пакеты доступны при активном пропуске,
  // см. accessService.canBuyMore.
  const packsLocked = computed(
    () => !(status.value?.realtimeVoice.canBuyMore || status.value?.unlimited)
  );

  // --- Блок «Текущий доступ»: 4 состояния (ТЗ тарифы v2, раздел 4) ----
  // admin / активный пропуск / пропуск истёк / трайл (не)использован.
  const trialUsed = computed(
    () =>
      (status.value?.freeSessionsUsed ?? 0) >=
      (status.value?.freeSessionsLimit ?? 1)
  );
  const accessState = computed(() => {
    if (!status.value) return 'loading';
    if (status.value.unlimited) return 'admin';
    if (status.value.activeAccess) return 'active';
    if (status.value.lastAccessEndedAt) return 'expired';
    return trialUsed.value ? 'trial-used' : 'trial';
  });
  const currentPlanLabel = computed(() => {
    switch (accessState.value) {
      case 'admin':
        return t('pricing.adminAccess');
      case 'active':
        return status.value?.activeAccess?.planName ?? '';
      case 'expired':
        return t('pricing.accessExpiredTitle');
      case 'trial-used':
        return t('pricing.trialUsedTitle');
      default:
        return t('pricing.trialTitle');
    }
  });
  const billingInfo = computed(() => status.value?.billing ?? null);
  const paymentMethodLabel = computed(() => {
    const method = billingInfo.value?.paymentMethod;
    if (!method) return '';
    // Привязка начата, но не подтверждена в банке. Списывать с такого
    // способа нельзя, и пользователь должен видеть именно это, а не
    // «способа нет» и не «всё готово».
    if (method.status === 'pending') {
      return t('pricing.paymentMethodPending');
    }
    if (method.methodType === 'sbp') {
      return t('pricing.paymentMethodSbp');
    }
    if (method.cardLast4) {
      const brand = method.cardBrand || t('pricing.card');
      return `${brand} •••• ${method.cardLast4}`;
    }
    return method.title || t('pricing.paymentMethodLinked');
  });
  const hasChargeablePaymentMethod = computed(
    () => billingInfo.value?.paymentMethod?.status === 'active'
  );
  const paymentMethodActionLabel = computed(() =>
    hasChargeablePaymentMethod.value
      ? t('pricing.replacePaymentMethod')
      : t('pricing.bindCard')
  );
  // Доступ оплачен, но автосписание работать не с чем: объясняем, что нужно
  // сделать, вместо противоречивого «автопродление выключено».
  const autoRenewSetupHint = computed(() => {
    if (!billingInfo.value) return '';
    if (billingInfo.value.autoRenew) return '';
    if (!status.value?.hasActivePaidAccess) return '';
    if (hasChargeablePaymentMethod.value) return '';
    // Привязка уже начата — просить «привязать способ» бессмысленно, нужно
    // подтвердить её в приложении банка.
    return billingInfo.value.paymentMethod?.status === 'pending'
      ? t('pricing.autoRenewConfirmBinding')
      : t('pricing.autoRenewNeedsMethod');
  });
  const showMinutes = computed(
    () =>
      Boolean(status.value) &&
      !status.value!.unlimited &&
      status.value!.realtimeVoice.includedMinutes > 0
  );

  function formatPrice(value: number) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  }

  async function startCheckout(input: {
    planId: string;
    autoRenew: boolean;
    gift?: { recipientEmail: string; senderName: string };
  }) {
    const planId = input.planId;
    if (checkoutPlanId.value) return;
    checkoutPlanId.value = planId;
    checkoutError.value = '';
    try {
      const response = await api<BillingCheckoutResponse>(
        '/api/billing/checkout',
        {
          method: 'POST',
          body: input,
        }
      );
      // Не редиректим на страницу YooKassa — показываем встроенный виджет
      // в той же модалке (карта, СБП, SberPay). return_url виджета вернёт
      // пользователя на /pricing, где отработает обычная сверка статуса.
      checkoutOrderId.value = response.orderId;
      checkoutToken.value = response.confirmationToken;
      checkoutReturnUrl.value = response.returnUrl;
      reachYandexMetrikaGoal(YandexMetrikaGoal.checkoutCreated);
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) {
        const data = (err as { data?: { error?: { message?: string } } }).data;
        checkoutError.value = data?.error?.message || t('pricing.error');
      } else {
        checkoutError.value = t('pricing.error');
      }
    } finally {
      checkoutPlanId.value = '';
    }
  }

  function selectPlan(planId: string, mode: 'self' | 'gift' = 'self') {
    const plan = (plansData.value?.plans || []).find(
      (item) => item.id === planId
    );
    if (!plan) return;
    selectedPlanId.value = planId;
    giftMode.value = mode === 'gift' && plan.type === 'pass';
    // Каждое открытие чекаута — с включённым автопродлением по умолчанию.
    autoRenew.value = true;
    recipientEmailError.value = '';
    senderNameError.value = '';
    checkoutError.value = '';
    // Новый чекаут всегда начинается с формы, а не с прошлого виджета.
    checkoutToken.value = '';
    checkoutReturnUrl.value = '';
    checkoutOrderId.value = '';
    checkoutModalOpen.value = true;
  }

  // Возврат от виджета к форме (кнопка «назад» при ошибке виджета).
  function backToCheckoutForm() {
    checkoutToken.value = '';
    checkoutReturnUrl.value = '';
    checkoutOrderId.value = '';
    checkoutError.value = '';
  }

  async function submitCheckout() {
    if (!selectedPlan.value) return;
    const isGift = giftMode.value && selectedPlan.value.type === 'pass';
    const normalizedEmail = recipientEmail.value.trim().toLowerCase();
    const normalizedSenderName = senderName.value.trim();
    if (isGift && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      recipientEmailError.value = t('pricing.giftEmailError');
      return;
    }
    if (isGift && !normalizedSenderName) {
      senderNameError.value = t('pricing.giftSenderNameError');
      return;
    }
    recipientEmailError.value = '';
    senderNameError.value = '';
    await startCheckout({
      planId: selectedPlan.value.id,
      autoRenew: !isGift && autoRenew.value,
      gift: isGift
        ? {
            recipientEmail: normalizedEmail,
            senderName: normalizedSenderName,
          }
        : undefined,
    });
  }

  async function updateCheckoutModalOpen(value: boolean) {
    checkoutModalOpen.value = value;
    if (!value) {
      // Закрыли модалку — сбрасываем виджет, чтобы повторное открытие
      // начиналось с формы.
      checkoutToken.value = '';
      checkoutReturnUrl.value = '';
      checkoutOrderId.value = '';
    }
    if (value || !route.query.checkout) return;
    const query = { ...route.query };
    delete query.checkout;
    delete query.plan;
    await router.replace({ query });
  }

  watch(
    [() => route.query.checkout, () => route.query.plan, () => plansData.value],
    ([checkoutMode, requestedPlan]) => {
      if (checkoutMode !== 'gift' || !plansData.value) return;
      const requestedPlanId =
        typeof requestedPlan === 'string' ? requestedPlan : '';
      const plan =
        passPlans.value.find((item) => item.id === requestedPlanId) ??
        passPlans.value.find((item) => item.isHighlighted) ??
        passPlans.value[0];
      if (plan) selectPlan(plan.id, 'gift');
    },
    { immediate: true }
  );

  // Привязка карты без платежа: бэкенд создаёт payment_method в YooKassa
  // и отдаёт confirmationUrl — редиректим пользователя на подтверждение.
  // Привязка без платежа — единственный способ получить идентификатор,
  // пригодный для автосписаний. Для карты confirmationUrl ведёт на страницу
  // банка, для СБП — на страницу НСПК (телефон открывает приложение банка,
  // десктоп показывает QR-код).
  async function bindPaymentMethod(methodType: 'bank_card' | 'sbp') {
    if (cardActionPending.value) return;
    cardActionPending.value = true;
    errorMessage.value = '';
    try {
      const response = await api<z.infer<typeof BillingBindCardResponseDto>>(
        '/api/billing/payment-method/bind',
        { method: 'POST', body: { methodType } }
      );
      window.location.href = response.confirmationUrl;
    } catch (err) {
      const data = (err as { data?: { error?: { message?: string } } })?.data;
      errorMessage.value = data?.error?.message || t('pricing.bindError');
      cardActionPending.value = false;
    }
  }

  // Подтверждения действий с картой/автопродлением — кастомная модалка
  // вместо системного window.confirm.
  type ConfirmAction = 'unbind' | 'enableRenew' | 'disableRenew';
  const confirmAction = ref<ConfirmAction | null>(null);
  const confirmOpen = computed({
    get: () => confirmAction.value !== null,
    set: (value: boolean) => {
      if (!value) confirmAction.value = null;
    },
  });
  const confirmContent = computed(() => {
    switch (confirmAction.value) {
      case 'unbind':
        return {
          title: t('pricing.unbindConfirmTitle'),
          description: t('pricing.unbindConfirmText'),
          confirmLabel: t('pricing.unbindCard'),
          tone: 'danger' as const,
        };
      case 'enableRenew':
        return {
          title: t('pricing.enableRenewConfirmTitle'),
          description: t('pricing.enableRenewConfirmText'),
          confirmLabel: t('pricing.enableAutoRenew'),
          tone: 'default' as const,
        };
      case 'disableRenew':
        return {
          title: t('pricing.disableRenewConfirmTitle'),
          description: t('pricing.disableRenewConfirmText', {
            date: formatDate(status.value?.activeAccess?.expiresAt),
          }),
          confirmLabel: t('pricing.disableAutoRenew'),
          tone: 'default' as const,
        };
      default:
        return null;
    }
  });

  async function onConfirmAction() {
    const action = confirmAction.value;
    if (!action) return;
    if (action === 'unbind') {
      await unbindCard();
    } else {
      await setAutoRenew(action === 'enableRenew');
    }
    confirmAction.value = null;
  }

  // Отвязка карты: карта удаляется, автопродление
  // выключается, оплаченный период остаётся до конца.
  async function unbindCard() {
    if (cardActionPending.value) return;
    cardActionPending.value = true;
    errorMessage.value = '';
    try {
      await api('/api/billing/payment-method/unbind', { method: 'POST' });
      await refreshStatus();
      toast.success(t('pricing.unbindSuccess'));
    } catch {
      errorMessage.value = t('pricing.unbindError');
      toast.error(t('pricing.unbindError'));
    } finally {
      cardActionPending.value = false;
    }
  }

  async function setAutoRenew(enabled: boolean) {
    if (cardActionPending.value) return;
    cardActionPending.value = true;
    errorMessage.value = '';
    try {
      await api('/api/billing/auto-renew', {
        method: 'POST',
        body: { enabled },
      });
      await refreshStatus();
    } catch (err) {
      const data = (err as { data?: { error?: { message?: string } } })?.data;
      errorMessage.value = data?.error?.message || t('pricing.error');
    } finally {
      cardActionPending.value = false;
    }
  }

  onMounted(() => {
    void refreshStatus();
    if (returnNoticeVisible.value) {
      void reconcileReturnedPayment();
    }
    // Возврат после привязки карты: status.get сам синхронизирует
    // pending-привязку с YooKassa — достаточно перезапросить статус.
    if (bindingReturnVisible.value) {
      void refreshStatus();
    }
  });
</script>

<template>
  <div class="pricing-page app-page">
    <GlassSkeletonStack
      v-if="statusInitialPending"
      class="status-skeleton"
      :heights="[132]"
    />
    <!-- Текущий доступ, 4 состояния (ТЗ тарифы v2, раздел 4): активный
         пропуск / пропуск истёк / трайл не использован / трайл исчерпан -->
    <section v-else class="status glass-frame glass-frame--soft">
      <div class="status-main">
        <p class="panel-label">{{ t('pricing.current') }}</p>
        <h2>{{ currentPlanLabel }}</h2>
        <p v-if="accessState === 'active'" class="status-line">
          {{
            t('pricing.activeUntil', {
              date: formatDate(status?.activeAccess?.expiresAt),
            })
          }}
        </p>
        <p v-else-if="accessState === 'expired'" class="status-line">
          {{
            t('pricing.accessExpiredAt', {
              plan: status?.lastAccessPlanName ?? '',
              date: formatDate(status?.lastAccessEndedAt),
            })
          }}
        </p>
        <p v-else-if="accessState === 'trial'" class="status-line">
          {{ t('pricing.trialHint') }}
        </p>
        <p v-else-if="accessState === 'trial-used'" class="status-line">
          {{ t('pricing.trialUsedHint') }}
        </p>
        <p v-if="showMinutes" class="status-line status-line--minutes">
          {{
            t('pricing.minutesCounter', {
              remaining: status!.realtimeVoice.remainingMinutes,
              included: status!.realtimeVoice.includedMinutes,
            })
          }}
        </p>
        <div v-else-if="accessState === 'trial'" class="status-actions">
          <NuxtLink to="/" class="secondary-action secondary-action--compact">
            {{ t('pricing.trialCta') }}
          </NuxtLink>
        </div>
      </div>

      <div v-if="billingInfo" class="status-billing">
        <p class="panel-label">{{ t('pricing.billingLabel') }}</p>
        <p
          v-if="billingInfo.autoRenew && billingInfo.nextChargeAt"
          class="status-line"
        >
          {{
            t('pricing.nextCharge', {
              amount: formatPrice(billingInfo.nextChargeAmountRub ?? 0),
              date: formatDate(billingInfo.nextChargeAt),
            })
          }}
        </p>
        <p v-else class="status-line">
          {{
            status?.hasActivePaidAccess
              ? t('pricing.autoRenewOff', {
                  date: formatDate(status?.activeAccess?.expiresAt),
                })
              : t('pricing.autoRenewNone')
          }}
        </p>
        <p
          v-if="billingInfo.lastChargeError"
          class="status-line status-line--error"
        >
          {{ t('pricing.chargeError') }}
        </p>
        <p v-if="paymentMethodLabel" class="status-line status-line--card">
          {{ paymentMethodLabel }}
        </p>
        <p v-else class="status-line">
          {{ t('pricing.noCard') }}
        </p>
        <!-- Автопродление невозможно, пока способ не подтверждён провайдером:
             объясняем это прямо, а не молчим о невыполнимом обещании. -->
        <p v-if="autoRenewSetupHint" class="status-line status-line--hint">
          {{ autoRenewSetupHint }}
        </p>
        <div class="status-actions">
          <button
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="bindPaymentMethod('bank_card')"
          >
            {{ paymentMethodActionLabel }}
          </button>
          <button
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="bindPaymentMethod('sbp')"
          >
            {{ t('pricing.bindSbp') }}
          </button>
          <button
            v-if="billingInfo.autoRenew"
            type="button"
            class="secondary-action secondary-action--compact action-danger"
            :disabled="cardActionPending"
            @click="confirmAction = 'disableRenew'"
          >
            {{ t('pricing.disableAutoRenew') }}
          </button>
          <button
            v-else-if="hasChargeablePaymentMethod && status?.hasActivePaidAccess"
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="confirmAction = 'enableRenew'"
          >
            {{ t('pricing.enableAutoRenew') }}
          </button>
          <!-- Отвязка имеет смысл только когда есть что отвязывать:
               подтверждённый способ или начатая привязка. -->
          <button
            v-if="billingInfo.paymentMethod"
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="confirmAction = 'unbind'"
          >
            {{
              hasChargeablePaymentMethod
                ? t('pricing.unbindCard')
                : t('pricing.cancelBinding')
            }}
          </button>
        </div>
      </div>

      <NuxtLink
        v-if="status?.needsAuthForCheckout"
        to="/profile"
        class="secondary-action secondary-action--compact status-auth"
      >
        {{ t('pricing.goProfile') }}
      </NuxtLink>
    </section>

    <p
      v-if="returnNoticeVisible"
      class="notice glass-frame glass-alert glass-alert--accent"
    >
      {{ paymentStatusMessage || t('pricing.returnNotice') }}
    </p>
    <p
      v-if="giftReceivedVisible"
      class="notice glass-frame glass-alert glass-alert--accent"
    >
      {{ t('pricing.giftReceived') }}
    </p>
    <p
      v-if="errorMessage"
      class="error glass-frame glass-alert glass-alert--danger"
    >
      {{ errorMessage }}
    </p>

    <!-- Единый продукт «Полный доступ»: одна карточка, выбор срока -->
    <section id="plans" class="plans">
      <GlassSkeletonStack
        v-if="plansInitialPending || statusInitialPending"
        class="plans-skeleton"
        :heights="[420]"
      />
      <article
        v-else-if="selectedPass"
        class="pass-card glass-frame glass-frame--soft"
      >
        <header class="plan-header pass-card-header">
          <h2>{{ t('pricing.fullAccessTitle') }}</h2>
          <p class="plan-description">{{ t('pricing.fullAccessSubtitle') }}</p>
        </header>

        <div
          class="duration-picker"
          role="radiogroup"
          :aria-label="t('pricing.durationLabel')"
        >
          <button
            v-for="plan in passPlans"
            :key="plan.id"
            type="button"
            role="radio"
            class="duration-option"
            :class="{
              'duration-option--selected': plan.id === selectedPassId,
            }"
            :aria-checked="plan.id === selectedPassId"
            @click="selectedPassId = plan.id"
          >
            <strong>{{ plan.durationDays }}</strong>
            <span>{{ t('pricing.daysShort') }}</span>
            <em v-if="plan.badge" class="duration-badge">{{ plan.badge }}</em>
          </button>
        </div>

        <div class="price">
          <strong>{{ formatPrice(selectedPass.priceRub) }} ₽</strong>
          <span>
            {{
              t('pricing.perDay', { amount: formatPrice(selectedPassPerDay) })
            }}
          </span>
        </div>

        <ul class="features">
          <li v-for="feature in selectedPass.features" :key="feature">
            <CheckIcon class="feature-check" aria-hidden="true" />
            <span>{{ feature }}</span>
          </li>
        </ul>

        <div class="plan-cta">
          <button
            class="primary-action primary-action--compact button-loader-host"
            type="button"
            :disabled="
              Boolean(checkoutPlanId) ||
              statusPending ||
              status?.needsAuthForCheckout
            "
            @click="selectPlan(selectedPass.id)"
          >
            <ButtonLoader v-if="checkoutPlanId === selectedPass.id" />
            <span
              class="button-loader-content"
              :class="{
                'button-loader-content--loading':
                  checkoutPlanId === selectedPass.id,
              }"
            >
              {{
                status?.hasActivePaidAccess
                  ? t('pricing.extendCta', {
                      amount: formatPrice(selectedPass.priceRub),
                    })
                  : t('pricing.buyCta', {
                      amount: formatPrice(selectedPass.priceRub),
                    })
              }}
            </span>
          </button>
          <!-- Автопродление по умолчанию включено: информируем у кнопки,
               управление — галочка в чекауте и тумблер в «Текущем доступе». -->
          <p class="plan-note">{{ t('pricing.autoRenewNote') }}</p>
          <p v-if="status?.hasActivePaidAccess" class="plan-note">
            {{ t('pricing.extendNote') }}
          </p>
        </div>
      </article>
    </section>

    <section
      v-if="!plansInitialPending && !statusInitialPending && minutePacks.length"
      class="packs-section"
    >
      <header class="packs-header glass-frame glass-frame--soft">
        <h2>{{ t('pricing.minutePacksTitle') }}</h2>
        <p class="muted">{{ t('pricing.minutePacksSubtitle') }}</p>
      </header>
      <p
        v-if="packsLocked"
        class="notice glass-frame glass-alert glass-alert--accent"
      >
        {{ t('pricing.packsNeedPlan') }}
      </p>
      <div class="packs">
        <article
          v-for="pack in minutePacks"
          :key="pack.id"
          class="plan pack glass-frame glass-frame--soft"
        >
          <span v-if="pack.badge" class="badge">{{ pack.badge }}</span>
          <header class="plan-header">
            <h3>{{ pack.name }}</h3>
            <p class="plan-description">{{ pack.description }}</p>
          </header>
          <div class="price">
            <strong>{{ formatPrice(pack.priceRub) }} ₽</strong>
            <span>{{ t('pricing.oneTimePayment') }}</span>
          </div>
          <ul class="features">
            <li v-for="feature in pack.features" :key="feature">
              <CheckIcon class="feature-check" aria-hidden="true" />
              <span>{{ feature }}</span>
            </li>
          </ul>
          <div class="plan-cta">
            <button
              class="primary-action primary-action--compact button-loader-host"
              type="button"
              :disabled="
                Boolean(checkoutPlanId) ||
                statusPending ||
                status?.needsAuthForCheckout ||
                packsLocked
              "
              @click="selectPlan(pack.id)"
            >
              <ButtonLoader v-if="checkoutPlanId === pack.id" />
              <span
                class="button-loader-content"
                :class="{
                  'button-loader-content--loading': checkoutPlanId === pack.id,
                }"
              >
                {{ t('pricing.buyPack') }}
              </span>
            </button>
          </div>
        </article>
      </div>
    </section>

    <PaymentHistory
      v-if="status && !status.needsAuthForCheckout"
      ref="paymentHistoryRef"
    />

    <BillingCheckoutModal
      :open="checkoutModalOpen"
      :plan="selectedPlan"
      :gift="giftMode"
      :auto-renew="autoRenew"
      :recipient-email="recipientEmail"
      :sender-name="senderName"
      :recipient-email-error="recipientEmailError"
      :sender-name-error="senderNameError"
      :checkout-error="checkoutError"
      :pending="Boolean(checkoutPlanId)"
      :confirmation-token="checkoutToken"
      :return-url="checkoutReturnUrl"
      :order-id="checkoutOrderId"
      @update:open="updateCheckoutModalOpen"
      @update:gift="giftMode = $event"
      @update:auto-renew="autoRenew = $event"
      @update:recipient-email="recipientEmail = $event"
      @update:sender-name="senderName = $event"
      @clear-error="
        recipientEmailError = '';
        senderNameError = '';
        checkoutError = '';
      "
      @submit="submitCheckout"
      @back="backToCheckoutForm"
    />

    <ConfirmModal
      v-if="confirmContent"
      v-model:open="confirmOpen"
      :title="confirmContent.title"
      :description="confirmContent.description"
      :confirm-label="confirmContent.confirmLabel"
      :cancel-label="t('pricing.confirmCancel')"
      :tone="confirmContent.tone"
      :pending="cardActionPending"
      @confirm="onConfirmAction"
    />
  </div>
</template>

<style scoped>
  .pricing-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  .muted {
    color: var(--text-muted);
  }

  /* --- Текущий доступ ------------------------------------------------ */
  /* Равные колонки 50/50: правый блок «Оплата» не прыгает от длины
     текста при смене состояния автопродления. */
  .status {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(16px, 2.4vw, 32px);
    align-items: start;
    padding: clamp(15px, 2.2vw, 26px);
  }

  .status-main,
  .status-billing {
    display: grid;
    gap: 6px;
    align-content: start;
    min-width: 0;
  }

  /* Если блока «Оплата» нет (аноним) — основной блок на всю ширину. */
  .status-main:only-child,
  .status-main:last-of-type:first-of-type {
    grid-column: 1 / -1;
  }

  .status-main h2 {
    font-size: 18px;
    color: var(--text-primary);
  }

  .status-line {
    color: var(--text-muted);
    font-size: 14px;
  }

  .status-line--minutes {
    color: var(--text-primary);
    font-weight: 600;
  }

  .status-line--card {
    font-family: var(--font-mono);
    color: var(--text-primary);
    font-size: 13px;
  }

  .status-line--error {
    color: var(--danger);
  }

  .status-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .status-auth {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .action-danger {
    color: var(--danger);
  }

  /* --- Карточка «Полный доступ» --------------------------------------- */
  .plans {
    display: grid;
    scroll-margin-top: 18px;
  }

  .status-skeleton,
  .plans-skeleton {
    width: 100%;
  }

  .pass-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: clamp(15px, 2.2vw, 26px);
  }

  .pass-card-header {
    padding-right: 0;
  }

  /* Селектор срока: сегмент-контрол из шести точек. */
  .duration-picker {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }

  .duration-option {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 12px 4px 10px;
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    background: var(--surface-soft);
    color: var(--text-muted);
    cursor: pointer;
    transition: border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }

  .duration-option:hover {
    border-color: var(--glass-border-strong);
  }

  .duration-option--selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-soft));
    color: var(--text-primary);
  }

  .duration-option strong {
    font-family: var(--font-mono);
    font-size: 18px;
    line-height: 1;
    color: inherit;
  }

  .duration-option span {
    font-size: 11px;
  }

  .duration-badge {
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-solid));
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-style: normal;
    padding: 2px 7px;
    font-size: 9px;
    font-weight: 900;
    white-space: nowrap;
  }

  /* Карточка: flex-колонка, фичи растягиваются, CTA прижата к низу.
     Все карточки в ряду одной высоты (align-items: stretch на сетке). */
  .plan {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    padding: clamp(20px, 2.2vw, 24px);
  }

  .plan--highlighted {
    border-color: var(--glass-border-strong);
    box-shadow: var(--shadow-panel),
      0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .badge {
    position: absolute;
    top: 14px;
    right: 14px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent-2);
    font-family: var(--font-mono);
    padding: 5px 9px;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .plan-header {
    display: grid;
    gap: 6px;
    /* Не даём заголовку заезжать под бейдж. */
    padding-right: 84px;
  }

  .plan-header h2 {
    font-size: 18px;
    color: var(--text-primary);
  }

  .plan-header h3 {
    font-size: 15px;
    color: var(--text-primary);
  }

  .plan-description {
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.45;
  }

  .price {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .price strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 24px;
    line-height: 1;
  }

  .price span {
    color: var(--text-muted);
    font-size: 13px;
  }

  .features {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.45;
    /* Растягиваем список, чтобы CTA у всех карточек была на одном уровне. */
    flex: 1 1 auto;
    align-content: start;
  }

  .features li {
    display: flex;
    align-items: flex-start;
    gap: 9px;
  }

  .feature-check {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    color: var(--accent);
  }

  .plan-cta {
    margin-top: auto;
    display: grid;
    gap: 8px;
  }

  .plan-note {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
    text-align: center;
  }

  .plan-cta .primary-action,
  .plan-cta .secondary-action {
    width: 100%;
    justify-content: center;
    text-align: center;
  }

  .primary-action:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .current {
    color: var(--text-muted);
    cursor: default;
  }

  /* --- Пакеты минут ---------------------------------------------------- */
  .packs-section {
    display: grid;
    gap: clamp(10px, 1.4vw, 14px);
  }

  .packs-header p {
    margin-top: 4px;
  }

  .packs-header {
    padding: clamp(15px, 2.2vw, 20px);
  }

  .packs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 1.6vw, 16px);
    align-items: stretch;
  }

  /* --- Адаптив ---------------------------------------------------------- */
  @media (max-width: 900px) {
    .packs {
      grid-template-columns: 1fr;
    }

    .status {
      grid-template-columns: 1fr;
    }

    .duration-picker {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
  }

  @media (max-width: 640px) {
    .secondary-action,
    .primary-action {
      width: 100%;
    }
  }
</style>
