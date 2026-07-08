<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { SplitText } from 'gsap/SplitText';

  withDefaults(
    defineProps<{
      text: string;
      tag?: string;
    }>(),
    { tag: 'h2' }
  );

  const el = ref<HTMLElement | null>(null);
  const nuxtApp = useNuxtApp();
  let split: SplitText | null = null;
  let trigger: ScrollTrigger | null = null;

  onMounted(async () => {
    if (nuxtApp.$reducedMotion || !el.value) return;

    // Ждём шрифт, иначе перенос строк посчитается по fallback и прыгнет.
    if (document.fonts?.ready) await document.fonts.ready;
    if (!el.value) return;

    split = new SplitText(el.value, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'rh-line',
    });

    gsap.set(split.lines, { yPercent: 115 });
    trigger = ScrollTrigger.create({
      trigger: el.value,
      start: 'top 86%',
      once: true,
      onEnter: () =>
        gsap.to(split!.lines, {
          yPercent: 0,
          duration: 0.9,
          ease: 'power4.out',
          stagger: 0.11,
        }),
    });
  });

  onBeforeUnmount(() => {
    trigger?.kill();
    split?.revert();
    split = null;
  });
</script>

<template>
  <component :is="tag" ref="el" class="rh">{{ text }}</component>
</template>

<style scoped>
  .rh {
    /* строки прячутся только после успешного split (JS активен) */
  }
  .rh :deep(.rh-line) {
    padding-bottom: 0.05em; /* чтобы маска не срезала нижние выносные */
  }
</style>
