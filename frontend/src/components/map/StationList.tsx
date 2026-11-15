import { CloudRain, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  classifyRain,
  formatDistanceKm,
  formatRainValue,
  getRainReadingStatus,
} from '@/lib/rain'
import { formatDateTimeShort } from '@/lib/format'
import type { RainStation } from '@/types/rain'
import { cn } from '@/lib/cn'

const LEVEL_DOT: Record<string, string> = {
  'sem-leitura': 'bg-slate-300',
  zero: 'bg-slate-500',
  leve: 'bg-sky-400',
  moderada: 'bg-amber-500',
  forte: 'bg-red-600',
}

interface StationListProps {
  stations: RainStation[]
  selectedKey: string | null
  onSelect: (key: string) => void
  isLoading: boolean
  emptyMessage?: string
  emptyDescription?: string
  showDistance: boolean
}

export function StationList({
  stations,
  selectedKey,
  onSelect,
  isLoading,
  showDistance,
  emptyMessage,
  emptyDescription,
}: StationListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Carregando estações">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (stations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
        <CloudRain
          className="mx-auto h-6 w-6 text-slate-500"
          aria-hidden="true"
        />
        <p className="mt-2 text-xs font-semibold text-slate-700">
          {emptyMessage ?? 'Nenhuma estação disponível'}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          {emptyDescription ?? 'A camada pública não retornou estações. Isso não significa ausência de chuva. Confira o status da coleta e a fonte oficial.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="max-h-[460px] space-y-1.5 overflow-y-auto pr-0.5">
      {stations.map((station) => {
        const reading = getRainReadingStatus(station)
        const level = classifyRain(station.accumulatedMm)
        const selected = selectedKey === station.key

        return (
          <li key={station.key}>
            <button
              type="button"
              onClick={() => onSelect(station.key)}
              aria-pressed={selected}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition',
                selected
                  ? 'border-brand-300 bg-brand-50/80 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50/40',
              )}
            >
              <span
                className={cn(
                  'mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-white',
                  LEVEL_DOT[level],
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-slate-900">
                    {station.name}
                  </span>
                  {reading.state !== 'ok' ? (
                    <Badge
                      tone={reading.state === 'missing' ? 'neutral' : 'attention'}
                    >
                      {reading.state === 'missing' ? 'Sem leitura' : 'Desatualizada'}
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {station.source} · {station.code}
                  {station.municipality ? ` · ${station.municipality}` : ''}
                  {station.state ? `/${station.state}` : ''}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {formatRainValue(station)}
                  </span>
                  <span>
                    {station.catalogueOnly ? 'Somente catálogo · sem medição' : station.lastReadingAt
                      ? `Leitura ${formatDateTimeShort(station.lastReadingAt)}`
                      : 'Horário indisponível'}
                  </span>
                  {showDistance && station.distanceKm !== null ? (
                    <span className="inline-flex items-center gap-0.5 text-brand-700">
                      <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
                      {formatDistanceKm(station.distanceKm)}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
