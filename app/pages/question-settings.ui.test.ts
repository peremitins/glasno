import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('question preference UI', () => {
  it('renders exactly the three approved actions in the interview dropdown', () => {
    const component = read(
      'app/components/interview/QuestionPreferenceMenu.vue'
    );
    const session = read('app/pages/interview/[id].vue');

    expect(component).toContain("value: 'repeat'");
    expect(component).toContain("value: 'mastered'");
    expect(component).toContain("value: 'hidden'");
    expect(component).not.toContain("value: 'default'");
    expect(component).not.toContain('Обычный режим');
    expect(session).toContain('<QuestionPreferenceDropdown');
  });

  it('provides a separate settings page with filters and deletion', () => {
    const page = read('app/pages/question-settings.vue');
    const layout = read('app/layouts/default.vue');

    expect(page).toContain("'repeat'");
    expect(page).toContain("'mastered'");
    expect(page).toContain("'hidden'");
    expect(page).toContain('/api/question-preferences');
    expect(page).toContain("method: 'DELETE'");
    expect(layout).toContain("to: '/question-settings'");
  });
});
