<script setup lang="ts">
  import {
    ArrowRightIcon,
    BarChartIcon,
    CheckCircledIcon,
    FileTextIcon,
    LightningBoltIcon,
    MagicWandIcon,
    RocketIcon,
    SpeakerLoudIcon,
    SpeakerOffIcon,
  } from '@radix-icons/vue';
  import { usePreferredReducedMotion } from '@vueuse/core';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useHead, useRuntimeConfig } from 'nuxt/app';
  import { useLandingAppAuthUrl } from '@/composables/useLandingAppAuthUrl';

  type NavLink = {
    id: string;
    label: string;
  };

  type FeaturePoint = {
    title: string;
    text: string;
  };

  type DemoMessage = {
    role: 'ai' | 'candidate';
    label: string;
    text: string;
  };

  type PricingPlan = {
    id: string;
    name: string;
    price: string;
    period: string;
    badge: string;
    description: string;
    features: string[];
    highlighted?: boolean;
  };

  const runtimeConfig = useRuntimeConfig();
  const appAuthUrl = useLandingAppAuthUrl();
  const reducedMotion = usePreferredReducedMotion();
  const isReducedMotion = computed(() => reducedMotion.value === 'reduce');
  const isSoundOn = ref(true);
  const activeStoryStep = ref(0);
  const landingRoot = ref<HTMLElement | null>(null);

  let gsapContext: gsap.Context | null = null;
  let gsapMedia: gsap.MatchMedia | null = null;

  const siteUrl = computed(() =>
    String(runtimeConfig.public.landingSiteUrl || 'https://glasno.app').replace(
      /\/$/,
      ''
    )
  );
  const canonicalUrl = computed(() => `${siteUrl.value}/`);
  const privacyUrl = '/legal/privacy-policy-ru.html';
  const termsUrl = '/legal/terms-of-service-ru.html';

  const navLinks: NavLink[] = [
    { id: 'voice', label: 'Голос' },
    { id: 'hints', label: 'Подсказки' },
    { id: 'report', label: 'Разбор' },
    { id: 'pricing', label: 'Тарифы' },
  ];

  const heroStats = [
    { value: '30 мин', label: 'голоса в разовой подготовке' },
    { value: '1 запуск', label: 'быстрое интервью бесплатно' },
    { value: '0-100', label: 'оценка по критериям' },
  ];

  const featurePoints: FeaturePoint[] = [
    {
      title: 'Интервью по реальной вакансии',
      text: 'Гласно разбирает роль, стек, уровень и ожидания компании, а не задаёт случайный список вопросов.',
    },
    {
      title: 'Голос как на живом созвоне',
      text: 'AI-интервьюер задаёт вопрос голосом, слушает ответ и ведёт live-транскрипт в одной ленте.',
    },
    {
      title: 'Подсказки в моменте',
      text: 'Когда кандидат застрял, сервис показывает структуру ответа сбоку, не подставляя готовый текст.',
    },
    {
      title: 'Разбор, который можно применить',
      text: 'После сессии видны ошибки, сильный вариант ответа, STAR-структура и три правки до интервью.',
    },
  ];

  const transcript: DemoMessage[] = [
    {
      role: 'ai',
      label: 'AI-интервьюер',
      text: 'Расскажите о ситуации, где вы улучшили процесс и смогли показать измеримый результат.',
    },
    {
      role: 'candidate',
      label: 'Кандидат',
      text: 'На прошлом месте я заметил, что заявки от клиентов терялись между сменами. Я собрал причины, предложил общий статус-лист и договорился о ежедневной передаче.',
    },
    {
      role: 'ai',
      label: 'AI-интервьюер',
      text: 'Хорошо. Добавьте, пожалуйста, цифру: что изменилось после внедрения?',
    },
  ];

  const storySteps = [
    {
      kicker: 'Шаг 01',
      title: 'Вставьте вакансию или роль',
      text: 'Сервис понимает контекст: обязанности, уровень, стек, формат интервью и возможные зоны риска.',
    },
    {
      kicker: 'Шаг 02',
      title: 'Пройдите репетицию голосом',
      text: 'Гласно ведёт разговор как интервьюер, но оставляет пользователю контроль: текст, диктовка или realtime voice.',
    },
    {
      kicker: 'Шаг 03',
      title: 'Получите разбор и план правок',
      text: 'Отчёт показывает, где не хватило конкретики, какие фразы звучат слабо и как ответить сильнее.',
    },
  ];

  const reportMetrics = [
    { label: 'Структура', value: 82 },
    { label: 'Конкретика', value: 64 },
    { label: 'Связь с вакансией', value: 76 },
    { label: 'Уверенность речи', value: 71 },
  ];

  const pricingPlans: PricingPlan[] = [
    {
      id: 'free',
      name: 'Бесплатно',
      price: '0 ₽',
      period: 'первый запуск',
      badge: 'Старт',
      description: 'Короткое интервью, чтобы почувствовать формат без оплаты.',
      features: [
        '1 быстрое интервью на 5-7 минут',
        'Ответы текстом или диктовкой',
        'Разбор с оценками и рекомендациями',
      ],
    },
    {
      id: 'single_prep',
      name: 'Разовая подготовка',
      price: '399 ₽',
      period: '7 дней',
      badge: 'Собес на носу',
      description: 'Одна глубокая репетиция перед конкретным интервью.',
      highlighted: true,
      features: [
        '1 интервью любой длины и глубины',
        '30 минут живого голосового интервью с AI',
        'Подробный отчёт, рекомендации и PDF',
      ],
    },
    {
      id: 'pro_monthly',
      name: 'Pro',
      price: '990 ₽',
      period: '30 дней',
      badge: 'Активный поиск',
      description: 'Для серии собеседований и регулярной тренировки.',
      features: [
        'Интервью без ограничений',
        '60 минут голосового интервью с AI в месяц',
        'История прогресса и докупка минут',
      ],
    },
  ];

  const faq = [
    {
      q: 'Это заменяет реальное собеседование?',
      a: 'Нет. Гласно нужен, чтобы безопасно отрепетировать ответы, увидеть слабые места и прийти на реальное интервью собраннее.',
    },
    {
      q: 'Голосовое интервью работает в Telegram?',
      a: 'Первый полноценный realtime-режим работает в браузере. Telegram используется как вход и будущая companion-поверхность.',
    },
    {
      q: 'Можно ли тренироваться без вакансии?',
      a: 'Да. Можно выбрать роль и уровень вручную, но с реальной вакансией вопросы и отчёт будут точнее.',
    },
    {
      q: 'Подсказки портят оценку?',
      a: 'Нет. Они помечаются в отчёте как тренировочный контекст, чтобы пользователь честно видел, где ответ был самостоятельным.',
    },
  ];

  function toggleSound() {
    isSoundOn.value = !isSoundOn.value;
  }

  function scrollToSection(id: string) {
    if (typeof document === 'undefined') return;
    document.getElementById(id)?.scrollIntoView({
      behavior: isReducedMotion.value ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  onMounted(() => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      isReducedMotion.value
    ) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    gsapContext = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.landing-reveal').forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 0, y: 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.72,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: element,
              start: 'top 84%',
              once: true,
            },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>('.metric-bar-fill').forEach((element) => {
        gsap.fromTo(
          element,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.9,
            ease: 'power3.out',
            transformOrigin: 'left center',
            scrollTrigger: {
              trigger: element,
              start: 'top 88%',
              once: true,
            },
          }
        );
      });
    }, landingRoot.value || undefined);

    gsapMedia = gsap.matchMedia();
    gsapMedia.add('(min-width: 1024px)', () => {
      const stickyPanel = document.querySelector<HTMLElement>(
        '.scroll-demo-sticky'
      );
      const steps = gsap.utils.toArray<HTMLElement>('.story-step');

      if (!stickyPanel || steps.length === 0) {
        return;
      }

      const pin = ScrollTrigger.create({
        trigger: '.scrolltelling',
        start: 'top top+=96',
        end: 'bottom bottom-=120',
        pin: stickyPanel,
        pinSpacing: false,
        anticipatePin: 1,
      });

      const triggers = steps.map((step, index) =>
        ScrollTrigger.create({
          trigger: step,
          start: 'top center',
          end: 'bottom center',
          onEnter: () => {
            activeStoryStep.value = index;
          },
          onEnterBack: () => {
            activeStoryStep.value = index;
          },
        })
      );

      return () => {
        pin.kill();
        triggers.forEach((trigger) => trigger.kill());
      };
    });
  });

  onBeforeUnmount(() => {
    gsapMedia?.revert();
    gsapContext?.revert();
  });

  useHead(() => ({
    title: 'Гласно - тренажёр собеседований с живым голосовым AI',
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
    meta: [
      {
        name: 'description',
        content:
          'Гласно помогает пройти репетицию собеседования голосом, получить подсказки во время ответа и подробный разбор по вакансии.',
      },
      {
        name: 'robots',
        content:
          'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      },
      {
        property: 'og:title',
        content: 'Гласно - репетиция собеседования голосом',
      },
      {
        property: 'og:description',
        content:
          'Вставьте вакансию, поговорите с AI-интервьюером голосом и получите разбор: ошибки, подсказки, STAR и план правок.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: canonicalUrl.value },
      { property: 'og:site_name', content: 'Гласно' },
      { property: 'og:locale', content: 'ru_RU' },
      { name: 'twitter:card', content: 'summary_large_image' },
      {
        name: 'twitter:title',
        content: 'Гласно - тренажёр собеседований',
      },
      {
        name: 'twitter:description',
        content:
          'Живое голосовое интервью, подсказки в моменте и отчёт по каждому ответу.',
      },
    ],
    script: [
      {
        key: 'ld-org',
        type: 'application/ld+json',
        textContent: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Гласно',
          url: canonicalUrl.value,
          email: 'support@glasno.app',
        }),
      },
      {
        key: 'ld-website',
        type: 'application/ld+json',
        textContent: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Гласно',
          url: canonicalUrl.value,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${canonicalUrl.value}?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }),
      },
    ],
  }));
</script>

<template>
  <main ref="landingRoot" class="landing-page">
    <div class="page-grid" aria-hidden="true" />
    <div class="page-noise" aria-hidden="true" />

    <header class="site-header">
      <a class="brand-mark" href="#top" @click.prevent="scrollToSection('top')">
        <span class="brand-mark__sign">Г</span>
        <span>Гласно</span>
      </a>

      <nav class="site-nav" aria-label="Навигация лендинга">
        <button
          v-for="link in navLinks"
          :key="link.id"
          type="button"
          @click="scrollToSection(link.id)"
        >
          {{ link.label }}
        </button>
      </nav>

      <a class="header-cta" :href="appAuthUrl">
        <span>Начать</span>
        <ArrowRightIcon aria-hidden="true" />
      </a>
    </header>

    <section id="top" class="hero-section">
      <div class="hero-copy landing-reveal">
        <p class="eyebrow">AI-тренажёр собеседований</p>
        <h1>Репетиция интервью, которая звучит как настоящий созвон.</h1>
        <p class="hero-lead">
          Вставьте вакансию, поговорите с AI-интервьюером голосом и получите
          разбор: где не хватило конкретики, как усилить ответ и что исправить
          до реального интервью.
        </p>

        <div class="hero-actions">
          <a class="primary-button" :href="appAuthUrl">
            <span>Начать бесплатную репетицию</span>
            <span class="button-icon" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </a>
          <button
            class="secondary-button"
            type="button"
            @click="scrollToSection('voice')"
          >
            <SpeakerLoudIcon aria-hidden="true" />
            <span>Попробовать голосом</span>
          </button>
        </div>

        <dl class="hero-stats" aria-label="Ключевые показатели">
          <div v-for="stat in heroStats" :key="stat.label">
            <dt>{{ stat.value }}</dt>
            <dd>{{ stat.label }}</dd>
          </div>
        </dl>
      </div>

      <aside class="hero-console landing-reveal" aria-label="Демо интерфейса">
        <div class="console-topline">
          <span class="status-dot" aria-hidden="true" />
          <span>Realtime voice session</span>
          <span>07:42</span>
        </div>

        <div class="job-card">
          <p class="panel-label">Вакансия</p>
          <h2>Менеджер B2B-продаж</h2>
          <div class="job-tags" aria-label="Контекст вакансии">
            <span>Переговоры</span>
            <span>CRM</span>
            <span>План продаж</span>
          </div>
        </div>

        <div class="voice-player">
          <div class="voice-player__meta">
            <span>AI говорит</span>
            <strong>вопрос 2 из 5</strong>
          </div>
          <div class="waveform" aria-hidden="true">
            <span v-for="index in 34" :key="index" />
          </div>
          <button
            class="sound-toggle"
            type="button"
            :aria-pressed="isSoundOn"
            @click="toggleSound"
          >
            <SpeakerLoudIcon v-if="isSoundOn" aria-hidden="true" />
            <SpeakerOffIcon v-else aria-hidden="true" />
            <span>{{ isSoundOn ? 'Звук включён' : 'Без звука' }}</span>
          </button>
        </div>

        <div class="hint-strip">
          <MagicWandIcon aria-hidden="true" />
          <span>Подсказка: добавьте результат в цифрах и связь с вакансией.</span>
        </div>
      </aside>
    </section>

    <section class="feature-band">
      <article
        v-for="point in featurePoints"
        :key="point.title"
        class="feature-point landing-reveal"
      >
        <h2>{{ point.title }}</h2>
        <p>{{ point.text }}</p>
      </article>
    </section>

    <section id="voice" class="voice-section scroll-section">
      <div class="section-heading landing-reveal">
        <p class="eyebrow">Голосовой режим</p>
        <h2>Пользователь слышит вопрос, отвечает голосом и видит live-транскрипт.</h2>
        <p>
          Демо имитирует ценность продукта без тяжёлых видеофайлов: waveform,
          статус речи, субтитры и переключатель звука уже объясняют, что это
          именно голосовая тренировка.
        </p>
      </div>

      <div class="voice-demo landing-reveal">
        <div class="video-shell">
          <div class="video-grid">
            <div class="interviewer-pane">
              <div class="avatar-plate">
                <span aria-hidden="true">AI</span>
              </div>
              <p>Интервьюер</p>
              <strong>Нейтральный тон</strong>
              <div class="equalizer" aria-hidden="true">
                <span v-for="index in 9" :key="index" />
              </div>
            </div>

            <div class="candidate-pane">
              <div class="camera-frame">
                <span aria-hidden="true" />
              </div>
              <p>Кандидат</p>
              <strong>Микрофон активен</strong>
            </div>
          </div>

          <div class="transcript-list">
            <article
              v-for="message in transcript"
              :key="message.text"
              class="transcript-bubble"
              :class="`transcript-bubble--${message.role}`"
            >
              <span>{{ message.label }}</span>
              <p>{{ message.text }}</p>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section id="hints" class="scrolltelling">
      <div class="scroll-demo-sticky landing-reveal">
        <div class="demo-frame">
          <div class="demo-frame__header">
            <span>Live coaching layer</span>
            <strong>Подсказки не перебивают разговор</strong>
          </div>

          <div class="active-question">
            <p>Текущий вопрос</p>
            <h3>Опишите сложный клиентский конфликт и как вы его закрыли.</h3>
          </div>

          <div class="hint-panel">
            <p class="panel-label">Подсказка в моменте</p>
            <ul>
              <li>Назовите ситуацию и вашу роль.</li>
              <li>Добавьте действие, а не только общую фразу.</li>
              <li>Завершите результатом: срок, сумма, конверсия или SLA.</li>
            </ul>
          </div>

          <div class="story-progress" aria-label="Прогресс сценария">
            <span
              v-for="(_, index) in storySteps"
              :key="index"
              :class="{ 'story-progress__dot--active': activeStoryStep === index }"
            />
          </div>
        </div>
      </div>

      <div class="story-copy">
        <article
          v-for="(step, index) in storySteps"
          :key="step.title"
          class="story-step landing-reveal"
          :class="{ 'story-step--active': activeStoryStep === index }"
        >
          <p>{{ step.kicker }}</p>
          <h2>{{ step.title }}</h2>
          <span>{{ step.text }}</span>
        </article>
      </div>
    </section>

    <section id="report" class="report-section scroll-section">
      <div class="section-heading landing-reveal">
        <p class="eyebrow">Разбор после сессии</p>
        <h2>Отчёт показывает не «молодец», а конкретные правки до интервью.</h2>
      </div>

      <div class="report-layout">
        <article class="report-score landing-reveal">
          <p class="panel-label">Итог</p>
          <div class="score-ring" aria-label="Оценка 76 из 100">
            <span>76</span>
            <small>/100</small>
          </div>
          <h3>Готов, но нужно дожать конкретику.</h3>
          <p>
            Ответ звучит уверенно, но слабее становится там, где нет результата
            и связи с ожиданиями вакансии.
          </p>
        </article>

        <article class="report-metrics landing-reveal">
          <p class="panel-label">Критерии</p>
          <div
            v-for="metric in reportMetrics"
            :key="metric.label"
            class="metric-row"
          >
            <div>
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
            </div>
            <div class="metric-bar" aria-hidden="true">
              <span
                class="metric-bar-fill"
                :data-value="metric.value"
                :style="{ width: `${metric.value}%` }"
              />
            </div>
          </div>
        </article>

        <article class="report-fixes landing-reveal">
          <p class="panel-label">3 главные правки</p>
          <ol>
            <li>Заменить общие формулировки на действия: что именно сделали.</li>
            <li>Добавить цифру результата или понятный масштаб изменения.</li>
            <li>Связать пример с задачами из вакансии.</li>
          </ol>
        </article>
      </div>
    </section>

    <section id="pricing" class="pricing-section scroll-section">
      <div class="section-heading landing-reveal">
        <p class="eyebrow">Тарифы</p>
        <h2>Бесплатный старт, разовая подготовка перед собесом и Pro для поиска.</h2>
      </div>

      <div class="pricing-grid">
        <article
          v-for="plan in pricingPlans"
          :key="plan.id"
          class="pricing-card landing-reveal"
          :class="{ 'pricing-card--highlighted': plan.highlighted }"
        >
          <div class="pricing-card__top">
            <span>{{ plan.badge }}</span>
            <h3>{{ plan.name }}</h3>
            <p>{{ plan.description }}</p>
          </div>

          <div class="price-line">
            <strong>{{ plan.price }}</strong>
            <span>{{ plan.period }}</span>
          </div>

          <ul>
            <li v-for="feature in plan.features" :key="feature">
              <CheckCircledIcon aria-hidden="true" />
              <span>{{ feature }}</span>
            </li>
          </ul>

          <a class="plan-button" :href="appAuthUrl">
            <span>{{ plan.id === 'free' ? 'Начать' : 'Выбрать тариф' }}</span>
            <ArrowRightIcon aria-hidden="true" />
          </a>
        </article>
      </div>
    </section>

    <section class="trust-section scroll-section">
      <div class="trust-strip landing-reveal">
        <article>
          <RocketIcon aria-hidden="true" />
          <h2>Web + Telegram</h2>
          <p>Веб остаётся основным местом живого интервью, отчётов и оплаты.</p>
        </article>
        <article>
          <LightningBoltIcon aria-hidden="true" />
          <h2>Без Whisper на старте</h2>
          <p>Диктовка работает через браузерный Web Speech API, realtime voice - через OpenAI.</p>
        </article>
        <article>
          <BarChartIcon aria-hidden="true" />
          <h2>Метрики ответа</h2>
          <p>Структура, конкретика, релевантность вакансии и уверенность речи.</p>
        </article>
        <article>
          <FileTextIcon aria-hidden="true" />
          <h2>Документы</h2>
          <p>
            <a :href="privacyUrl">Политика конфиденциальности</a>
            <span>и</span>
            <a :href="termsUrl">условия использования</a>
          </p>
        </article>
      </div>
    </section>

    <section class="faq-section scroll-section">
      <div class="section-heading landing-reveal">
        <p class="eyebrow">FAQ</p>
        <h2>Коротко о запуске и ограничениях.</h2>
      </div>

      <div class="faq-list">
        <article v-for="item in faq" :key="item.q" class="landing-reveal">
          <h3>{{ item.q }}</h3>
          <p>{{ item.a }}</p>
        </article>
      </div>
    </section>

    <section class="final-cta landing-reveal">
      <p class="eyebrow">Первый запуск бесплатный</p>
      <h2>Проверьте, как звучит ваш ответ до того, как его услышит работодатель.</h2>
      <a class="primary-button" :href="appAuthUrl">
        <span>Начать бесплатную репетицию</span>
        <span class="button-icon" aria-hidden="true">
          <ArrowRightIcon />
        </span>
      </a>
    </section>

    <footer class="site-footer">
      <div>
        <strong>Гласно</strong>
        <span>© 2026</span>
      </div>
      <nav aria-label="Юридические ссылки">
        <a href="mailto:support@glasno.app">support@glasno.app</a>
        <a :href="privacyUrl">Политика конфиденциальности</a>
        <a :href="termsUrl">Условия использования</a>
      </nav>
    </footer>
  </main>
</template>
