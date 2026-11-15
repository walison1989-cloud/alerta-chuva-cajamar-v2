import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Info,
  LocateFixed,
  MapPin,
  Radio,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { formatDateTimeShort } from '@/lib/format'
import {
  formatDistanceKm,
  formatRainValue,
  getRainReadingStatus,
  sortStations,
} from '@/lib/rain'
import type { RainReadingState, RainStation } from '@/types/rain'

const READING_STATE_META: Record<
  RainReadingState,
  { label: string; tone: 'safe' | 'attention' | 'neutral' }
> = {
  ok: { label: 'Leitura disponível', tone: 'safe' },
  stale: { label: 'Desatualizada', tone: 'attention' },
  missing: { label: 'Sem leitura', tone: 'neutral' },
}

interface NearbyStationsCardProps {
  stations: RainStation[]
  isLoading?: boolean
  error?: string | null
  isAuthenticated: boolean
  hasAddress: boolean
  /** Quando presente, cada item vira um botão que seleciona a estação no mapa. */
  onSelect?: (key: string) => void
  /** Quantidade exibida antes de expandir. Padrão: as cinco mais próximas. */
  initialVisible?: number
  title?: string
  className?: string
}

/**
 * Lista as estações mais próximas do imóvel, calculadas no PostGIS a partir do
 * endereço da conta autenticada. O componente não recebe nem exibe coordenadas
 * residenciais; a distância chega pronta da RPC.
 *
 * Proximidade geográfica não é representatividade hidrológica: uma estação
 * próxima pode não representar o escoamento ou o risco do imóvel.
 */
export function NearbyStationsCard({
  stations,
  isLoading = false,
  error = null,
  isAuthenticated,
  hasAddress,
  onSelect,
  initialVisible = 5,
  title = 'Estações próximas do imóvel',
  className,
}: NearbyStationsCardProps) {
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(() => sortStations(stations), [stations])
  const visible = expanded ? sorted : sorted.slice(0, initialVisible)
  const canExpand = sorted.length > initialVisible

  return (
    <Card className={cn('p-4', className)} aria-labelledby="estacoes-proximas">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <h2
              id="estacoes-proximas"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Distância geodésica calculada no PostGIS a partir do imóvel.
            </p>
          </div>
        </div>
        <Badge tone="brand">PostGIS</Badge>
      </header>

      {!isAuthenticated ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Entre para ver as estações próximas
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            As distâncias partem do endereço privado da conta autenticada. Sem
            sessão, o mapa mostra apenas a camada pública.
          </p>
          <Link
            to="/entrar"
            className={buttonStyles('secondary', 'sm', 'mt-2 w-full')}
          >
            Entrar na conta
          </Link>
        </div>
      ) : !hasAddress ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Cadastre o imóvel para calcular as distâncias
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            A estação mais próxima só pode ser determinada depois que o endereço
            tem coordenadas confirmadas.
          </p>
          <Link
            to="/meu-endereco"
            className={buttonStyles('primary', 'sm', 'mt-2 w-full')}
          >
            Cadastrar meu endereço
          </Link>
        </div>
      ) : isLoading ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-attention-200 bg-attention-50 p-2.5">
          <Info
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-attention-700"
            aria-hidden="true"
          />
          <p className="text-[13px] leading-relaxed text-attention-900">
            {error}
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <CloudRain
            className="mx-auto h-5 w-5 text-slate-500"
            aria-hidden="true"
          />
          <p className="mt-1.5 text-center text-xs font-semibold text-slate-700">
            Nenhuma estação no raio consultado
          </p>
          <p className="mt-1 text-center text-xs leading-relaxed text-slate-500">
            Isso não significa ausência de chuva. A camada pública continua
            disponível no mapa.
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {visible.map((station, index) => {
              const reading = getRainReadingStatus(station)
              const state = READING_STATE_META[reading.state]
              const content = (
                <>
                  <span className="flex w-5 shrink-0 justify-center">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-800">
                      {index + 1}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-slate-900">
                        {station.name}
                      </span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Código {station.code}
                      {station.source ? ` · ${station.source}` : ''}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-0.5 font-semibold text-brand-700">
                        <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
                        {formatDistanceKm(station.distanceKm)}
                      </span>
                      <span className="font-semibold text-slate-800">
                        {formatRainValue(station)}
                      </span>
                      <span>
                        {station.lastReadingAt
                          ? `Leitura ${formatDateTimeShort(station.lastReadingAt)}`
                          : 'Horário indisponível'}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Qualidade: {station.quality ?? 'não informada'}
                      {station.municipality
                        ? ` · ${station.municipality}`
                        : ''}
                      {station.state ? `/${station.state}` : ''}
                    </span>
                  </span>
                </>
              )

              return (
                <li key={station.key}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(station.key)}
                      className="flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                      {content}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {canExpand ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  Mostrar apenas as {initialVisible} mais próximas
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  Mostrar todas as {sorted.length} estações
                </>
              )}
            </Button>
          ) : null}
        </>
      )}

      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-slate-50 p-2.5">
        <Info
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Estar próxima não significa representar hidrologicamente o imóvel.
          O acumulado é o valor informado pela fonte para a janela indicada;
          ausência de leitura não equivale a 0 mm nem a ausência de risco.
        </p>
      </div>

      <Link
        to="/mapa"
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
      >
        <LocateFixed className="h-3 w-3" aria-hidden="true" />
        Ver no mapa privado
      </Link>
    </Card>
  )
}
