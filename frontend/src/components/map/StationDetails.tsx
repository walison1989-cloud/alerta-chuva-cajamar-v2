import {
  Clock,
  CloudRain,
  Database,
  ExternalLink,
  Gauge,
  Info,
  MapPin,
  Ruler,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { OFFICIAL_LINKS } from '@/config/app'
import {
  RAIN_LEVEL_META,
  formatDistanceKm,
  formatRainValue,
  getRainReadingStatus,
} from '@/lib/rain'
import {
  formatDateTime,
  formatLatitude,
  formatLongitude,
} from '@/lib/format'
import type { RainStation } from '@/types/rain'
import { RAIN_SOURCE_URLS } from '@/lib/rainSources'

interface StationDetailsProps {
  station: RainStation | null
  /** Instante de referência da consulta, para evitar Date.now() no render. */
  now: number
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </dt>
        <dd className="text-xs leading-snug text-slate-700">{children}</dd>
      </div>
    </div>
  )
}

export function StationDetails({ station, now }: StationDetailsProps) {
  if (!station) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
        <Gauge className="mx-auto h-6 w-6 text-slate-500" aria-hidden="true" />
        <p className="mt-2 text-xs font-semibold text-slate-700">
          Selecione uma estação
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Clique em um marcador do mapa ou em um item da lista para ver
          identificação, leitura, horário e fonte.
        </p>
      </div>
    )
  }

  const reading = getRainReadingStatus(station, now)
  const levelMeta = RAIN_LEVEL_META[reading.level]
  const cemaden = OFFICIAL_LINKS.find((link) => link.label === 'CEMADEN')
  const sourceUrl = RAIN_SOURCE_URLS[station.source as keyof typeof RAIN_SOURCE_URLS] ?? (station.source === 'CEMADEN' ? cemaden?.href : undefined)
  const windowLabel = station.windowHours
    ? `${station.windowHours} h`
    : 'janela não informada'
  const missing = reading.state !== 'ok'

  return (
    <div className="space-y-3">
      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">{station.source}</Badge>
          <Badge tone={missing ? 'attention' : 'safe'}>
            {missing ? 'Dados indisponíveis ou desatualizados' : 'Leitura disponível'}
          </Badge>
        </div>
        <h3 className="mt-1.5 text-sm font-bold tracking-tight text-slate-900">
          {station.name}
        </h3>
        {station.catalogueOnly ? <p className="mt-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Somente catálogo: este posto não tem medição de chuva integrada. A localização pode ser aproximada; a operação atual não está confirmada.</p> : null}
        <p className="text-[13px] text-slate-500">
          Código {station.code}
          {station.network ? ` · ${station.network}` : ''}
        </p>
      </header>

      <div className="grid gap-2 rounded-2xl bg-slate-50/80 p-3 sm:grid-cols-2">
        <DetailRow icon={CloudRain} label={`Acumulado (${windowLabel})`}>
          <span className="text-sm font-bold text-slate-900">
            {formatRainValue(station)}
          </span>
        </DetailRow>
        <DetailRow icon={Gauge} label="Faixa visual">
          {levelMeta.label} · {levelMeta.range}
        </DetailRow>
        <DetailRow icon={Clock} label="Leitura da fonte">
          {formatDateTime(station.lastReadingAt)}
        </DetailRow>
        <DetailRow icon={Database} label="Coleta do conjunto">
          {formatDateTime(station.lastCollectedAt)}
        </DetailRow>
        <DetailRow icon={MapPin} label="Coordenadas da estação">
          {formatLatitude(station.latitude)}, {formatLongitude(station.longitude)}
        </DetailRow>
        <DetailRow icon={Ruler} label="Distância do imóvel (PostGIS)">
          {formatDistanceKm(station.distanceKm)}
        </DetailRow>
      </div>

      <div
        className={
          missing
            ? 'flex items-start gap-2 rounded-xl border border-attention-200 bg-attention-50 p-2.5'
            : 'flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5'
        }
      >
        <Info
          className={
            missing
              ? 'mt-0.5 h-3.5 w-3.5 shrink-0 text-attention-700'
              : 'mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700'
          }
          aria-hidden="true"
        />
        <p className="text-[13px] leading-relaxed text-slate-700">
          {reading.detail}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        {station.source === 'CEMADEN' ? <>O campo <code className="font-semibold">atualizado</code> do CEMADEN
        identifica o horário de geração do conjunto, não um horário individual
        por estação. </> : null}Qualidade informada:{' '}
        <span className="font-semibold text-slate-500">
          {station.quality === 'catalogo_historico_coordenadas_aproximadas' ? 'Catálogo histórico; coordenadas aproximadas' : station.quality === 'catalogo_sem_medicao' ? 'Catálogo; sem medição integrada' : station.quality ?? 'não informada'}
        </span>
        . Distâncias privadas são calculadas no servidor a partir do endereço da
        conta autenticada.
      </p>

      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-800"
        >
          Consultar {station.source === 'CEMADEN' ? 'o CEMADEN' : station.source}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}
