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

  it('uses a settings icon for the question preference trigger', () => {
    const component = read(
      'app/components/interview/QuestionPreferenceMenu.vue'
    );

    expect(component).toContain('GearIcon');
    expect(component).not.toContain('SewingPinIcon');
  });

  it('moves question settings into the unified question bank', () => {
    const page = read('app/pages/questions.vue');
    const layout = read('app/layouts/default.vue');

    expect(page).toContain('QuestionPreferenceMenu');
    expect(page).toContain('/api/question-preferences/bank');
    expect(layout).toContain("to: '/questions'");
    expect(layout).not.toContain("to: '/question-settings'");
  });
});
