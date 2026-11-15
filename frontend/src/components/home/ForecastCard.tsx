import {
  AlertTriangle,
  CalendarDays,
  CloudRain,
  Droplets,
  ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { WeatherGlyph } from '@/components/ui/WeatherGlyph'
import { SOURCE_OPEN_METEO } from '@/config/app'
import type { WeatherQuery } from '@/hooks/useWeather'
import {
  formatApiDateTime,
  formatApiTime,
  formatDayLabel,
  formatMm,
  formatPercent,
} from '@/lib/format'

interface ForecastCardProps {
  weather: WeatherQuery
}

export function ForecastCard({ weather }: ForecastCardProps) {
  const { data, error, isLoading, refresh } = weather

  return (
    <Card className="p-5 sm:p-6" aria-labelledby="previsao-chuva">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="previsao-chuva"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Previsão de chuva
              </h2>
              <Badge tone="attention">Previsão</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Modelo Open-Meteo · não é chuva observada
            </p>
          </div>
        </div>
      </header>

      {isLoading && !data ? (
        <div className="mt-4 space-y-3" aria-label="Carregando previsão">
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-32 min-w-[76px]" />
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && error && !data ? (
        <div className="mt-4 rounded-2xl border border-attention-200 bg-attention-50 p-4">
          <div className="flex items-start gap-2 text-attention-900">
            <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Previsão indisponível</p>
              <p className="mt-1 text-xs leading-relaxed">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 min-h-11 rounded-lg bg-attention-600 px-3 text-xs font-bold text-white transition hover:bg-attention-700"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-brand-50 p-3.5">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-brand-700">
                Próximas 24 h
              </p>
              <p className="mt-1 text-xl font-bold tracking-tight text-brand-950">
                {formatMm(data.next24hPrecipMm)}
              </p>
              <p className="mt-0.5 text-[13px] text-brand-800/75">
                até {formatPercent(data.next24hMaxProbabilityPct)} de chance
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-100">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                Acumulado 3 dias
              </p>
              <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                {formatMm(
                  data.daily.reduce(
                    (total, day) => total + day.precipitationMm,
                    0,
                  ),
                )}
              </p>
              <p className="mt-0.5 text-[13px] text-slate-500">
                soma das previsões diárias
              </p>
            </div>
          </div>

          <div
            className="scroll-hidden mt-4 flex snap-x gap-2 overflow-x-auto pb-3"
            tabIndex={0}
            role="region"
            aria-label="Previsão de chuva a cada três horas"
          >
            {data.hourly.map((point) => (
              <div
                key={point.time}
                className="min-w-[78px] snap-start rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-center"
              >
                <p className="text-[13px] font-bold text-slate-600">
                  {formatApiTime(point.time)}
                </p>
                <WeatherGlyph
                  icon={point.precipitationMm > 0 ? 'rain' : 'cloud'}
                  className="mx-auto my-2 h-6 w-6 text-brand-600"
                />
                <p className="flex items-center justify-center gap-0.5 text-xs font-medium text-slate-500">
                  <Droplets className="h-3 w-3" aria-hidden="true" />
                  {formatPercent(point.probabilityPct)}
                </p>
                <p className="mt-0.5 text-xs font-bold text-brand-800">
                  {formatMm(point.precipitationMm)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
            {data.daily.map((day, index) => (
              <div
                key={day.date}
                className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0"
              >
                <div className="flex w-20 shrink-0 items-center gap-1.5">
                  <CloudRain
                    className="h-3.5 w-3.5 text-brand-500"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    {formatDayLabel(day.date, index)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-400"
                      style={{ width: `${Math.min(100, day.probabilityPct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPercent(day.probabilityPct)} de chance
                  </p>
                </div>
                <p className="w-20 text-right text-xs font-bold text-brand-800">
                  {formatMm(day.precipitationMm)}
                </p>
                <p className="w-16 text-right text-[13px] text-slate-500">
                  {Math.round(day.maxC)}° / {Math.round(day.minC)}°
                </p>
              </div>
            ))}
          </div>

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate-500">
            <span>Previsão de {formatApiDateTime(data.current.time)}</span>
            <a
              href={SOURCE_OPEN_METEO.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-slate-500 transition hover:text-brand-700"
            >
              Open-Meteo
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </footer>

          {error ? (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-attention-800">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
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
