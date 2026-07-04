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

  it('splits dynamic multi-word terms without losing surrounding text', () => {
    expect(
      splitTextByInterviewTerms('Что такое область видимости в JavaScript?', [
        {
          phrase: 'область видимости',
          shortDefinition: 'Область видимости — часть кода, где доступно имя.',
        },
      ])
    ).toEqual([
      { kind: 'text', value: 'Что такое ' },
      {
        kind: 'term',
        value: 'область видимости',
        term: {
          phrase: 'область видимости',
          shortDefinition: 'Область видимости — часть кода, где доступно имя.',
        },
      },
      { kind: 'text', value: ' в JavaScript?' },
    ]);
  });

  it('prefers longer dynamic terms and avoids overlapping highlights', () => {
    expect(
      splitTextByInterviewTerms('CORS policy зависит от CORS.', [
        {
          phrase: 'CORS',
          shortDefinition: 'CORS — правила доступа между доменами.',
        },
        {
          phrase: 'CORS policy',
          shortDefinition: 'CORS policy — набор CORS-правил для ресурса.',
        },
      ])
    ).toEqual([
      {
        kind: 'term',
        value: 'CORS policy',
        term: {
          phrase: 'CORS policy',
          shortDefinition: 'CORS policy — набор CORS-правил для ресурса.',
        },
      },
      { kind: 'text', value: ' зависит от ' },
      {
        kind: 'term',
        value: 'CORS',
        term: {
          phrase: 'CORS',
          shortDefinition: 'CORS — правила доступа между доменами.',
        },
      },
      { kind: 'text', value: '.' },
    ]);
  });

  it('attaches leading punctuation to the previous displayed term', () => {
    const term = {
      phrase: 'рендеринга/состояния',
      shortDefinition: 'Связка рендеринга и состояния.',
    };

    expect(
      prepareInterviewTextDisplaySegments(
        splitTextByInterviewTerms('изменение рендеринга/состояния), затем', [
          term,
        ])
      )
    ).toEqual([
      { kind: 'text', value: 'изменение ' },
      {
        kind: 'term',
        value: 'рендеринга/состояния',
        term,
        attachedPunctuation: '),',
      },
      { kind: 'text', value: ' затем' },
    ]);
  });
});
