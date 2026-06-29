import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Button } from './Button.vue';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-[var(--radius-control)] text-sm font-semibold',
    'transition-[transform,box-shadow,background,border-color,color] duration-300',
    'ease-[var(--ease-out)] focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-0',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:translate-y-px active:scale-[0.99]',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-[var(--button-bg)] text-[var(--button-text)] shadow-[var(--button-shadow)] hover:bg-[var(--button-bg-hover)]',
        secondary:
          'border border-[var(--glass-border)] bg-[var(--surface-soft)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
        outline:
          'border border-[var(--glass-border-strong)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-soft)]',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-13 px-7 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
