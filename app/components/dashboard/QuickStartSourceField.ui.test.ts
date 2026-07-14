import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'app/components/dashboard/QuickStartSourceField.vue',
  'utf8'
);
const sharedStyles = readFileSync('app/assets/css/main.css', 'utf8');

describe('QuickStartSourceField', () => {
  it('глобально оформляет телепортированное меню роли уже при первом открытии', () => {
    const globalStyle = source.slice(source.lastIndexOf('<style>'));

    expect(globalStyle).toContain('Teleport');
    expect(globalStyle).toContain('.role-menu');
    expect(globalStyle).toContain('max-height: min(');
    expect(globalStyle).toContain('overflow-y: auto !important');
    expect(globalStyle).toContain('::-webkit-scrollbar');
  });

  it('использует непрозрачную общую поверхность для меню роли', () => {
    const roleMenuStyle = sharedStyles.slice(
      sharedStyles.indexOf('.role-menu {'),
      sharedStyles.indexOf('.role-menu-viewport {')
    );

    expect(roleMenuStyle).toContain('background: var(--surface-solid) !important');
    expect(roleMenuStyle).toContain('border: 1px solid var(--glass-border-strong) !important');
  });
});
