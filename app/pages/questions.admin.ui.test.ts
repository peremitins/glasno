import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('question bank UI', () => {
  it('limits the question bank to administrators', () => {
    const page = read('app/pages/questions.vue');
    const layout = read('app/layouts/default.vue');
    const catalogApi = read('server/api/question-bank/catalog.get.ts');
    const listApi = read('server/api/question-bank/index.get.ts');
    const itemApi = read('server/api/question-bank/[slug].get.ts');

    expect(existsSync('app/pages/question-settings.vue')).toBe(false);
    expect(page).toContain("middleware: 'admin'");
    expect(page).not.toContain("redirect: '/'");
    expect(layout).toContain("to: '/questions'");
    expect(layout).toContain("const isAdmin = computed(() => auth.user?.role === 'admin')");
    expect(layout).toContain('const nav = computed(() =>');
    expect(layout).toContain("item.key !== 'questionBank' || isAdmin.value");
    expect(catalogApi).toContain("requireRole(session?.role, 'admin')");
    expect(listApi).toContain("requireRole(event.context.session?.role, 'admin')");
    expect(itemApi).toContain("requireRole(event.context.session?.role, 'admin')");
    expect(layout).not.toContain("to: '/question-settings'");
  });

  it('keeps only learner-relevant filters in the interface', () => {
    const page = read('app/pages/questions.vue');

    for (const filter of [
      'search',
      'role',
      'framework',
      'topic',
      'interviewType',
      'seniority',
      'difficulty',
      'preferenceStatus',
    ]) {
      expect(page).toContain(filter);
    }
    for (const hiddenFilter of [
      'answerState',
      'technicalReview',
      'editorialReview',
      "updateFilter('status'",
    ]) {
      expect(page).not.toContain(hiddenFilter);
    }
    expect(page).toContain('/api/question-bank/catalog');
    expect(page).toContain(':aria-expanded="isExpanded(item.id)"');
    expect(page).toContain('item.provenance?.answerSources');
    expect(page).toContain('Ответ пока не добавлен');
    expect(page).toContain('GlassSkeletonStack');
  });

  it('uses framed sections and the project select component', () => {
    const page = read('app/pages/questions.vue');
    const selectContent = read('app/components/ui/shadcn/SelectContent.vue');

    expect(page).not.toContain('Редакторский контур');
    expect(page).not.toMatch(/<select\b/);
    expect(page).toContain("from '@/app/components/ui/shadcn'");
    expect(page).toContain('summary-strip glass-frame glass-frame--soft');
    expect(page).toContain('results-toolbar glass-frame glass-frame--soft');
    expect(selectContent).toContain('bg-[var(--surface-solid)]');
    expect(selectContent).not.toContain('bg-[var(--surface-raised)]');
  });

  it('shows provenance and answer sources only to admins', () => {
    const page = read('app/pages/questions.vue');

    expect(page).toContain("import { useAuthStore } from '@/app/stores/auth'");
    expect(page).toContain('const auth = useAuthStore()');
    expect(page).toContain("const isAdmin = computed(() => auth.user?.role === 'admin')");
    expect(page).toContain('<template v-if="isAdmin">');
  });

  it('lets the user manage the question state directly in every row', () => {
    const page = read('app/pages/questions.vue');

    expect(page).toContain('QuestionPreferenceMenu');
    expect(page).toContain('item.preference?.status');
    expect(page).toContain('/api/question-preferences/bank');
    expect(page).toContain('preference-indicator');
  });

  it('keeps the chevron after the question mode controls and hides review labels', () => {
    const page = read('app/pages/questions.vue');

    expect(page.indexOf('class="question-chevron"')).toBeGreaterThan(
      page.indexOf('class="question-preference-cell"')
    );
    expect(page).not.toContain('class="review-stack"');
  });
});
