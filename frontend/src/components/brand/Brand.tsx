import { useId } from 'react'
import { cn } from '@/lib/cn'

interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className }: BrandMarkProps) {
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Símbolo do Alerta de Chuva Cajamar"
      className={cn('h-10 w-10', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="4" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f7fd1" />
          <stop offset="1" stopColor="#083d7a" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gradientId})`} />
      <path
        d="M24 7.5 37 12.3v8.6c0 8.4-5.3 14.8-13 18.1-7.7-3.3-13-9.7-13-18.1v-8.6L24 7.5Z"
        fill="#ffffff"
        fillOpacity="0.12"
        stroke="#ffffff"
        strokeOpacity="0.38"
        strokeWidth="1.2"
      />
      <path
        d="M16.5 28.5h14.2a5.7 5.7 0 0 0 .4-11.4 8.3 8.3 0 0 0-15.8-1.2 6.4 6.4 0 0 0 1.2 12.6Z"
        fill="#ffffff"
      />
      <path
        d="m18.5 32.2-1.6 3.1M24 32.2l-1.6 3.1M29.5 32.2l-1.6 3.1"
        stroke="#7dd3fc"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface BrandLockupProps {
  className?: string
  compact?: boolean
}

export function BrandLockup({ className, compact = false }: BrandLockupProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BrandMark className={compact ? 'h-9 w-9' : 'h-11 w-11'} />
      <div className="min-w-0">
        <p
          className={cn(
            'truncate font-bold tracking-tight text-brand-950',
            compact ? 'text-sm' : 'text-[15px]',
          )}
        >
          Alerta de Chuva
        </p>
        <p className="truncate text-xs font-medium text-slate-500">
          Cajamar · São Paulo
        </p>
      </div>
    </div>
  )
}
