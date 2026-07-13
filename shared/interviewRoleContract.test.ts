import { describe, expect, it } from 'vitest';
import {
  AI_CANDIDATE_ROLE_CONTRACT,
  AI_INTERVIEWER_ROLE_CONTRACT,
} from './interviewRoleContract';

describe('live interview role contracts', () => {
  it('keeps the AI interviewer in assessment mode even after explicit requests', () => {
    expect(AI_INTERVIEWER_ROLE_CONTRACT).toContain(
      'не давай рекомендации, правильный ответ, пример решения'
    );
    expect(AI_INTERVIEWER_ROLE_CONTRACT).toContain('«Давай»');
    expect(AI_INTERVIEWER_ROLE_CONTRACT).toContain(
      '«На чём мы остановились?»'
    );
    expect(AI_INTERVIEWER_ROLE_CONTRACT).not.toContain(
      'твоя единственная роль — кандидат'
    );
  });

  it('keeps the AI candidate from conducting the interview', () => {
    expect(AI_CANDIDATE_ROLE_CONTRACT).toContain(
      'твоя единственная роль — кандидат'
    );
    expect(AI_CANDIDATE_ROLE_CONTRACT).toContain(
      'Никогда не отвечай как интервьюер'
    );
    expect(AI_CANDIDATE_ROLE_CONTRACT).not.toContain(
      'не давай рекомендации, правильный ответ'
    );
  });
});
