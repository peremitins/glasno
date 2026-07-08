<script setup lang="ts">
  import { ref } from 'vue';
  import { PlusIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { faq } = useLandingContent();
  const open = ref<number | null>(0);

  function toggle(i: number) {
    open.value = open.value === i ? null : i;
  }
</script>

<template>
  <section id="faq" class="faq">
    <div class="faq__inner l-container">
      <SectionHeading eyebrow="Вопросы" title="Коротко о главном." />

      <ul class="faq__list">
        <li
          v-for="(item, i) in faq"
          :key="i"
          class="faq__item"
          :class="{ 'faq__item--open': open === i }"
          data-reveal
        >
          <button
            type="button"
            class="faq__q"
            :aria-expanded="open === i"
            @click="toggle(i)"
          >
            <span>{{ item.q }}</span>
            <PlusIcon class="faq__icon" aria-hidden="true" />
          </button>
          <div class="faq__body">
            <div class="faq__body-inner">
              <p>{{ item.a }}</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
  .faq {
    padding-block: var(--l-section-y);
  }
  .faq__inner {
    display: grid;
    grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
    gap: clamp(32px, 6vw, 88px);
    align-items: start;
  }

  .faq__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .faq__item {
    border-top: 1px solid var(--l-line);
  }
  .faq__item:last-child {
    border-bottom: 1px solid var(--l-line);
  }

  .faq__q {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding-block: clamp(18px, 2.4vw, 26px);
    background: transparent;
    border: 0;
    text-align: left;
    font-size: var(--l-fs-h3);
    font-weight: 500;
    color: var(--l-text);
    transition: color var(--l-dur-1) var(--l-ease);
  }
  .faq__q:hover {
    color: var(--l-warm);
  }

  .faq__icon {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    color: var(--l-text-mut);
    transition: transform var(--l-dur-2) var(--l-ease);
  }
  .faq__item--open .faq__icon {
    transform: rotate(45deg);
    color: var(--l-warm);
  }

  .faq__body {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--l-dur-2) var(--l-ease);
  }
  .faq__item--open .faq__body {
    grid-template-rows: 1fr;
  }
  .faq__body-inner {
    overflow: hidden;
  }
  .faq__body-inner p {
    padding-bottom: clamp(18px, 2.4vw, 26px);
    max-width: 60ch;
    color: var(--l-text-soft);
  }

  @media (max-width: 899px) {
    .faq__inner {
      grid-template-columns: 1fr;
      gap: 32px;
    }
  }
</style>
