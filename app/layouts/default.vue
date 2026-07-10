<script setup lang="ts">
  import {
    BarChartIcon,
    ClockIcon,
    DoubleArrowLeftIcon,
    DoubleArrowRightIcon,
    GearIcon,
    HomeIcon,
    MoonIcon,
    PersonIcon,
    PlusCircledIcon,
    SunIcon,
  } from '@radix-icons/vue';
  import { computed, defineComponent, useSlots } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AuroraField from '@/app/components/design/AuroraField.vue';
  import type { DashboardSummaryResponse } from '@/shared/dto';

  const { t } = useI18n();
  const api = useAPI();
  const slots = useSlots();
  const { theme, toggleTheme } = useDesignPreferences();
  const isSidebarCollapsed = useLocalStorage('glasno-sidebar-collapsed', false);
  const { data: layoutSummary } = await useAsyncData(
    'layout-dashboard-summary',
    async () => {
      try {
        return await api<DashboardSummaryResponse>('/api/dashboard/summary');
      } catch {
        return null;
      }
    }
  );

  const completedSessions = computed(
    () => layoutSummary.value?.totals.completed ?? 0
  );
  const averageScore = computed(() => {
    const score = layoutSummary.value?.totals.averageScore;
    return typeof score === 'number'
      ? t('common.score', { score })
      : t('common.noScore');
  });

  const SlotOutlet = defineComponent({
    name: 'DefaultLayoutSlotOutlet',
    setup() {
      return () => slots.default?.() ?? [];
    },
  });

  const nav = [
    { to: '/', key: 'dashboard', icon: HomeIcon },
    { to: '/interview/new', key: 'newInterview', icon: PlusCircledIcon },
    { to: '/history', key: 'history', icon: ClockIcon },
    { to: '/pricing', key: 'pricing', icon: BarChartIcon },
    { to: '/profile', key: 'profile', icon: PersonIcon },
  ];
</script>

<template>
  <div
    class="layout-shell"
    :class="{ 'layout-shell--collapsed': isSidebarCollapsed }"
  >
    <AuroraField />

    <aside class="sidebar glass-frame glass-frame--soft">
      <div class="sidebar-top">
        <NuxtLink to="/" class="brand" aria-label="Гласно">
          <span class="brand-mark">
            <img
              class="brand-logo"
              src="/brand/logo.webp"
              alt=""
              width="44"
              height="44"
              aria-hidden="true"
            />
          </span>
          <span class="brand-text">{{ t('app.name') }}</span>
        </NuxtLink>

        <button
          v-tooltip="
            isSidebarCollapsed
              ? t('layout.sidebarExpand')
              : t('layout.sidebarCollapse')
          "
          type="button"
          class="sidebar-toggle"
          :aria-label="
            isSidebarCollapsed
              ? t('layout.sidebarExpand')
              : t('layout.sidebarCollapse')
          "
          @click="isSidebarCollapsed = !isSidebarCollapsed"
        >
          <DoubleArrowRightIcon v-if="isSidebarCollapsed" aria-hidden="true" />
          <DoubleArrowLeftIcon v-else aria-hidden="true" />
        </button>
      </div>

      <nav class="nav" aria-label="Основная навигация">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          v-tooltip="isSidebarCollapsed ? t(`nav.${item.key}`) : undefined"
          :to="item.to"
          class="nav-item"
          active-class="nav-item--active"
          :aria-label="t(`nav.${item.key}`)"
        >
          <span class="nav-ico" aria-hidden="true">
            <component :is="item.icon" />
          </span>
          <span
            class="nav-label"
            :class="{ 'nav-label--collapsed': isSidebarCollapsed }"
            >{{ t(`nav.${item.key}`) }}</span
          >
        </NuxtLink>
      </nav>

      <section class="sidebar-card sidebar-card--progress">
        <p>{{ t('layout.weekProgress') }}</p>
        <div class="sidebar-metrics">
          <span>
            <strong>{{ completedSessions }}</strong>
            <small>{{ t('layout.progressCompletedShort') }}</small>
          </span>
          <span>
            <strong>{{ averageScore }}</strong>
            <small>{{ t('layout.progressAverageShort') }}</small>
          </span>
        </div>
      </section>

      <section class="sidebar-card sidebar-card--accent">
        <p>{{ t('layout.planTitle') }}</p>
        <span>{{ t('layout.planHint') }}</span>
        <NuxtLink to="/pricing" class="mini-cta">{{
          t('billing.upgrade')
        }}</NuxtLink>
      </section>
    </aside>

    <main class="workspace">
      <header class="topbar glass-frame glass-frame--soft">
        <div class="topbar-title">
          <span>{{ t('app.name') }}</span>
          <small>{{ t('app.tagline') }}</small>
        </div>

        <div class="toolbar">
          <button
            type="button"
            class="icon-button"
            :aria-label="t('layout.themeToggle')"
            @click="toggleTheme"
          >
            <SunIcon v-if="theme === 'dark'" aria-hidden="true" />
            <MoonIcon v-else aria-hidden="true" />
          </button>

          <NuxtLink
            to="/profile"
            class="profile-pill"
            :aria-label="t('nav.profile')"
          >
            <PersonIcon aria-hidden="true" />
          </NuxtLink>
        </div>
      </header>

      <section class="content-surface">
        <SlotOutlet />
      </section>
    </main>

    <nav
      class="bottom-nav glass-frame glass-frame--soft"
      aria-label="Мобильная навигация"
    >
      <NuxtLink
        v-for="item in nav.slice(0, 4)"
        :key="item.to"
        :to="item.to"
        class="bottom-item"
        active-class="bottom-item--active"
      >
        <component :is="item.icon" aria-hidden="true" />
        <small>{{ t(`nav.${item.key}`) }}</small>
      </NuxtLink>
      <NuxtLink
        to="/profile"
        class="bottom-item"
        active-class="bottom-item--active"
      >
        <GearIcon aria-hidden="true" />
        <small>{{ t('nav.profile') }}</small>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
  .layout-shell {
    position: relative;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    min-height: 100dvh;
    padding: 20px;
    gap: clamp(12px, 1.6vw, 16px);
    transition: grid-template-columns var(--motion-normal) var(--ease-out),
      gap var(--motion-normal) var(--ease-out);
  }

  .layout-shell--collapsed {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .sidebar {
    position: sticky;
    top: 20px;
    display: flex;
    flex-direction: column;
    height: calc(100dvh - 40px);
    padding: 16px;
    overflow: hidden;
    transition: padding var(--motion-normal) var(--ease-out);
  }

  .sidebar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 24px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: clamp(12px, 1.6vw, 16px);
    min-width: 0;
    color: var(--text-primary);
    text-decoration: none;
  }

  .brand-mark,
  .nav-ico,
  .icon-button {
    display: grid;
    place-items: center;
  }

  .brand-mark {
    width: 44px;
    height: 44px;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .brand-logo {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .brand-text {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0;
    transition: opacity var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
    white-space: nowrap;
  }

  .sidebar-toggle {
    display: grid;
    flex: 0 0 36px;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--glass-border);
    border-radius: 13px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .sidebar-toggle:hover {
    transform: translateY(-1px);
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .sidebar-toggle svg {
    width: 17px;
    height: 17px;
  }

  .nav {
    display: grid;
    gap: 6px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: clamp(12px, 1.6vw, 16px);
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    text-decoration: none;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
  }

  .nav-item:hover {
    transform: translateX(2px);
    border-color: var(--glass-border);
    background: var(--surface-soft);
    color: var(--text-primary);
  }

  .nav-item--active {
    border-color: var(--glass-border-strong);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent) 26%, transparent),
      var(--surface-soft)
    );
    color: var(--text-primary);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .nav-ico {
    width: 28px;
    height: 28px;
    border-radius: 10px;
    background: var(--surface-soft);
  }

  .nav-ico svg {
    width: 16px;
    height: 16px;
  }

  .nav-label {
    font-size: 14px;
    font-weight: 700;
    transition: opacity var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
    white-space: nowrap;
  }

  .sidebar-card {
    display: grid;
    gap: 7px;
    margin-top: auto;
    padding: 16px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .sidebar-card + .sidebar-card {
    margin-top: 12px;
  }

  .sidebar-card p,
  .sidebar-card span {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .sidebar-card strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 26px;
    line-height: 1;
  }

  .sidebar-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .sidebar-metrics span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .sidebar-metrics strong {
    overflow: hidden;
    font-size: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-metrics small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-card--accent {
    margin-top: 12px;
  }

  .layout-shell--collapsed .sidebar {
    align-items: center;
    padding: 14px 12px;
    border-width: 0;
    border-color: transparent;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-raised) 62%, transparent),
        color-mix(in srgb, var(--surface-soft) 82%, transparent)
      ),
      var(--surface);
    box-shadow: var(--shadow-soft);
  }

  .layout-shell--collapsed .sidebar.glass-frame::before {
    opacity: 0;
    animation: none;
  }

  .layout-shell--collapsed .sidebar-top {
    align-items: center;
    flex-direction: column;
    width: 100%;
    gap: 12px;
    margin-bottom: 22px;
  }

  .layout-shell--collapsed .brand {
    justify-content: center;
    gap: 0;
    width: 48px;
    height: 48px;
  }

  .layout-shell--collapsed .brand-mark {
    width: 44px;
    height: 44px;
  }

  .layout-shell--collapsed .sidebar-toggle {
    flex-basis: 40px;
    width: 40px;
    height: 40px;
    border-color: transparent;
    border-radius: 15px;
    background: var(--surface-soft);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .layout-shell--collapsed .brand-text,
  .layout-shell--collapsed .nav-label {
    display: none;
    width: 0;
    opacity: 0;
    overflow: hidden;
    transform: translateX(-6px);
  }

  .layout-shell--collapsed .nav {
    width: 100%;
    gap: 8px;
    justify-items: center;
  }

  .layout-shell--collapsed .nav-item {
    display: grid;
    place-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    min-height: 48px;
    gap: 0;
    padding: 0;
    border-radius: 16px;
    background: var(--surface-soft);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .layout-shell--collapsed .nav-item:hover {
    transform: translateY(-1px);
  }

  .layout-shell--collapsed .nav-ico {
    width: 20px;
    height: 20px;
    border-radius: 0;
    background: transparent;
  }

  .layout-shell--collapsed .nav-ico svg {
    width: 18px;
    height: 18px;
  }

  .layout-shell--collapsed .sidebar-card {
    display: none;
  }

  .mini-cta {
    display: inline-flex;
    justify-content: center;
    min-height: 38px;
    align-items: center;
    border-radius: 13px;
    background: var(--button-bg);
    color: var(--button-text);
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
  }

  .workspace {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: clamp(12px, 1.6vw, 16px);
    min-width: 0;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 72px;
    padding: 12px 14px 12px 20px;
  }

  .topbar-title {
    display: grid;
    gap: 3px;
  }

  .topbar-title span {
    color: var(--text-primary);
    font-weight: 800;
  }

  .topbar-title small {
    color: var(--text-muted);
    font-size: 12px;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .icon-button,
  .profile-pill {
    border: 1px solid var(--glass-border);
    background: var(--surface-soft);
    color: var(--text-secondary);
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .icon-button {
    width: 44px;
    height: 44px;
    border-radius: 16px;
    cursor: pointer;
  }

  .icon-button:hover,
  .profile-pill:hover {
    transform: translateY(-1px);
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .icon-button svg {
    width: 18px;
    height: 18px;
  }

  .profile-pill {
    display: grid;
    place-items: center;
    width: 44px;
    min-height: 44px;
    border-radius: 16px;
    text-decoration: none;
  }

  .profile-pill svg {
    width: 18px;
    height: 18px;
  }

  .content-surface {
    min-width: 0;
    /* width: min(1180px, 100%); */
    padding: 0 0 72px;
  }

  .bottom-nav {
    display: none;
  }

  @media (max-width: 1365px) {
    .layout-shell {
      grid-template-columns: 1fr;
      padding: 14px;
    }

    .sidebar {
      display: none;
    }

    .topbar {
      align-items: flex-start;
      flex-direction: column;
      gap: clamp(12px, 1.6vw, 16px);
    }

    .toolbar {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .content-surface {
      width: 100%;
      padding-bottom: 96px;
    }

    .bottom-nav {
      position: fixed;
      right: 14px;
      bottom: max(14px, env(safe-area-inset-bottom));
      left: 14px;
      z-index: 20;
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      padding: 8px;
    }

    .bottom-item {
      display: grid;
      place-items: center;
      gap: 3px;
      min-height: 52px;
      border-radius: 16px;
      color: var(--text-muted);
      text-decoration: none;
    }

    .bottom-item svg {
      width: 18px;
      height: 18px;
    }

    .bottom-item small {
      max-width: 100%;
      overflow: hidden;
      font-size: 9px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bottom-item--active {
      background: var(--surface-raised);
      color: var(--text-primary);
    }
  }

  @media (max-width: 640px) {
    .layout-shell {
      height: 100dvh;
      min-height: 100dvh;
      overflow: hidden;
      padding: 10px;
    }

    .workspace {
      height: calc(100dvh - 96px);
      overflow-y: auto;
      scrollbar-width: none;
    }

    .workspace::-webkit-scrollbar {
      display: none;
    }

    .content-surface {
      padding-bottom: 18px;
    }

    .topbar-title small,
    .profile-pill {
      display: none;
    }

    .topbar {
      flex-direction: row;
      align-items: center;
      gap: clamp(12px, 1.6vw, 16px);
      min-height: 72px;
    }

    .topbar-title {
      min-width: 0;
    }

    .toolbar {
      display: flex;
      justify-content: flex-end;
      width: auto;
      margin-left: auto;
      padding-bottom: 0;
      gap: 8px;
      overflow: visible;
    }

    .bottom-nav {
      right: 10px;
      left: 10px;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      padding: 6px;
    }

    .bottom-item {
      min-height: 48px;
      border-radius: 14px;
    }

    .bottom-item small {
      display: none;
    }
  }
</style>
