import {
  CloudRain,
  Droplets,
  Info,
  RefreshCw,
  Thermometer,
  Wind,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { WeatherGlyph } from '@/components/ui/WeatherGlyph'
import { useWeather } from '@/hooks/useWeather'
import {
  formatApiDateTime,
  formatMm,
  formatPercent,
  formatRelativeTime,
  formatTemperature,
} from '@/lib/format'
import { SOURCE_OPEN_METEO } from '@/config/app'

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Thermometer
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-slate-200/70">
      <Icon className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="truncate text-[13px] font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

/**
 * Condição meteorológica modelada para a região. É separada da chuva
 * observada para não apresentar saída de modelo como medição de pluviômetro.
 */
export function RegionWeatherCard() {
  const weather = useWeather()

  return (
    <div className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CloudRain className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            Clima na região
          </h2>
        </div>
        <Badge tone="neutral">Modelo</Badge>
      </header>

      {weather.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : weather.data ? (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-50 to-white p-3 ring-1 ring-brand-100">
            <WeatherGlyph
              icon={weather.data.current.condition.icon}
              className="h-9 w-9 shrink-0 text-brand-700"
            />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none text-slate-900">
                {formatTemperature(weather.data.current.temperatureC)}
              </p>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-600">
                {weather.data.current.condition.label}
              </p>
              <p className="text-xs text-slate-500">
                Sensação {formatTemperature(weather.data.current.apparentC)} ·{' '}
                {formatApiDateTime(weather.data.current.time)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Metric
              icon={CloudRain}
              label="Chuva agora"
              value={formatMm(weather.data.current.precipitationMm)}
            />
            <Metric
              icon={Droplets}
              label="Umidade"
              value={formatPercent(weather.data.current.humidityPct)}
            />
            <Metric
              icon={Wind}
              label="Vento"
              value={`${Math.round(weather.data.current.windKmh)} km/h`}
            />
            <Metric
              icon={CloudRain}
              label="Próximas 24 h"
              value={formatMm(weather.data.next24hPrecipMm)}
            />
          </div>

          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span>
              Condição e previsão são saídas do modelo {SOURCE_OPEN_METEO.label}.
              Não são medições de pluviômetro e não são alerta oficial.
              {weather.isCached
                ? ' Exibindo a última consulta salva neste aparelho.'
                : ''}
            </span>
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Clima indisponível
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {weather.error ??
              'Não foi possível consultar o modelo meteorológico agora.'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {weather.lastFetchedAt
            ? `Consultado ${formatRelativeTime(weather.lastFetchedAt)}`
            : 'Sem horário de consulta'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={weather.refresh}
          isLoading={weather.isRefreshing}
          className="min-h-7 px-2 text-xs"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Atualizar
        </Button>
      </div>
    </div>
  )
}
