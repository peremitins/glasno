<script setup lang="ts">
  // Пейволл по образцу Mentala FeaturePaywallModal, два режима:
  // - 'minutes': у юзера есть тариф, но кончились минуты голоса → пакеты минут;
  // - 'plans': тарифа нет (или истёк) → основные тарифы.
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
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

  const plansData = ref<BillingPlansResponse | null>(null);
  const plansPending = ref(false);
  const checkoutPlanId = ref('');
  const errorMessage = ref('');

  watch(
    () => props.open,
    (open) => {
      if (open && !plansData.value && !plansPending.value) {
        void loadPlans();
      }
      if (open) {
        errorMessage.value = '';
      }
    }
  );

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

  const items = computed(() => {
    const plans = plansData.value?.plans || [];
    if (props.mode === 'minutes') {
      return plans.filter(
        (plan) => plan.kind === 'addon' && plan.isCheckoutEnabled
      );
    }
    return plans.filter(
      (plan) => plan.kind !== 'addon' && plan.isCheckoutEnabled
    );
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
      window.location.href = response.confirmationUrl;
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
        v-if="open"
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
    padding: 16px;
    background: color-mix(in srgb, #000 62%, transparent);
    backdrop-filter: blur(4px);
  }

  .paywall {
    position: relative;
    width: min(440px, 100%);
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
