import { env } from '@/config/env'
import type {
  CurrentWeather,
  DailyPoint,
  HourlyPoint,
  WeatherCondition,
  WeatherData,
} from '@/types/weather'

export class WeatherDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeatherDataError'
  }
}

const CONDITIONS: Record<number, WeatherCondition> = {
  0: { label: 'Céu limpo', icon: 'sun', tone: 'clear' },
  1: { label: 'Predominantemente limpo', icon: 'partly-cloudy', tone: 'clear' },
  2: { label: 'Parcialmente nublado', icon: 'partly-cloudy', tone: 'cloudy' },
  3: { label: 'Nublado', icon: 'cloud', tone: 'cloudy' },
  45: { label: 'Neblina', icon: 'fog', tone: 'cloudy' },
  48: { label: 'Neblina com geada', icon: 'fog', tone: 'cloudy' },
  51: { label: 'Garoa leve', icon: 'drizzle', tone: 'rain' },
  53: { label: 'Garoa moderada', icon: 'drizzle', tone: 'rain' },
  55: { label: 'Garoa intensa', icon: 'drizzle', tone: 'rain' },
  56: { label: 'Garoa congelante leve', icon: 'drizzle', tone: 'rain' },
  57: { label: 'Garoa congelante intensa', icon: 'drizzle', tone: 'rain' },
  61: { label: 'Chuva leve', icon: 'rain', tone: 'rain' },
  63: { label: 'Chuva moderada', icon: 'rain', tone: 'rain' },
  65: { label: 'Chuva forte', icon: 'heavy-rain', tone: 'rain' },
  66: { label: 'Chuva congelante leve', icon: 'rain', tone: 'rain' },
  67: { label: 'Chuva congelante forte', icon: 'heavy-rain', tone: 'rain' },
  71: { label: 'Neve leve', icon: 'snow', tone: 'cloudy' },
  73: { label: 'Neve moderada', icon: 'snow', tone: 'cloudy' },
  75: { label: 'Neve forte', icon: 'snow', tone: 'cloudy' },
  77: { label: 'Grãos de neve', icon: 'snow', tone: 'cloudy' },
  80: { label: 'Pancadas de chuva leves', icon: 'rain', tone: 'rain' },
  81: { label: 'Pancadas de chuva moderadas', icon: 'rain', tone: 'rain' },
  82: { label: 'Pancadas de chuva fortes', icon: 'heavy-rain', tone: 'rain' },
  85: { label: 'Pancadas de neve leves', icon: 'snow', tone: 'cloudy' },
  86: { label: 'Pancadas de neve fortes', icon: 'snow', tone: 'cloudy' },
  95: { label: 'Tempestade', icon: 'storm', tone: 'storm' },
  96: { label: 'Tempestade com granizo leve', icon: 'storm', tone: 'storm' },
  99: { label: 'Tempestade com granizo forte', icon: 'storm', tone: 'storm' },
}

const UNKNOWN_CONDITION: WeatherCondition = {
  label: 'Condição não identificada',
  icon: 'cloud',
  tone: 'cloudy',
}

export function describeWeatherCode(code: number): WeatherCondition {
  return CONDITIONS[code] ?? UNKNOWN_CONDITION
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WeatherDataError(`Resposta meteorológica inválida: ${field}.`)
  }
  return value as Record<string, unknown>
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
  field: string,
): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WeatherDataError(`Resposta meteorológica inválida: ${field}.`)
  }
  return value
}

function readOptionalNumber(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readString(
  source: Record<string, unknown>,
  key: string,
  field: string,
): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new WeatherDataError(`Resposta meteorológica inválida: ${field}.`)
  }
  return value
}

function readStringArray(
  source: Record<string, unknown>,
  key: string,
  field: string,
): string[] {
  const value = source[key]
  if (!Array.isArray(value) || value.length === 0) {
    throw new WeatherDataError(`Resposta meteorológica inválida: ${field}.`)
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new WeatherDataError(
        `Resposta meteorológica inválida: ${field}[${index}].`,
      )
    }
    return item
  })
}

function readNumberArray(
  source: Record<string, unknown>,
  key: string,
  field: string,
): number[] {
  const value = source[key]
  if (!Array.isArray(value) || value.length === 0) {
    throw new WeatherDataError(`Resposta meteorológica inválida: ${field}.`)
  }
  return value.map((item, index) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new WeatherDataError(
        `Resposta meteorológica inválida: ${field}[${index}].`,
      )
    }
    return item
  })
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Converte a resposta bruta da Open-Meteo em um contrato interno estável.
 * Isso permite trocar a fonte meteorológica sem reescrever a interface.
 */
export function parseOpenMeteoResponse(
  payload: unknown,
  fetchedAt = Date.now(),
): WeatherData {
  const root = asRecord(payload, 'raiz')
  const currentRaw = asRecord(root.current, 'current')
  const hourlyRaw = asRecord(root.hourly, 'hourly')
  const dailyRaw = asRecord(root.daily, 'daily')

  const currentTime = readString(currentRaw, 'time', 'current.time')
  const weatherCode = Math.round(
    readNumber(currentRaw, 'weather_code', 'current.weather_code'),
  )

  const current: CurrentWeather = {
    time: currentTime,
    temperatureC: readNumber(currentRaw, 'temperature_2m', 'current.temperature_2m'),
    apparentC: readNumber(
      currentRaw,
      'apparent_temperature',
      'current.apparent_temperature',
    ),
    humidityPct: readNumber(
      currentRaw,
      'relative_humidity_2m',
      'current.relative_humidity_2m',
    ),
    precipitationMm: Math.max(
      0,
      readNumber(currentRaw, 'precipitation', 'current.precipitation'),
    ),
    rainMm: Math.max(0, readNumber(currentRaw, 'rain', 'current.rain')),
    weatherCode,
    windKmh: Math.max(0, readNumber(currentRaw, 'wind_speed_10m', 'current.wind_speed_10m')),
    windDirectionDeg: readNumber(
      currentRaw,
      'wind_direction_10m',
      'current.wind_direction_10m',
    ),
    condition: describeWeatherCode(weatherCode),
  }

  const hourlyTimes = readStringArray(hourlyRaw, 'time', 'hourly.time')
  const hourlyPrecipitation = readNumberArray(
    hourlyRaw,
    'precipitation',
    'hourly.precipitation',
  )
  const hourlyProbability = readNumberArray(
    hourlyRaw,
    'precipitation_probability',
    'hourly.precipitation_probability',
  )
  const hourlyTemperature = readNumberArray(
    hourlyRaw,
    'temperature_2m',
    'hourly.temperature_2m',
  )

  const hourlyLength = Math.min(
    hourlyTimes.length,
    hourlyPrecipitation.length,
    hourlyProbability.length,
    hourlyTemperature.length,
  )

  if (hourlyLength === 0) {
    throw new WeatherDataError('Resposta meteorológica sem dados horários.')
  }

  let startIndex = hourlyTimes.findIndex((time) => time >= currentTime)
  if (startIndex < 0) startIndex = Math.max(0, hourlyLength - 1)

  const hourly: HourlyPoint[] = []
  for (let index = startIndex; index < hourlyLength && hourly.length < 8; index += 3) {
    hourly.push({
      time: hourlyTimes[index]!,
      precipitationMm: Math.max(0, hourlyPrecipitation[index]!),
      probabilityPct: Math.min(100, Math.max(0, hourlyProbability[index]!)),
      temperatureC: hourlyTemperature[index]!,
    })
  }

  const next24End = Math.min(startIndex + 24, hourlyLength)
  let next24hPrecipMm = 0
  let next24hMaxProbabilityPct = 0
  const chuvaHoraria24h: number[] = []
  for (let index = startIndex; index < next24End; index += 1) {
    chuvaHoraria24h.push(Math.max(0, hourlyPrecipitation[index]!))
    next24hPrecipMm += Math.max(0, hourlyPrecipitation[index]!)
    next24hMaxProbabilityPct = Math.max(
      next24hMaxProbabilityPct,
      hourlyProbability[index]!,
    )
  }

  // Janelas móveis da série horária COMPLETA, não da amostra de 3 em 3 horas
  // usada nos cards de previsão. Uma previsão de 25mm/24h não é 25mm/h.
  const picoMovel = (janela: number): number => {
    if (chuvaHoraria24h.length < janela) return 0
    let maior = 0
    for (let i = 0; i <= chuvaHoraria24h.length - janela; i++) {
      const total = chuvaHoraria24h.slice(i, i + janela).reduce((a, b) => a + b, 0)
      maior = Math.max(maior, total)
    }
    return round(maior, 1)
  }

  const dailyTimes = readStringArray(dailyRaw, 'time', 'daily.time')
  const dailyPrecipitation = readNumberArray(
    dailyRaw,
    'precipitation_sum',
    'daily.precipitation_sum',
  )
  const dailyProbability = readNumberArray(
    dailyRaw,
    'precipitation_probability_max',
    'daily.precipitation_probability_max',
  )
  const dailyMax = readNumberArray(
    dailyRaw,
    'temperature_2m_max',
    'daily.temperature_2m_max',
  )
  const dailyMin = readNumberArray(
    dailyRaw,
    'temperature_2m_min',
    'daily.temperature_2m_min',
  )

  const dailyLength = Math.min(
    dailyTimes.length,
    dailyPrecipitation.length,
    dailyProbability.length,
    dailyMax.length,
    dailyMin.length,
  )

  const daily: DailyPoint[] = []
  for (let index = 0; index < dailyLength; index += 1) {
    daily.push({
      date: dailyTimes[index]!,
      precipitationMm: Math.max(0, dailyPrecipitation[index]!),
      probabilityPct: Math.min(100, Math.max(0, dailyProbability[index]!)),
      maxC: dailyMax[index]!,
      minC: dailyMin[index]!,
    })
  }

  if (daily.length === 0) {
    throw new WeatherDataError('Resposta meteorológica sem previsão diária.')
  }

  return {
    current,
    hourly,
    daily,
    next24hPrecipMm: round(next24hPrecipMm, 1),
    next24hMax3hMm: picoMovel(3),
    next24hMax6hMm: picoMovel(6),
    next24hMaxProbabilityPct: Math.round(next24hMaxProbabilityPct),
    elevationM: readOptionalNumber(root, 'elevation', 0),
    timezone: readString(root, 'timezone', 'timezone'),
    latitude: readOptionalNumber(root, 'latitude', env.municipality.latitude),
    longitude: readOptionalNumber(root, 'longitude', env.municipality.longitude),
    fetchedAt,
  }
}

export function isWeatherData(value: unknown): value is WeatherData {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<WeatherData>
  return (
    typeof candidate.fetchedAt === 'number' &&
    typeof candidate.current === 'object' &&
    candidate.current !== null &&
    typeof candidate.current.temperatureC === 'number' &&
    Array.isArray(candidate.hourly) &&
    Array.isArray(candidate.daily) &&
    typeof candidate.next24hPrecipMm === 'number'
  )
}

export interface WeatherCoordinates {
  latitude: number
  longitude: number
}

function isValidCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max
}

/**
 * Consulta a previsão da Open-Meteo. Sem coordenadas válidas, usa o centro do
 * município; com coordenadas do imóvel, consulta a grade mais próxima do
 * ponto confirmado. A previsão continua sendo dado modelado, nunca medição.
 */
export async function fetchWeather(
  signal?: AbortSignal,
  coordinates?: WeatherCoordinates | null,
): Promise<WeatherData> {
  const hasPropertyCoordinates =
    coordinates !== null &&
    coordinates !== undefined &&
    isValidCoordinate(coordinates.latitude, -90, 90) &&
    isValidCoordinate(coordinates.longitude, -180, 180)

  const latitude = hasPropertyCoordinates
    ? coordinates.latitude
    : env.municipality.latitude
  const longitude = hasPropertyCoordinates
    ? coordinates.longitude
    : env.municipality.longitude

  const url = new URL(env.openMeteoBaseUrl)
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'precipitation,precipitation_probability,temperature_2m',
    daily:
      'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min',
    timezone: env.timezone,
    forecast_days: '3',
    past_days: '0',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  }).toString()

  let response: Response
  try {
    response = await fetch(url.toString(), {
      signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new WeatherDataError(
      'Não foi possível conectar ao serviço meteorológico. Verifique sua conexão e tente novamente.',
    )
  }

  if (!response.ok) {
    throw new WeatherDataError(
      `O serviço meteorológico respondeu com HTTP ${response.status}. Tente novamente em alguns minutos.`,
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new WeatherDataError(
      'O serviço meteorológico devolveu uma resposta que não pôde ser lida.',
    )
  }

  return parseOpenMeteoResponse(payload)
}
