import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CORPUS_PATH = resolve(
  process.cwd(),
  'data/question-bank/frontend-v1.jsonl'
);

interface Correction {
  answer: string;
  sources: Array<{
    sourceType: 'official_docs' | 'standard';
    name: string;
    url: string;
  }>;
  summary: string;
}

interface CorpusItem {
  id: string;
  answer: string;
  provenance: {
    answerSources: Correction['sources'];
    answerVerifiedAt: string | null;
    changesSummary: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const corrections = new Map<string, Correction>([
  [
    'frontend_angular_replacement_01_ivy_runtime_debug_api',
    {
      answer:
        'Глобальные Ivy debug-утилиты публикуются в `window.ng` только в режиме разработки и обычно удаляются из production-сборки. `ng.getComponent(element)` возвращает компонент на его host-элементе; `ng.getDirectives(node)` — директивы на узле без экземпляра компонента; `ng.getInjector(elementOrDirective)` — связанный `Injector`; `ng.getContext(node)` — контекст embedded view либо компонент, которому принадлежит элемент; `ng.getOwningComponent(node)` — компонент, чьё view содержит узел. Эти функции полезны для инспекции компонентов, провайдеров и шаблонного контекста в консоли, но на них нельзя опираться в прикладном коде или production-диагностике.',
      sources: [
        {
          sourceType: 'official_docs',
          name: 'Angular — getComponent',
          url: 'https://angular.dev/api/core/globals/getComponent',
        },
        {
          sourceType: 'official_docs',
          name: 'Angular — getDirectives',
          url: 'https://angular.dev/api/core/globals/getDirectives',
        },
        {
          sourceType: 'official_docs',
          name: 'Angular source — global debug utilities',
          url: 'https://github.com/angular/angular/blob/main/packages/core/src/render3/util/global_utils.ts',
        },
      ],
      summary:
        'Ручная правка: восстановлено ограничение dev-only для window.ng и уточнены возвращаемые значения debug-функций.',
    },
  ],
  [
    'frontend_react_replacement_01_strict_mode_double_mounts',
    {
      answer:
        'В development-режиме `StrictMode` повторно вызывает чистые части рендера и выполняет дополнительный цикл setup → cleanup → setup для эффектов, чтобы выявить нечистый рендер, отсутствующую очистку и проблемы повторного подключения. Это не происходит в production. Исправление — убрать побочные эффекты из рендера, сделать effect идемпотентным, всегда симметрично отписываться и очищать таймеры, а запросы отменять через `AbortController` или дедуплицировать на уровне слоя данных. Флаг в `useRef`, который просто блокирует второй setup, обычно маскирует ошибку и оставляет сломанный cleanup; он допустим только как часть корректной модели жизненного цикла, а не как обход StrictMode.',
      sources: [
        {
          sourceType: 'official_docs',
          name: 'React — StrictMode',
          url: 'https://react.dev/reference/react/StrictMode',
        },
        {
          sourceType: 'official_docs',
          name: 'React — Synchronizing with Effects',
          url: 'https://react.dev/learn/synchronizing-with-effects',
        },
        {
          sourceType: 'official_docs',
          name: 'React — useEffect troubleshooting',
          url: 'https://react.dev/reference/react/useEffect#my-effect-runs-twice-when-the-component-mounts',
        },
      ],
      summary:
        'Ручная правка: удалена рекомендация обходить StrictMode флагом useRef; акцент перенесён на симметричный cleanup и идемпотентность.',
    },
  ],
]);

async function main() {
  const source = await readFile(CORPUS_PATH, 'utf8');
  const items = source
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as CorpusItem);
  const correctedAt = new Date().toISOString();
  let applied = 0;
  const corrected = items.map((item) => {
    const correction = corrections.get(item.id);
    if (!correction) return item;
    applied += 1;
    return {
      ...item,
      answer: correction.answer,
      provenance: {
        ...item.provenance,
        answerSources: correction.sources,
        answerVerifiedAt: correctedAt,
        changesSummary: `${item.provenance.changesSummary} ${correction.summary}`,
      },
    };
  });

  if (applied !== corrections.size) {
    throw new Error(
      `Ожидалось ${corrections.size} правки, применено ${applied}`
    );
  }
  await writeFile(
    CORPUS_PATH,
    `${corrected.map((item) => JSON.stringify(item)).join('\n')}\n`,
    'utf8'
  );
  console.log(`Применено ручных технических правок: ${applied}`);
}

main().catch((error) => {
  console.error('Не удалось применить ручные правки:', error);
  process.exitCode = 1;
});
