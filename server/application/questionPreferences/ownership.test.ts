import { describe, expect, it } from 'vitest';
import { planAnonymousPreferenceMigration } from './ownership';

describe('anonymous question preference migration', () => {
  it('attaches new concepts and merges duplicate concepts by latest update', () => {
    const plan = planAnonymousPreferenceMigration(
      [
        {
          id: 'anon_new',
          roleKey: 'it-frontend',
          level: 'middle',
          conceptKey: 'dom',
          updatedAt: new Date('2026-07-12T10:00:00.000Z'),
        },
        {
          id: 'anon_duplicate',
          roleKey: 'it-frontend',
          level: 'middle',
          conceptKey: 'css',
          updatedAt: new Date('2026-07-12T12:00:00.000Z'),
        },
      ],
      [
        {
          id: 'user_duplicate',
          roleKey: 'it-frontend',
          level: 'middle',
          conceptKey: 'css',
          updatedAt: new Date('2026-07-11T12:00:00.000Z'),
        },
      ]
    );

    expect(plan).toEqual({
      attachIds: ['anon_new'],
      replace: [
        { sourceId: 'anon_duplicate', targetId: 'user_duplicate' },
      ],
      deleteIds: [],
    });
  });
});
