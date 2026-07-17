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

describe('landing head order', () => {
  // Превью-бот Telegram читает только начало документа. Nuxt инлайнит ~30 КБ
  // стилей, и без явного приоритета og-теги уезжают за 33-й килобайт — бот их
  // не видит, и ссылка репостится без карточки. Поломка беззвучная: сайт
  // работает, тесты зелёные, а превью просто нет.
  it('поднимает SEO-теги выше инлайн-стилей отрицательным tagPriority', () => {
    expect(source).toMatch(/tagPriority:\s*-\d+/);
  });

  const build = 'apps/landing/.output/public/index.html';

  it.skipIf(!existsSync(build))(
    'в собранном HTML og:image попадает в первые 8 КБ, а charset остаётся в первых 1024',
    () => {
      const html = readFileSync(build, 'utf8');

      const og = html.indexOf('og:image');
      expect(og, 'og:image не найден в сборке').toBeGreaterThan(-1);
      expect(og, 'og:image за пределами того, что читает Telegram').toBeLessThan(
        8192
      );

      // Обратная сторона: слишком агрессивный приоритет выбивает <meta charset>
      // за 1024 байта, после которых браузер не обязан его искать.
      const charset = html.indexOf('charset');
      expect(charset, 'charset не найден').toBeGreaterThan(-1);
      expect(charset, 'charset вытеснен за 1024 байта').toBeLessThan(1024);
    }
  );
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

  it('объявляет фактический размер изображения', async () => {
    const { width, height } = await sharp(path).metadata();
    const declaredWidth = Number(
      source.match(/'og:image:width', content: '(\d+)'/)?.[1]
    );
    const declaredHeight = Number(
      source.match(/'og:image:height', content: '(\d+)'/)?.[1]
    );

    expect({ width, height }).toEqual({
      width: declaredWidth,
      height: declaredHeight,
    });
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
