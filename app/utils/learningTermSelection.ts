export const MAX_MANUAL_LEARNING_TERM_LENGTH = 120;

type EditableTargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  parentElement?: EditableTargetLike | null;
  getAttribute?: (name: string) => string | null;
};

type FloatingRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type FloatingSize = {
  width: number;
  height: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

export function normalizeManualLearningTermSelection(
  value: string
): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length > MAX_MANUAL_LEARNING_TERM_LENGTH) return null;
  return normalized;
}

export function isEditableLearningTermSelectionTarget(
  target: EventTarget | null
): boolean {
  let current = asEditableTargetLike(target);

  while (current) {
    const tagName = current.tagName?.toLowerCase();
    if (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      current.isContentEditable ||
      current.getAttribute?.('role') === 'textbox'
    ) {
      return true;
    }
    current = asEditableTargetLike(current.parentElement ?? null);
  }

  return false;
}

export function clampLearningTermFloatingPosition(params: {
  anchorRect: FloatingRect;
  floatingSize: FloatingSize;
  viewport: ViewportSize;
  offset?: number;
  margin?: number;
}) {
  const offset = params.offset ?? 8;
  const margin = params.margin ?? 8;
  const { anchorRect, floatingSize, viewport } = params;
  const maxLeft = Math.max(margin, viewport.width - floatingSize.width - margin);
  const centeredLeft =
    anchorRect.left + anchorRect.width / 2 - floatingSize.width / 2;
  const left = clamp(centeredLeft, margin, maxLeft);

  const topAbove = anchorRect.top - floatingSize.height - offset;
  const preferredTop =
    topAbove >= margin ? topAbove : anchorRect.bottom + offset;
  const maxTop = Math.max(margin, viewport.height - floatingSize.height - margin);
  const top = clamp(preferredTop, margin, maxTop);

  return {
    left: Math.round(left),
    top: Math.round(top),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function asEditableTargetLike(value: unknown): EditableTargetLike | null {
  if (!value || typeof value !== 'object') return null;
  return value as EditableTargetLike;
}
