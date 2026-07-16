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
  const ogImage = computed(() => `${siteUrl.value}/og-cover.png`);

  const description =
    'Отрепетируйте собеседование голосом: интервью по вашей вакансии, подсказки во время ответа и честный разбор каждого ответа — до встречи с работодателем.';

  const yandexVerification = String(
    runtimeConfig.public.yandexVerification || ''
  );
  const googleVerification = String(
    runtimeConfig.public.googleSiteVerification || ''
  );

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
        lowPrice: 0,
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
    title: 'Гласно — тренажёр собеседований голосом',
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
    meta: [
      { name: 'description', content: description },
      {
        name: 'robots',
        content:
          'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      },
      { name: 'format-detection', content: 'telephone=no' },
      ...(yandexVerification
        ? [{ name: 'yandex-verification', content: yandexVerification }]
        : []),
      ...(googleVerification
        ? [{ name: 'google-site-verification', content: googleVerification }]
        : []),
      { property: 'og:title', content: 'Гласно — репетиция собеседования голосом' },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: canonicalUrl.value },
      { property: 'og:site_name', content: 'Гласно' },
      { property: 'og:locale', content: 'ru_RU' },
      { property: 'og:image', content: ogImage.value },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:type', content: 'image/png' },
      {
        property: 'og:image:alt',
        content: 'Гласно — тренажёр собеседований голосом',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Гласно — тренажёр собеседований' },
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
    <CookieConsentBanner />
  </div>
</template>
