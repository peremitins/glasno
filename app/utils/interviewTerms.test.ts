import { describe, expect, it } from 'vitest';
import { splitTextByInterviewTerms } from './interviewTerms';

describe('interview term highlighter', () => {
  it('splits STAR into a tooltip-ready term segment', () => {
    expect(splitTextByInterviewTerms('Отвечайте по STAR: ситуация.')).toEqual([
      { kind: 'text', value: 'Отвечайте по ' },
      { kind: 'term', value: 'STAR', term: 'star' },
      { kind: 'text', value: ': ситуация.' },
    ]);
  });

  it('keeps text without known terms as one segment', () => {
    expect(splitTextByInterviewTerms('Краткость и ясность')).toEqual([
      { kind: 'text', value: 'Краткость и ясность' },
    ]);
  });
});
