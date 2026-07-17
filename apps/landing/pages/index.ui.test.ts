import { existsSync, readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../composables/useLandingContent';

const source = readFileSync('apps/landing/pages/index.vue', 'utf8');

describe('landing page structure', () => {
  it('removes the redundant trust section while retaining legal content elsewhere', () => {
    expect(source).not.toContain('<TrustSection');
    expect(
      existsSync('apps/landing/components/landing/TrustSection.vue')
    ).toBe(false);
    expect(useLandingContent()).not.toHaveProperty('trust');
  });
});

describe('landing og image', () => {
  // og:image, указывающий в никуда, — молчаливый баг: ссылка репостится без
  // превью, а в самом лендинге ничего не ломается. Ровно так на проде и жил
  // og-cover.png, которого никогда не существовало.
  const file = source.match(/\/(og-cover\.[a-z]+)`/)?.[1];
  const path = `apps/landing/public/${file}`;

  it('ссылается на файл, который действительно лежит в public', () => {
    expect(file, 'в og:image ожидается og-cover.*').toBeDefined();
    expect(existsSync(path), `${path} не найден`).toBe(true);
  });

  it('имеет канонический размер 1200×630', async () => {
    const { width, height } = await sharp(path).metadata();
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
  });

  it('весит меньше 300 КБ — иначе WhatsApp не покажет превью', () => {
    expect(statSync(path).size).toBeLessThan(300 * 1024);
  });

  it('объявляет MIME-тип, совпадающий с расширением файла', () => {
    const declared = source.match(
      /'og:image:type', content: '([^']+)'/
    )?.[1];
    const expected = file?.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    expect(declared).toBe(expected);
  });
});
