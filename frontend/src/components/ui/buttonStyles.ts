import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'attention'
export type ButtonSize = 'sm' | 'md'

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-alert-600 text-white hover:bg-alert-700 active:bg-alert-800',
  attention:
    'bg-attention-500 text-attention-950 hover:bg-attention-600 hover:text-white',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'px-4 text-sm',
}

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className)
}
