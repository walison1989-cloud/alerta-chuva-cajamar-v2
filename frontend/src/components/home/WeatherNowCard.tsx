import {
  AlertTriangle,
  CloudRain,
  Droplets,
  ExternalLink,
  RotateCw,
  Thermometer,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WeatherQuery } from '@/hooks/useWeather'
import { SOURCE_OPEN_METEO } from '@/config/app'
import { cn } from '@/lib/cn'
import {
  formatApiDateTime,
  formatMm,
  formatPercent,
  formatRelativeTime,
} from '@/lib/format'
import { WeatherGlyph } from '@/components/ui/WeatherGlyph'

interface MetricProps {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
}

function Metric({ icon: Icon, label, value, hint }: MetricProps) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-brand-100">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-0.5 text-base font-semibold tracking-tight text-white">
        {value}
      </p>
      {hint ? (
        <p className="text-xs leading-tight text-brand-100">{hint}</p>
      ) : null}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="mt-6" aria-label="Carregando dados meteorológicos">
      <div className="animate-pulse space-y-3">
        <div className="h-14 w-32 rounded-2xl bg-white/15" />
        <div className="h-4 w-40 rounded-lg bg-white/15" />
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-20 rounded-2xl bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  )
}

interface WeatherNowCardProps {
  weather: WeatherQuery
}

export function WeatherNowCard({ weather }: WeatherNowCardProps) {
  const { data, error, isLoading, isRefreshing, isCached, lastFetchedAt, refresh } =
    weather

  return (
    <section
      aria-labelledby="clima-agora"
      className="weather-hero rounded-3xl p-5 text-white shadow-app sm:p-6"
    >
      <div className="relative z-10">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full bg-white/70"
                aria-hidden="true"
              />
              <h2
                id="clima-agora"
                className="text-xs font-bold uppercase tracking-[0.18em] text-brand-100"
              >
                Agora em Cajamar
              </h2>
            </div>
            <p className="mt-1 text-[13px] font-medium text-brand-100">
              Condição modelada · não é medição de estação local
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isCached ? (
              <span className="rounded-full bg-attention-300 px-2 py-1 text-xs font-bold text-attention-950">
                EM CACHE
              </span>
            ) : null}
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing || isLoading}
              aria-busy={isRefreshing || undefined}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20 disabled:opacity-60"
              aria-label="Atualizar dados meteorológicos"
            >
              <RotateCw
                className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
                aria-hidden="true"
              />
            </button>
          </div>
        </header>

        {isLoading && !data ? <LoadingState /> : null}

        {!isLoading && error && !data ? (
          <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 text-attention-300"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">Dados indisponíveis</p>
                <p className="mt-1 text-xs leading-relaxed text-brand-100/90">
                  {error}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-brand-800 transition hover:bg-brand-50"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Tentar novamente
            </button>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-end gap-1">
                  <span className="text-6xl font-semibold leading-none tracking-tighter sm:text-7xl">
                    {Math.round(data.current.temperatureC)}
                  </span>
                  <span className="mb-1.5 text-2xl font-medium text-brand-100">
                    °C
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold leading-tight">
                  {data.current.condition.label}
                </p>
                <p className="mt-0.5 text-sm text-brand-100/85">
                  Sensação de {Math.round(data.current.apparentC)} °C
                </p>
              </div>
              <WeatherGlyph
                icon={data.current.condition.icon}
                className="h-24 w-24 text-white/85 sm:h-28 sm:w-28"
                strokeWidth={1.25}
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Metric
                icon={Droplets}
                label="Chuva agora"
                value={formatMm(data.current.precipitationMm)}
                hint="modelo, não medidor"
              />
              <Metric
                icon={CloudRain}
                label="Próx. 24 h"
                value={formatMm(data.next24hPrecipMm)}
                hint={`até ${formatPercent(data.next24hMaxProbabilityPct)} de chance de chuva`}
              />
              <Metric
                icon={Thermometer}
                label="Umidade"
                value={formatPercent(data.current.humidityPct)}
                hint="umidade relativa do ar"
              />
              <Metric
                icon={Wind}
                label="Vento"
                value={`${Math.round(data.current.windKmh)} km/h`}
                hint="intensidade média"
              />
            </div>

            <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3 text-[13px] text-brand-100">
              <span>
                Dados de {formatApiDateTime(data.current.time)}
                {lastFetchedAt
                  ? ` · atualizado ${formatRelativeTime(lastFetchedAt)}`
                  : ''}
              </span>
              <a
                href={SOURCE_OPEN_METEO.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-white transition hover:text-brand-100"
              >
                Fonte: Open-Meteo
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </footer>

            {error ? (
              <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-attention-100">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
