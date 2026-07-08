<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  const props = withDefaults(
    defineProps<{
      value: number;
      duration?: number;
    }>(),
    { duration: 1.4 }
  );

  const el = ref<HTMLElement | null>(null);
  const display = ref(props.value);
  const nuxtApp = useNuxtApp();
  let trigger: ScrollTrigger | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion || !el.value) return;

    display.value = 0;
    const counter = { n: 0 };
    trigger = ScrollTrigger.create({
      trigger: el.value,
      start: 'top 90%',
      once: true,
      onEnter: () =>
        gsap.to(counter, {
          n: props.value,
          duration: props.duration,
          ease: 'power2.out',
          onUpdate: () => {
            display.value = Math.round(counter.n);
          },
        }),
    });
  });

  onBeforeUnmount(() => trigger?.kill());
</script>

<template>
  <span ref="el" class="l-tnum">{{ display }}</span>
</template>
