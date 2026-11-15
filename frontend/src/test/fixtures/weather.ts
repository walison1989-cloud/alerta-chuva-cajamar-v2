import type { WeatherData } from '@/types/weather'

function buildHourlyTimes(): string[] {
  const result: string[] = []
  for (let index = 0; index < 48; index += 1) {
    const day = index < 24 ? '2026-11-05' : '2026-11-06'
    const hour = String(index % 24).padStart(2, '0')
    result.push(`${day}T${hour}:00`)
  }
  return result
}

export function buildOpenMeteoPayload(): Record<string, unknown> {
  const times = buildHourlyTimes()

  return {
    latitude: -23.374342,
    longitude: -46.890747,
    generationtime_ms: 0.28,
    utc_offset_seconds: -10800,
    timezone: 'America/Sao_Paulo',
    timezone_abbreviation: 'GMT-3',
    elevation: 730,
    current_units: {
      time: 'iso8601',
      interval: 'seconds',
      temperature_2m: '°C',
      relative_humidity_2m: '%',
      apparent_temperature: '°C',
      precipitation: 'mm',
      rain: 'mm',
      weather_code: 'wmo code',
      wind_speed_10m: 'km/h',
      wind_direction_10m: '°',
    },
    current: {
      time: '2026-11-05T19:30',
      interval: 900,
      temperature_2m: 21.1,
      relative_humidity_2m: 92,
      apparent_temperature: 24.4,
      precipitation: 0.1,
      rain: 0,
      weather_code: 51,
      wind_speed_10m: 3.1,
      wind_direction_10m: 324,
    },
    hourly_units: {
      time: 'iso8601',
      precipitation: 'mm',
      precipitation_probability: '%',
      temperature_2m: '°C',
    },
    hourly: {
      time: times,
      precipitation: times.map(() => 1),
      precipitation_probability: times.map(() => 50),
      temperature_2m: times.map(() => 20),
    },
    daily_units: {
      time: 'iso8601',
      precipitation_sum: 'mm',
      precipitation_probability_max: '%',
      temperature_2m_max: '°C',
      temperature_2m_min: '°C',
    },
    daily: {
      time: ['2026-11-05', '2026-11-06', '2026-11-07'],
      precipitation_sum: [10, 20, 5],
      precipitation_probability_max: [90, 80, 70],
      temperature_2m_max: [26, 27, 29],
      temperature_2m_min: [19, 18, 17],
    },
  }
}

export const weatherDataFixture: WeatherData = {
  current: {
    time: '2026-11-05T19:30',
    temperatureC: 21.1,
    apparentC: 24.4,
    humidityPct: 92,
    precipitationMm: 0.1,
    rainMm: 0,
    weatherCode: 51,
    windKmh: 3.1,
    windDirectionDeg: 324,
    condition: {
      label: 'Garoa leve',
      icon: 'drizzle',
      tone: 'rain',
    },
  },
  hourly: [
    {
      time: '2026-11-05T20:00',
      precipitationMm: 1,
      probabilityPct: 50,
      temperatureC: 20,
    },
    {
      time: '2026-11-05T23:00',
      precipitationMm: 1,
      probabilityPct: 50,
      temperatureC: 20,
    },
    {
      time: '2026-11-06T02:00',
      precipitationMm: 1,
      probabilityPct: 50,
      temperatureC: 20,
    },
  ],
  daily: [
    {
      date: '2026-11-05',
      precipitationMm: 10,
      probabilityPct: 90,
      maxC: 26,
      minC: 19,
    },
    {
      date: '2026-11-06',
      precipitationMm: 20,
      probabilityPct: 80,
      maxC: 27,
      minC: 18,
    },
    {
      date: '2026-11-07',
      precipitationMm: 5,
      probabilityPct: 70,
      maxC: 29,
      minC: 17,
    },
  ],
  next24hPrecipMm: 24,
  next24hMaxProbabilityPct: 50,
  elevationM: 730,
  timezone: 'America/Sao_Paulo',
  latitude: -23.374342,
  longitude: -46.890747,
  fetchedAt: 1_762_370_400_000,
}

export const weatherQueryFixture = {
  data: weatherDataFixture,
  error: null,
  isLoading: false,
  isRefreshing: false,
  isCached: false,
  lastFetchedAt: weatherDataFixture.fetchedAt,
  refresh: () => undefined,
}
