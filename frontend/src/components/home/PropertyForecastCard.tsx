import {
  AlertTriangle,
  CloudRain,
  Droplets,
  ExternalLink,
  Info,
  RotateCw,
  Thermometer,
  Wind,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { SOURCE_OPEN_METEO } from '@/config/app'
import { useWeather } from '@/hooks/useWeather'
import {
  formatApiDateTime,
  formatDayLabel,
  formatLatitude,
  formatLongitude,
  formatMm,
  formatPercent,
  formatRelativeTime,
  formatTemperature,
} from '@/lib/format'

interface PropertyForecastCardProps {
  latitude: number
  longitude: number
}

/**
 * Previsão Open-Meteo para a grade mais próxima do imóvel. Esta seção é
 * deliberadamente separada da chuva observada nas estações: modelo e medição
 * não são a mesma coisa e não geram classificação de risco de alagamento.
 */
export function PropertyForecastCard({
  latitude,
  longitude,
}: PropertyForecastCardProps) {
  const weather = useWeather({ latitude, longitude })
  const { data, error, isLoading, isRefreshing, isCached, lastFetchedAt, refresh } =
    weather

  return (
    <Card className="p-5" aria-labelledby="previsao-imovel">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="rounded-2xl bg-sky-50 p-2 text-sky-700">
            <CloudRain className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="previsao-imovel"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Previsão para a região do imóvel
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Condições meteorológicas modeladas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isCached ? <Badge tone="attention">Em cache</Badge> : null}
          <Badge tone="brand">Open-Meteo · modelo</Badge>
        </div>
      </header>

      <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-2.5">
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-sky-900">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Previsão não é chuva observada. Os valores abaixo vêm de um modelo
          meteorológico e não substituem as medições das estações nem os avisos
          oficiais.
        </p>
      </div>

      {isLoading && !data ? (
        <Skeleton className="mt-3 h-32 w-full" />
      ) : null}

      {!isLoading && error && !data ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-attention-200 bg-attention-50 p-2.5">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-attention-700"
            aria-hidden="true"
          />
          <div>
            <p className="text-[13px] font-semibold text-attention-900">
              Previsão indisponível
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-attention-800">
              {error}
            </p>
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold leading-none tracking-tight text-slate-900">
                {formatTemperature(data.current.temperatureC)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                {data.current.condition.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Sensação de {formatTemperature(data.current.apparentC)}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-brand-200 hover:text-brand-800 disabled:opacity-60"
              aria-label="Atualizar previsão do imóvel"
            >
              <RotateCw
                className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <CloudRain className="h-3 w-3" aria-hidden="true" />
                Próximas 24 h
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {formatMm(data.next24hPrecipMm)}
              </p>
              <p className="text-xs text-slate-500">
                até {formatPercent(data.next24hMaxProbabilityPct)} de chance
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <Droplets className="h-3 w-3" aria-hidden="true" />
                Umidade
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {formatPercent(data.current.humidityPct)}
              </p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Thermometer className="h-2.5 w-2.5" aria-hidden="true" />
                {formatTemperature(data.current.temperatureC)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <Wind className="h-3 w-3" aria-hidden="true" />
                Vento
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {Math.round(data.current.windKmh)} km/h
              </p>
              <p className="text-xs text-slate-500">intensidade média</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-xs font-semibold text-slate-500">
                Chuva agora
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {formatMm(data.current.precipitationMm)}
              </p>
              <p className="text-xs text-slate-500">modelo, não medidor</p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Próximos dias
            </p>
            <ul className="mt-1.5 space-y-1">
              {data.daily.slice(0, 3).map((day, index) => (
                <li
                  key={day.date}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-xs"
                >
                  <span className="font-semibold text-slate-700">
                    {formatDayLabel(day.date, index)}
                  </span>
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="inline-flex items-center gap-0.5 font-semibold text-sky-800">
                      <CloudRain className="h-2.5 w-2.5" aria-hidden="true" />
                      {formatMm(day.precipitationMm)}
                    </span>
                    <span>{formatPercent(day.probabilityPct)}</span>
                    <span className="text-slate-500">
                      {formatTemperature(day.maxC)} / {formatTemperature(day.minC)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <footer className="mt-3 border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-500">
            <p>
              Grade do modelo em {formatLatitude(data.latitude)},{' '}
              {formatLongitude(data.longitude)} · referência{' '}
              {formatApiDateTime(data.current.time)}
              {lastFetchedAt
                ? ` · consultado ${formatRelativeTime(lastFetchedAt)}`
                : ''}
            </p>
            <a
              href={SOURCE_OPEN_METEO.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              Fonte: Open-Meteo
              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </a>
          </footer>

          {error ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-attention-800">
              <AlertTriangle
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}
