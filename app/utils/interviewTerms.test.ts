import { describe, expect, it } from 'vitest';
import {
  prepareInterviewTextDisplaySegments,
  splitTextByInterviewTerms,
} from './interviewTerms';

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

  it('attaches leading punctuation to the previous displayed term', () => {
    expect(
      prepareInterviewTextDisplaySegments(
        splitTextByInterviewTerms('Отвечайте по STAR), затем')
      )
    ).toEqual([
      { kind: 'text', value: 'Отвечайте по ' },
      {
        kind: 'term',
        value: 'STAR',
        term: 'star',
        attachedPunctuation: '),',
      },
      { kind: 'text', value: ' затем' },
    ]);
  });
});
