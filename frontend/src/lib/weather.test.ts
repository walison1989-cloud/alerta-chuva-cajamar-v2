import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import {
  WeatherDataError,
  describeWeatherCode,
  fetchWeather,
  isWeatherData,
  parseOpenMeteoResponse,
} from '@/lib/weather'
import {
  buildOpenMeteoPayload,
  weatherDataFixture,
} from '@/test/fixtures/weather'

describe('describeWeatherCode', () => {
  it('traduz códigos WMO conhecidos', () => {
    expect(describeWeatherCode(0)).toEqual({
      label: 'Céu limpo',
      icon: 'sun',
      tone: 'clear',
    })
    expect(describeWeatherCode(65).label).toBe('Chuva forte')
    expect(describeWeatherCode(95).tone).toBe('storm')
  })

  it('devolve uma condição segura para código desconhecido', () => {
    expect(describeWeatherCode(999)).toEqual({
      label: 'Condição não identificada',
      icon: 'cloud',
      tone: 'cloudy',
    })
  })
})

describe('parseOpenMeteoResponse', () => {
  it('normaliza a resposta e separa previsão de observação', () => {
    const data = parseOpenMeteoResponse(buildOpenMeteoPayload(), 123)

    expect(data.fetchedAt).toBe(123)
    expect(data.current.temperatureC).toBe(21.1)
    expect(data.current.condition.label).toBe('Garoa leve')
    expect(data.timezone).toBe('America/Sao_Paulo')
    expect(data.elevationM).toBe(730)
    expect(data.hourly).toHaveLength(8)
    expect(data.daily).toHaveLength(3)
    expect(data.next24hPrecipMm).toBe(24)
    expect(data.next24hMax3hMm).toBe(3)
    expect(data.next24hMax6hMm).toBe(6)
    expect(data.next24hMaxProbabilityPct).toBe(50)
  })

  it('calcula picos móveis a partir de todas as horas e não da série amostrada do card', () => {
    const payload = buildOpenMeteoPayload()
    const hourly = payload.hourly as {precipitation: number[]}
    hourly.precipitation = [...hourly.precipitation]
    // Horas 21,22,23 contíguas que não estão todas na amostra do card.
    hourly.precipitation[21] = 9
    hourly.precipitation[22] = 10
    hourly.precipitation[23] = 11
    const data = parseOpenMeteoResponse(payload)
    expect(data.next24hMax3hMm).toBe(30)
    expect(data.next24hMax6hMm).toBe(33)
  })

  it('rejeita uma resposta sem o bloco current', () => {
    expect(() => parseOpenMeteoResponse({ hourly: {}, daily: {} })).toThrow(
      WeatherDataError,
    )
  })

  it('rejeita arrays horários vazios', () => {
    const payload = buildOpenMeteoPayload()
    payload.hourly = {
      time: [],
      precipitation: [],
      precipitation_probability: [],
      temperature_2m: [],
    }

    expect(() => parseOpenMeteoResponse(payload)).toThrow(
      'Resposta meteorológica inválida',
    )
  })
})

describe('isWeatherData', () => {
  it('aceita o contrato interno', () => {
    expect(isWeatherData(weatherDataFixture)).toBe(true)
  })

  it('rejeita objetos incompletos', () => {
    expect(isWeatherData({ current: {} })).toBe(false)
    expect(isWeatherData(null)).toBe(false)
  })
})

describe('fetchWeather', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('consulta a grade do imóvel quando recebe coordenadas válidas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildOpenMeteoPayload(),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchWeather(undefined, { latitude: -23.41, longitude: -46.84 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('latitude')).toBe('-23.41')
    expect(url.searchParams.get('longitude')).toBe('-46.84')
    expect(url.searchParams.get('timezone')).toBe(env.timezone)
  })

  it('usa o centro do município quando as coordenadas são inválidas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildOpenMeteoPayload(),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchWeather(undefined, { latitude: 999, longitude: Number.NaN })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('latitude')).toBe(
      String(env.municipality.latitude),
    )
    expect(url.searchParams.get('longitude')).toBe(
      String(env.municipality.longitude),
    )
  })
})
