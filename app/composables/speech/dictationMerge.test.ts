import { describe, expect, it } from 'vitest';
import { appendFinalDictationTranscript } from './dictationMerge';

describe('appendFinalDictationTranscript', () => {
  it('appends only new delta when mobile Web Speech returns cumulative transcript', () => {
    const first = appendFinalDictationTranscript({
      currentText: '',
      sessionTranscript: '',
      finalTranscript: 'Я внедрил CRM',
    });

    const second = appendFinalDictationTranscript({
      currentText: first.text,
      sessionTranscript: first.sessionTranscript,
      finalTranscript: 'Я внедрил CRM и сократил обработку заявок',
    });

    expect(second.text).toBe(
      'Я внедрил CRM и сократил обработку заявок'
    );
    expect(second.sessionTranscript).toBe(
      'Я внедрил CRM и сократил обработку заявок'
    );
  });

  it('does not duplicate repeated final transcript', () => {
    const result = appendFinalDictationTranscript({
      currentText: 'Я внедрил CRM',
      sessionTranscript: 'Я внедрил CRM',
      finalTranscript: 'Я внедрил CRM',
    });

    expect(result.text).toBe('Я внедрил CRM');
    expect(result.sessionTranscript).toBe('Я внедрил CRM');
  });

  it('appends independent final chunks with a readable separator', () => {
    const result = appendFinalDictationTranscript({
      currentText: 'Сначала я собрал требования.',
      sessionTranscript: 'Сначала я собрал требования.',
      finalTranscript: 'Потом согласовал SLA',
    });

    expect(result.text).toBe(
      'Сначала я собрал требования. Потом согласовал SLA'
    );
    expect(result.sessionTranscript).toBe(
      'Сначала я собрал требования. Потом согласовал SLA'
    );
  });
});
