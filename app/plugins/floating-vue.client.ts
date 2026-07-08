import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';

export default defineNuxtPlugin((nuxtApp) => {
  const tooltipTheme = FloatingVue.options.themes.tooltip || {};

  FloatingVue.options.themes.tooltip = {
    ...tooltipTheme,
    preventOverflow: true,
    shift: true,
    shiftCrossAxis: true,
    overflowPadding: 12,
  };

  FloatingVue.options.themes['learning-term-tooltip'] = {
    $extend: 'tooltip',
    placement: 'top',
    triggers: ['hover', 'focus', 'touch'],
    preventOverflow: true,
    shift: true,
    shiftCrossAxis: true,
    overflowPadding: 12,
  };

  nuxtApp.vueApp.use(FloatingVue);
});
