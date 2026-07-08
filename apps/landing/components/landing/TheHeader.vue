<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { ArrowRightIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';
  import { useLandingAppAuthUrl } from '@/composables/useLandingAppAuthUrl';
  import { useScrollTo } from '@/composables/useMotion';

  const { nav } = useLandingContent();
  const appAuthUrl = useLandingAppAuthUrl();
  const scrollTo = useScrollTo();

  const scrolled = ref(false);

  function onScroll() {
    scrolled.value = window.scrollY > 12;
  }

  function goTo(id: string) {
    scrollTo(`#${id}`, -80);
  }

  onMounted(() => {
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  });
  onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <header class="hdr" :class="{ 'hdr--scrolled': scrolled }">
    <div class="hdr__inner l-container">
      <a
        class="hdr__brand"
        href="#top"
        aria-label="Гласно, в начало"
        @click.prevent="goTo('top')"
      >
        <span class="hdr__brand-dot" aria-hidden="true" />
        Гласно
      </a>

      <nav class="hdr__nav" aria-label="Разделы">
        <button
          v-for="link in nav"
          :key="link.id"
          type="button"
          @click="goTo(link.id)"
        >
          {{ link.label }}
        </button>
      </nav>

      <a class="hdr__cta" :href="appAuthUrl">
        <span>Начать</span>
        <ArrowRightIcon aria-hidden="true" />
      </a>
    </div>
  </header>
</template>

<style scoped>
  .hdr {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 50;
    padding-block: 14px;
    border-bottom: 1px solid transparent;
    transition:
      background var(--l-dur-2) var(--l-ease),
      border-color var(--l-dur-2) var(--l-ease),
      backdrop-filter var(--l-dur-2) var(--l-ease);
  }

  .hdr--scrolled {
    background: oklch(0.145 0.01 260 / 0.72);
    border-bottom-color: var(--l-line);
    backdrop-filter: blur(14px) saturate(150%);
  }

  .hdr__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .hdr__brand {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--l-text);
  }

  .hdr__brand-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--l-warm-solid);
    box-shadow: 0 0 14px 1px oklch(0.77 0.155 58 / 0.6);
  }

  .hdr__nav {
    display: flex;
    gap: 4px;
  }

  .hdr__nav button {
    padding: 8px 14px;
    border-radius: var(--l-r-pill);
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    background: transparent;
    border: 0;
    transition:
      color var(--l-dur-1) var(--l-ease),
      background var(--l-dur-1) var(--l-ease);
  }

  .hdr__nav button:hover {
    color: var(--l-text);
    background: var(--l-surface-soft, oklch(1 0 0 / 0.05));
  }

  .hdr__cta {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 18px;
    border-radius: var(--l-r-pill);
    font-size: var(--l-fs-sm);
    font-weight: 500;
    color: var(--l-text);
    border: 1px solid var(--l-line-hi);
    transition:
      border-color var(--l-dur-1) var(--l-ease),
      transform var(--l-dur-1) var(--l-ease);
  }

  .hdr__cta svg {
    width: 15px;
    height: 15px;
    transition: transform var(--l-dur-1) var(--l-ease);
  }

  .hdr__cta:hover {
    border-color: var(--l-line-warm);
  }
  .hdr__cta:hover svg {
    transform: translateX(3px);
  }

  @media (max-width: 720px) {
    .hdr__nav {
      display: none;
    }
  }
</style>
