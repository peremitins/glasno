import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/layouts/default.vue', 'utf8');

describe('default layout sidebar', () => {
  it('shows compact progress metrics instead of a hard-coded weekly count', () => {
    expect(source).toContain('layout-dashboard-summary');
    expect(source).toContain('sidebar-metrics');
    expect(source).toContain('layout.progressCompletedShort');
    expect(source).toContain('layout.progressAverageShort');
    expect(source).not.toContain('<strong>7</strong>');
    expect(source).not.toContain('layout.weekProgressHint');
  });

  it('keeps pricing visible and uses an anonymous profile icon in the header', () => {
    expect(source).toContain("{ to: '/pricing', key: 'pricing'");
    expect(source).toContain('PersonIcon');
    expect(source).toContain('profile-pill');
    expect(source).not.toContain('Анна');
    expect(source).not.toContain('aria-hidden="true">A</span>');
  });

  it('uses a dedicated borderless rail treatment when collapsed', () => {
    expect(source).toContain('grid-template-columns: 72px minmax(0, 1fr)');
    expect(source).toContain(
      '.layout-shell--collapsed .sidebar.glass-frame::before'
    );
    expect(source).toContain('border-width: 0');
    expect(source).toContain('border-color: transparent');
    expect(source).toContain('width: 48px');
    expect(source).toContain('height: 48px');
  });
});

describe('default layout mobile scroll reset', () => {
  it('resets the .workspace scroll container after page navigation', () => {
    expect(source).toContain('ref="workspaceEl"');
    expect(source).toContain("hook('page:loading:end'");
    expect(source).toContain("behavior: 'instant'");
    expect(source).toContain('overflow-y: auto');
  });
});
