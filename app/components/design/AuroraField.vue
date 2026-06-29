<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import gsap from 'gsap';

const rootRef = ref<HTMLElement | null>(null);
let timeline: gsap.core.Timeline | null = null;

onMounted(() => {
  if (!rootRef.value) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layers = Array.from(
    rootRef.value.querySelectorAll<HTMLElement>('.aurora-field__layer')
  );
  if (layers.length < 3) return;
  const [primary, secondary, tertiary] = layers as [
    HTMLElement,
    HTMLElement,
    HTMLElement,
  ];
  timeline = gsap.timeline({
    repeat: -1,
    yoyo: true,
    defaults: {
      duration: 11,
      ease: 'sine.inOut',
    },
  });

  timeline
    .to(primary, { xPercent: 4, yPercent: -3, scale: 1.08, opacity: 0.9 }, 0)
    .to(secondary, { xPercent: -5, yPercent: 4, scale: 1.12, opacity: 0.72 }, 0)
    .to(tertiary, { xPercent: 3, yPercent: 5, scale: 1.06, opacity: 0.54 }, 0);
});

onBeforeUnmount(() => {
  timeline?.kill();
  timeline = null;
});
</script>

<template>
  <div ref="rootRef" class="aurora-field" aria-hidden="true">
    <span class="aurora-field__layer aurora-field__layer--primary" />
    <span class="aurora-field__layer aurora-field__layer--secondary" />
    <span class="aurora-field__layer aurora-field__layer--tertiary" />
  </div>
</template>

<style scoped>
.aurora-field {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.aurora-field__layer {
  position: absolute;
  border-radius: 999px;
  filter: blur(54px);
  opacity: 0.62;
  transform: translate3d(0, 0, 0);
  will-change: transform, opacity;
}

.aurora-field__layer--primary {
  width: 48vw;
  height: 36vw;
  top: -12vw;
  right: -14vw;
  background: var(--ambient-primary);
}

.aurora-field__layer--secondary {
  width: 44vw;
  height: 34vw;
  bottom: -16vw;
  left: 10vw;
  background: var(--ambient-secondary);
}

.aurora-field__layer--tertiary {
  width: 34vw;
  height: 28vw;
  top: 28vh;
  left: 34vw;
  background: var(--ambient-tertiary);
}

@media (max-width: 768px) {
  .aurora-field__layer {
    filter: blur(42px);
  }

  .aurora-field__layer--primary,
  .aurora-field__layer--secondary,
  .aurora-field__layer--tertiary {
    width: 90vw;
    height: 70vw;
  }
}
</style>
