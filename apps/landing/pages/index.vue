<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useHead, useRuntimeConfig } from 'nuxt/app';
  import { useReveal } from '@/composables/useReveal';
  import { useLandingContent } from '@/composables/useLandingContent';

  const runtimeConfig = useRuntimeConfig();
  const landingRoot = ref<HTMLElement | null>(null);
  const { faq, pricing } = useLandingContent();

  // Глобальный пакетный reveal всех [data-reveal] на странице.
  useReveal(landingRoot);

  const siteUrl = computed(() =>
    String(runtimeConfig.public.landingSiteUrl || 'https://glasno.app').replace(
      /\/$/,
      ''
    )
  );
  const canonicalUrl = computed(() => `${siteUrl.value}/`);
  // Карточка ссылки во всех мессенджерах и соцсетях: файл лежит в
  // public/og-cover.jpg, ровно 1200×630. JPEG, а не PNG, намеренно — тот же
  // кадр в PNG весит ~576 КБ, а WhatsApp не рисует превью тяжелее ~300 КБ.
  // Меняете картинку — держите те же размер и вес, иначе превью тихо отвалится
  // на части платформ.
  const ogImage = computed(() => `${siteUrl.value}/og-cover.jpg`);

  // Длина под сниппет: description укладывается в ~130 символов, чтобы Яндекс
  // и Google показывали его целиком, а не обрезали на середине фразы.
  const description =
    'Репетиция собеседования голосом: вопросы по вашей вакансии, подсказки во время ответа и подробный разбор. Первое интервью бесплатно.';

  const priceValue = (raw: string) =>
    Number(String(raw).replace(/[^\d]/g, '')) || 0;

  // Structured data: помогает Google/Яндексу строить rich-сниппеты
  // (FAQ-аккордеон в выдаче, карточка приложения с ценой).
  const structuredData = computed(() => [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Гласно',
      url: canonicalUrl.value,
      email: 'peremitinns@gmail.com',
      logo: `${siteUrl.value}/brand/logo.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Гласно',
      url: canonicalUrl.value,
      inLanguage: 'ru-RU',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Гласно',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Telegram',
      inLanguage: 'ru-RU',
      description,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'RUB',
        // Границы берём из тех же тарифов, что видит пользователь: разметка,
        // обещающая цену ниже реальной, — повод для санкций за rich-сниппет.
        lowPrice: Math.min(...pricing.plans.map((p) => priceValue(p.price))),
        highPrice: Math.max(...pricing.plans.map((p) => priceValue(p.price))),
        offerCount: pricing.plans.length,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ]);

  useHead(() => ({
    // Запрос впереди, бренд в конце: «Гласно» пока не ищут по имени, а
    // «тренажёр собеседований» — ищут. ~58 символов: влезает в выдачу целиком.
    title: 'Тренажёр собеседований: репетиция интервью голосом — Гласно',
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
    meta: [
      { name: 'description', content: description },
      {
        name: 'robots',
        content:
          'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      },
      { name: 'format-detection', content: 'telephone=no' },
      // Права на сайт подтверждены вне разметки: Яндекс — файлом
      // /yandex_3919a99c8052b4c2.html в public (удалять нельзя, проверяется
      // повторно), Google — DNS-записью домена. Мета-теги не нужны.
      // В ленте и мессенджере карточку читают глазами, а не парсят по ключам,
      // поэтому здесь бренд впереди и формулировка живее, чем в <title>.
      { property: 'og:title', content: 'Гласно — репетиция собеседования голосом' },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: canonicalUrl.value },
      { property: 'og:site_name', content: 'Гласно' },
      { property: 'og:locale', content: 'ru_RU' },
      { property: 'og:image', content: ogImage.value },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:type', content: 'image/jpeg' },
      {
        property: 'og:image:alt',
        content: 'Гласно: тренажёр собеседований голосом',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Гласно — репетиция собеседования голосом' },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage.value },
    ],
    script: structuredData.value.map((data, i) => ({
      key: `ld-${i}`,
      type: 'application/ld+json',
      innerHTML: JSON.stringify(data),
    })),
  }));
</script>

<template>
  <div ref="landingRoot" class="landing">
    <TheHeader />
    <main>
      <HeroSection />
      <HowItWorks />
      <VoiceShowcase />
      <HintsScrollytelling />
      <ExplainFeature />
      <ReportSection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </main>
    <TheFooter />
    <!-- Cookie-баннер временно отключён: сейчас ни на что не влияет технически (аналитика не гейтится согласием), решили не показывать до доработки. См. обсуждение 2026-07-17. -->
    <!-- <CookieConsentBanner /> -->
  </div>
</template>
