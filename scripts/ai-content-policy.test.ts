import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_PATH = resolve(process.cwd());
const SCRIPTS_PATH = resolve(ROOT_PATH, 'scripts');
const PACKAGE_PATH = resolve(ROOT_PATH, 'package.json');

const FORBIDDEN_SCRIPT_PATTERNS = [
  {
    name: 'OpenAI SDK',
    pattern: /(?:from\s+|import\(|require\()\s*['"]openai['"]/u,
  },
  {
    name: 'Anthropic SDK',
    pattern:
      /(?:from\s+|import\(|require\()\s*['"]@anthropic-ai\/sdk['"]/u,
  },
  {
    name: 'ключ OpenAI',
    pattern: /\b(?:NUXT_)?OPENAI_API_KEY\b/u,
  },
  { name: 'ключ Anthropic', pattern: /\bANTHROPIC_API_KEY\b/u },
  { name: 'ключ Codex API', pattern: /\bCODEX_API_KEY\b/u },
  {
    name: 'секрет AI Relay',
    pattern: /\bAI_RELAY_[A-Z_]+\b/u,
  },
  {
    name: 'прямой адрес AI API',
    pattern: /api\.(?:openai|anthropic)\.com/u,
  },
  {
    name: 'встроенный Web Search через API',
    pattern: /\bweb_search(?:_preview)?\b/u,
  },
  {
    name: 'вызов генерации через SDK',
    pattern: /\b(?:responses|chat\.completions)\.create\b/u,
  },
  {
    name: 'путь AI API',
    pattern: /\/v1\/(?:responses|chat\/completions|messages)\b/u,
  },
] as const;

const FORBIDDEN_PACKAGE_COMMANDS = [
  'question-bank:generate-answers',
  'question-bank:review-critical',
  'question-bank:reclassify-seniority',
  'question-bank:deduplicate',
] as const;

async function listScriptSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listScriptSources(path);
      if (entry.name.endsWith('.test.ts')) return [];
      return [
        '.bash',
        '.cjs',
        '.cts',
        '.js',
        '.mjs',
        '.mts',
        '.sh',
        '.ts',
        '.tsx',
        '.zsh',
      ].includes(extname(entry.name))
        ? [path]
        : [];
    })
  );
  return nested.flat();
}

describe('политика служебной генерации контента', () => {
  it('не допускает AI API и ключи приложения в служебных скриптах', async () => {
    const violations: string[] = [];

    for (const path of await listScriptSources(SCRIPTS_PATH)) {
      const source = await readFile(path, 'utf8');
      for (const rule of FORBIDDEN_SCRIPT_PATTERNS) {
        if (rule.pattern.test(source)) {
          violations.push(`${relative(ROOT_PATH, path)}: ${rule.name}`);
        }
      }
    }

    expect(
      violations,
      'Служебный контент нужно создавать в подписочной сессии Codex или Claude Code, а не через ключи приложения.'
    ).toEqual([]);
  });

  it('не публикует API-команды генерации контента в package.json', async () => {
    const packageJson = JSON.parse(await readFile(PACKAGE_PATH, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};

    expect(
      FORBIDDEN_PACKAGE_COMMANDS.filter((command) => command in scripts)
    ).toEqual([]);
  });
});
