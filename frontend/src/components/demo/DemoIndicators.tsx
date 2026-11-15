import {
  Activity,
  CloudRain,
  Droplets,
  Gauge,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import {
  overallDemoLabel,
  type DemoIndicator,
  type DemoLevel,
} from '@/lib/demo'
import { cn } from '@/lib/cn'

const ICONS: Record<DemoIndicator['key'], LucideIcon> = {
  intensidade: CloudRain,
  acumulado: Droplets,
  probabilidade: Gauge,
  vento: Wind,
}

const LEVEL_BADGE: Record<DemoLevel, string> = {
  none: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  low: 'border-brand-200 bg-brand-50 text-brand-800',
  moderate: 'border-attention-200 bg-attention-50 text-attention-800',
  high: 'border-alert-200 bg-alert-50 text-alert-800',
  critical: 'border-alert-300 bg-alert-100 text-alert-900',
}

const LEVEL_BAR: Record<DemoLevel, string> = {
  none: 'bg-emerald-400',
  low: 'bg-brand-400',
  moderate: 'bg-attention-500',
  high: 'bg-alert-500',
  critical: 'bg-alert-700',
}

const OVERALL_CARD: Record<DemoLevel, string> = {
  none: 'border-emerald-200 bg-emerald-50',
  low: 'border-brand-200 bg-brand-50',
  moderate: 'border-attention-200 bg-attention-50',
  high: 'border-alert-200 bg-alert-50',
  critical: 'border-alert-300 bg-alert-100',
}

interface DemoIndicatorsProps {
  indicators: DemoIndicator[]
  overallLevel: DemoLevel
}

export function DemoIndicators({
  indicators,
  overallLevel,
}: DemoIndicatorsProps) {
  return (
    <Card
      className="border-attention-200 p-5 sm:p-6"
      aria-labelledby="indicadores-demo"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-attention-100 p-2.5 text-attention-700">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="indicadores-demo"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Indicadores simulados
              </h2>
              <Badge tone="attention">DEMONSTRAÇÃO</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Reação visual às condições escolhidas no simulador
            </p>
          </div>
        </div>
      </header>

      <div
        className={cn(
          'mt-4 rounded-2xl border p-4',
          OVERALL_CARD[overallLevel],
        )}
        aria-live="polite"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Classificação geral do cenário
        </p>
        <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">
          {overallDemoLabel(overallLevel)}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          Simulação local para teste visual. Isto não é um alerta, não aciona
          a Defesa Civil e não gera notificação.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {indicators.map((indicator) => {
          const Icon = ICONS[indicator.key]
          return (
            <div
              key={indicator.key}
              className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500">
                  <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  {indicator.label}
                </div>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-bold',
                    LEVEL_BADGE[indicator.level],
                  )}
                >
                  {indicator.levelLabel}
                </span>
              </div>

              <p className="mt-1.5 text-lg font-bold tracking-tight text-slate-900">
                {indicator.valueLabel}
              </p>

              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label={`${indicator.label} no cenário simulado`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={indicator.progressPct}
              >
                <div
                  className={cn('h-full rounded-full', LEVEL_BAR[indicator.level])}
                  style={{ width: `${indicator.progressPct}%` }}
                />
              </div>

              <p className="mt-1.5 text-xs leading-snug text-slate-500">
                {indicator.hint}
              </p>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Faixas ilustrativas, definidas apenas para esta demonstração. Não são
        critérios oficiais de risco, de alagamento ou de emissão de alerta.
      </p>
    </Card>
  )
}
