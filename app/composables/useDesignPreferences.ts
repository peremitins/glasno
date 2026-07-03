import { onMounted, watch } from 'vue';

export type GlasnoTheme = 'dark' | 'light';
export type GlasnoFont = 'manrope' | 'space' | 'mono';

const THEME_KEY = 'glasno:theme';
const FONT_KEY = 'glasno:font';

const themeValues: GlasnoTheme[] = ['dark', 'light'];
const fontValues: GlasnoFont[] = ['mono', 'manrope', 'space'];

export function useDesignPreferences() {
  const theme = useState<GlasnoTheme>('glasno-theme', () => 'dark');
  const font = useState<GlasnoFont>('glasno-font', () => 'mono');

  const themeOptions: Array<{ value: GlasnoTheme; label: string }> = [
    { value: 'dark', label: 'Темная' },
    { value: 'light', label: 'Светлая' },
  ];

  const fontOptions: Array<{ value: GlasnoFont; label: string; title: string }> = [
    { value: 'mono', label: 'Mono', title: 'JetBrains Mono' },
    { value: 'manrope', label: 'Manrope', title: 'Современный UI' },
    { value: 'space', label: 'Grotesk', title: 'Акцентный гротеск' },
  ];

  function isTheme(value: string | null): value is GlasnoTheme {
    return value !== null && themeValues.includes(value as GlasnoTheme);
  }

  function isFont(value: string | null): value is GlasnoFont {
    return value !== null && fontValues.includes(value as GlasnoFont);
  }

  function applyPreferences() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = theme.value;
    root.dataset.font = font.value;
    root.style.colorScheme = theme.value;
  }

  function setTheme(nextTheme: GlasnoTheme) {
    theme.value = nextTheme;
  }

  function setFont(nextFont: GlasnoFont) {
    font.value = nextFont;
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  onMounted(() => {
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    const savedFont = window.localStorage.getItem(FONT_KEY);

    if (isTheme(savedTheme)) theme.value = savedTheme;
    if (isFont(savedFont)) font.value = savedFont;

    watch(
      [theme, font],
      () => {
        applyPreferences();
        window.localStorage.setItem(THEME_KEY, theme.value);
        window.localStorage.setItem(FONT_KEY, font.value);
      },
      { immediate: true }
    );
  });

  return {
    theme,
    font,
    themeOptions,
    fontOptions,
    setTheme,
    setFont,
    toggleTheme,
  };
}
