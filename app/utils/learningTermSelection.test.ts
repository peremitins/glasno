import { describe, expect, it } from 'vitest';
import {
  clampLearningTermFloatingPosition,
  isEditableLearningTermSelectionTarget,
  normalizeManualLearningTermSelection,
} from './learningTermSelection';

function fakeTarget(params: {
  tagName?: string;
  role?: string | null;
  contentEditable?: boolean;
  parentElement?: unknown;
}) {
  return {
    tagName: params.tagName,
    isContentEditable: params.contentEditable ?? false,
    parentElement: params.parentElement ?? null,
    getAttribute(name: string) {
      return name === 'role' ? params.role ?? null : null;
    },
  } as unknown as EventTarget;
}

describe('learning term manual selection helpers', () => {
  it('normalizes selected text without changing the selected term meaning', () => {
    expect(normalizeManualLearningTermSelection('  Web   Vitals\n')).toBe(
      'Web Vitals'
    );
    expect(normalizeManualLearningTermSelection('LCP/INP/TTFB')).toBe(
      'LCP/INP/TTFB'
    );
  });

  it('rejects empty or too long manual selections', () => {
    expect(normalizeManualLearningTermSelection('   ')).toBeNull();
    expect(normalizeManualLearningTermSelection('a'.repeat(121))).toBeNull();
  });

  it('detects editable targets where the browser selection UI must stay native', () => {
    const editableParent = fakeTarget({ contentEditable: true });

    expect(
      isEditableLearningTermSelectionTarget(fakeTarget({ tagName: 'input' }))
    ).toBe(true);
    expect(
      isEditableLearningTermSelectionTarget(fakeTarget({ tagName: 'textarea' }))
    ).toBe(true);
    expect(
      isEditableLearningTermSelectionTarget(fakeTarget({ role: 'textbox' }))
    ).toBe(true);
    expect(
      isEditableLearningTermSelectionTarget(
        fakeTarget({ tagName: 'span', parentElement: editableParent })
      )
    ).toBe(true);
    expect(
      isEditableLearningTermSelectionTarget(fakeTarget({ tagName: 'p' }))
    ).toBe(false);
  });

  it('keeps floating controls inside the viewport and flips below tight top edges', () => {
    expect(
      clampLearningTermFloatingPosition({
        anchorRect: {
          left: 10,
          top: 5,
          right: 60,
          bottom: 25,
          width: 50,
          height: 20,
        },
        floatingSize: { width: 140, height: 36 },
        viewport: { width: 200, height: 120 },
        offset: 8,
        margin: 8,
      })
    ).toEqual({ left: 8, top: 33 });
  });
});
