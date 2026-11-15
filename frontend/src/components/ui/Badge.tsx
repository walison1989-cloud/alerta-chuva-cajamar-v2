import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type BadgeTone = 'brand' | 'neutral' | 'attention' | 'alert' | 'safe'

const TONES: Record<BadgeTone, string> = {
  brand: 'border-brand-200 bg-brand-50 text-brand-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  attention: 'border-attention-200 bg-attention-50 text-attention-800',
  alert: 'border-alert-200 bg-alert-50 text-alert-800',
  safe: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

interface BadgeProps {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-semibold leading-none tracking-wide',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
