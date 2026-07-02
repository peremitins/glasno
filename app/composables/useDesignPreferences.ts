import { onMounted, watch } from 'vue';

export type JobaiTheme = 'dark' | 'light';
export type JobaiFont = 'manrope' | 'space' | 'mono';

const THEME_KEY = 'jobai:theme';
const FONT_KEY = 'jobai:font';

const themeValues: JobaiTheme[] = ['dark', 'light'];
const fontValues: JobaiFont[] = ['mono', 'manrope', 'space'];

export function useDesignPreferences() {
  const theme = useState<JobaiTheme>('jobai-theme', () => 'dark');
  const font = useState<JobaiFont>('jobai-font', () => 'mono');

  const themeOptions: Array<{ value: JobaiTheme; label: string }> = [
    { value: 'dark', label: 'Темная' },
    { value: 'light', label: 'Светлая' },
  ];

  const fontOptions: Array<{ value: JobaiFont; label: string; title: string }> = [
    { value: 'mono', label: 'Mono', title: 'JetBrains Mono' },
    { value: 'manrope', label: 'Manrope', title: 'Современный UI' },
    { value: 'space', label: 'Grotesk', title: 'Акцентный гротеск' },
  ];

  function isTheme(value: string | null): value is JobaiTheme {
    return value !== null && themeValues.includes(value as JobaiTheme);
  }

  function isFont(value: string | null): value is JobaiFont {
    return value !== null && fontValues.includes(value as JobaiFont);
  }

  function applyPreferences() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = theme.value;
    root.dataset.font = font.value;
    root.style.colorScheme = theme.value;
  }

  function setTheme(nextTheme: JobaiTheme) {
    theme.value = nextTheme;
  }

  function setFont(nextFont: JobaiFont) {
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
