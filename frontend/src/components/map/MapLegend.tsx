import { Info, MapPin, Mountain, TriangleAlert } from 'lucide-react'
import { RAIN_LEVEL_META } from '@/lib/rain'
import {
  SUSCETIBILIDADE_FONTE,
  SUSCETIBILIDADE_META,
  SUSCETIBILIDADE_NOTA,
} from '@/lib/suscetibilidade'
import type { RainLevel } from '@/types/rain'
import type { SuscetibilidadeClasse } from '@/types/suscetibilidade'
import { cn } from '@/lib/cn'

const LEGEND_ITEMS: Array<{ level: RainLevel; color: string }> = [
  { level: 'sem-leitura', color: 'bg-slate-300' },
  { level: 'zero', color: 'bg-slate-500' },
  { level: 'leve', color: 'bg-sky-400' },
  { level: 'moderada', color: 'bg-amber-500' },
  { level: 'forte', color: 'bg-red-600' },
]

const SUSCETIBILIDADE_ORDER: SuscetibilidadeClasse[] = [
  'Alta',
  'Media',
  'Baixa',
  'Enxurrada',
]

interface MapLegendProps {
  className?: string
}

/**
 * Legenda do mapa. As faixas de chuva descrevem apenas o volume acumulado
 * informado pela fonte. A suscetibilidade é uma característica do terreno na
 * carta oficial; nenhuma das duas camadas classifica risco em tempo real.
 */
export function MapLegend({ className }: MapLegendProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wide text-slate-500">
          Chuva acumulada informada (24 h)
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {LEGEND_ITEMS.map((item) => {
            const meta = RAIN_LEVEL_META[item.level]
            return (
              <li
                key={item.level}
                className="flex items-start gap-2 rounded-lg bg-slate-50/80 px-2 py-1.5"
              >
                <span
                  className={cn(
                    'mt-0.5 h-3 w-3 shrink-0 rounded-full ring-2 ring-white',
                    item.color,
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-700">
                    {meta.label}
                  </span>
                  <span className="block text-xs leading-snug text-slate-500">
                    {meta.range}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="border-t border-slate-100 pt-2.5">
        <p className="flex items-center gap-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">
          <Mountain className="h-3 w-3" aria-hidden="true" />
          Suscetibilidade oficial (carta {SUSCETIBILIDADE_FONTE.label})
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SUSCETIBILIDADE_ORDER.map((classe) => {
            const meta = SUSCETIBILIDADE_META[classe]
            return (
              <li
                key={classe}
                className="flex items-start gap-2 rounded-lg bg-slate-50/80 px-2 py-1.5"
              >
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-sm ring-2 ring-white"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-700">
                    {meta.label}
                  </span>
                  <span className="block text-xs leading-snug text-slate-500">
                    {meta.description}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Fonte: SGB/CPRM e IPT · escala {SUSCETIBILIDADE_FONTE.escala} ·
          publicação {SUSCETIBILIDADE_FONTE.ano}. Polígonos sem simplificação.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span
            className="h-3 w-3 rounded-full border-2 border-white bg-brand-700 shadow"
            aria-hidden="true"
          />
          Estação pluviométrica
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3 text-brand-700" aria-hidden="true" />
          Imóvel do morador (privado)
        </span>
        <span className="inline-flex items-center gap-1">
          <TriangleAlert className="h-3 w-3 text-attention-700" aria-hidden="true" />
          Ocorrência verificada
        </span>
      </div>

      <p className="flex items-start gap-1.5 rounded-xl bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          As cores de chuva representam somente o acumulado de 24 h informado
          pela fonte. {SUSCETIBILIDADE_NOTA}
        </span>
      </p>
    </div>
  )
}
