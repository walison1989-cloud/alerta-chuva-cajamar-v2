import {
  CloudRain,
  House,
  Layers,
  MapPin,
  Mountain,
  TriangleAlert,
  WavesHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

export type RainLayerKey =
  | 'stations'
  | 'rain'
  | 'occurrences'
  | 'suscetibilidade'

export type RainLayerVisibility = Record<RainLayerKey, boolean>

interface ActiveLayer {
  key: RainLayerKey
  label: string
  description: string
  icon: LucideIcon
  count: number | null
  disabledReason?: string
}

interface LayerControlsProps {
  layers: RainLayerVisibility
  counts: {
    stations: number
    withReading: number
    occurrences: number
    suscetibilidade: number
  }
  onToggle: (key: RainLayerKey) => void
  showPrivateAddress: boolean
}

/**
 * Controles das camadas realmente disponíveis. A suscetibilidade vem da carta
 * oficial do SGB/CPRM + IPT; cursos d'água seguem indisponíveis porque não há
 * base hidrográfica validada nesta entrega.
 */
export function LayerControls({
  layers,
  counts,
  onToggle,
  showPrivateAddress,
}: LayerControlsProps) {
  const activeLayers: ActiveLayer[] = [
    {
      key: 'stations',
      label: 'Estações pluviométricas',
      description: 'CEMADEN e catálogos complementares, com fonte identificada',
      icon: MapPin,
      count: counts.stations,
    },
    {
      key: 'rain',
      label: 'Chuva observada (24 h)',
      description: 'Cor do marcador conforme o acumulado informado',
      icon: CloudRain,
      count: counts.withReading,
      disabledReason:
        layers.stations === false
          ? 'Ative as estações para visualizar a chuva.'
          : undefined,
    },
    {
      key: 'occurrences',
      label: 'Ocorrências verificadas',
      description: 'Somente registros públicos aprovados pela moderação',
      icon: TriangleAlert,
      count: counts.occurrences,
    },
    {
      key: 'suscetibilidade',
      label: 'Suscetibilidade oficial',
      description:
        counts.suscetibilidade > 0
          ? 'Inundação e enxurrada — SGB/CPRM + IPT (2017)'
          : 'Aguardando importação da carta oficial',
      icon: Mountain,
      count: counts.suscetibilidade,
    },
  ]

  const unavailableLayers: Array<{
    label: string
    description: string
    icon: LucideIcon
  }> = [
    {
      label: 'Cursos d’água',
      description:
        'A camada depende de base hidrográfica oficial validada. Não exibida para não induzir a erro.',
      icon: WavesHorizontal,
    },
  ]

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-brand-700" aria-hidden="true" />
        <h2 className="text-sm font-bold tracking-tight text-slate-900">
          Camadas do mapa
        </h2>
      </header>

      <ul className="space-y-1.5">
        {activeLayers.map((layer) => {
          const enabled = layers[layer.key] && !layer.disabledReason
          const Icon = layer.icon
          return (
            <li key={layer.key}>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={Boolean(layer.disabledReason)}
                onClick={() => onToggle(layer.key)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition',
                  enabled
                    ? 'border-brand-200 bg-brand-50/70'
                    : 'border-slate-200 bg-white hover:border-brand-200',
                  layer.disabledReason && 'cursor-not-allowed opacity-60',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    enabled
                      ? 'bg-brand-700 text-white'
                      : 'bg-slate-100 text-slate-500',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800">
                    {layer.label}
                  </span>
                  <span className="block text-xs leading-snug text-slate-500">
                    {layer.disabledReason ?? layer.description}
                  </span>
                </span>
                {layer.count !== null ? (
                  <Badge tone={enabled ? 'brand' : 'neutral'}>{layer.count}</Badge>
                ) : null}
                <span
                  className={cn(
                    'relative h-4 w-7 shrink-0 rounded-full transition',
                    enabled ? 'bg-brand-700' : 'bg-slate-300',
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition',
                      enabled ? 'left-3.5' : 'left-0.5',
                    )}
                  />
                </span>
              </button>
            </li>
          )
        })}

        {showPrivateAddress ? (
          <li className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-2.5 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <House className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-emerald-900">
                Meu imóvel (privado)
              </span>
              <span className="block text-xs leading-snug text-emerald-800/80">
                Visível apenas para a conta autenticada
              </span>
            </span>
            <Badge tone="safe">Ativo</Badge>
          </li>
        ) : null}
      </ul>

      <div className="border-t border-slate-100 pt-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Camadas ainda indisponíveis
        </p>
        <ul className="mt-1.5 space-y-1.5">
          {unavailableLayers.map((layer) => {
            const Icon = layer.icon
            return (
              <li
                key={layer.label}
                className="flex items-start gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-2.5 py-2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-600">
                    {layer.label}
                  </span>
                  <span className="block text-xs leading-snug text-slate-500">
                    {layer.description}
                  </span>
                </span>
                <Badge tone="neutral">Indisponível</Badge>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
