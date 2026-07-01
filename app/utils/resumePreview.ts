export type ResumePreviewBlock =
  | { id: string; type: 'heading' | 'paragraph'; text: string }
  | { id: string; type: 'list'; items: string[] };

export function buildResumePreviewBlocks(value: string): ResumePreviewBlock[] {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const lines = splitResumePreviewLines(normalized);
  const blocks: ResumePreviewBlock[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({
      id: `resume-list-${blocks.length}`,
      type: 'list',
      items: listItems,
    });
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = compactResumeLine(rawLine);
    const bullet = line.match(/^([•*-]|\d+[.)])\s+(.+)$/);

    if (bullet?.[2]) {
      listItems.push(bullet[2]);
      return;
    }

    flushList();
    blocks.push({
      id: `resume-line-${blocks.length}`,
      type: isResumeHeading(line) ? 'heading' : 'paragraph',
      text: line,
    });
  });

  flushList();
  return blocks;
}

function splitResumePreviewLines(value: string): string[] {
  const directLines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (directLines.length > 1) return directLines;

  return value
    .replace(/([.!?])\s+(?=[А-ЯA-Z0-9])/g, '$1\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function compactResumeLine(value: string): string {
  return value.replace(/[ \t]+/g, ' ').trim();
}

function isResumeHeading(value: string): boolean {
  const text = value.replace(/[:：]$/, '').trim();
  if (!text || text.length > 56) return false;

  return (
    /^(контакты|о себе|профиль|summary|опыт|experience|проекты|projects|достижения|achievements|навыки|skills|стек|stack|образование|education|языки|languages)$/i.test(
      text
    ) || /^[A-ZА-ЯЁ0-9\s/&+-]{3,}$/.test(text)
  );
}
