<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const nav = [
  { to: '/', key: 'dashboard', icon: '◧' },
  { to: '/interview/new', key: 'newInterview', icon: '＋' },
  { to: '/history', key: 'history', icon: '◷' },
  { to: '/questions', key: 'questionBank', icon: '▤' },
  { to: '/pricing', key: 'pricing', icon: '★' },
  { to: '/profile', key: 'profile', icon: '◐' },
];
</script>

<template>
  <div class="layout">
    <!-- Боковое меню (десктоп) -->
    <aside class="sidebar">
      <div class="brand">{{ t('app.name') }}</div>
      <nav class="nav">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="nav-item--active"
        >
          <span class="nav-ico" aria-hidden="true">{{ item.icon }}</span>
          <span class="nav-label">{{ t(`nav.${item.key}`) }}</span>
        </NuxtLink>
      </nav>
    </aside>

    <!-- Контент -->
    <main class="content">
      <slot />
    </main>

    <!-- Нижнее меню (мобильный) -->
    <nav class="bottom-nav">
      <NuxtLink
        v-for="item in nav.slice(0, 5)"
        :key="item.to"
        :to="item.to"
        class="bottom-item"
        active-class="bottom-item--active"
      >
        <span aria-hidden="true">{{ item.icon }}</span>
        <small>{{ t(`nav.${item.key}`) }}</small>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px 1fr;
}
.sidebar {
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 20px 14px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  font-weight: 700;
  font-size: 20px;
  padding: 6px 10px 18px;
  color: var(--color-accent);
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--color-text);
  text-decoration: none;
  font-size: 15px;
}
.nav-item:hover {
  background: var(--color-bg);
}
.nav-item--active {
  background: color-mix(in srgb, var(--color-accent) 12%, white);
  color: var(--color-accent);
  font-weight: 600;
}
.nav-ico {
  width: 20px;
  text-align: center;
}
.content {
  padding: 28px clamp(16px, 4vw, 40px);
  max-width: 1100px;
  width: 100%;
}
.bottom-nav {
  display: none;
}

@media (max-width: 768px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    display: none;
  }
  .content {
    padding: 16px 16px 88px;
  }
  .bottom-nav {
    display: flex;
    justify-content: space-around;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    padding: 8px 4px env(safe-area-inset-bottom);
  }
  .bottom-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-decoration: none;
    color: var(--color-muted);
    font-size: 18px;
    padding: 4px 8px;
  }
  .bottom-item small {
    font-size: 10px;
  }
  .bottom-item--active {
    color: var(--color-accent);
  }
}
</style>
