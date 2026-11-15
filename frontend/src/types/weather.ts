export type WeatherIconKey =
  | 'sun'
  | 'partly-cloudy'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'storm'

export type WeatherTone = 'clear' | 'cloudy' | 'rain' | 'storm'

export interface WeatherCondition {
  label: string
  icon: WeatherIconKey
  tone: WeatherTone
}

export interface CurrentWeather {
  /** Horário local de Cajamar, no formato AAAA-MM-DDTHH:mm. */
  time: string
  temperatureC: number
  apparentC: number
  humidityPct: number
  /** Precipitação modelada para o intervalo atual, em mm. */
  precipitationMm: number
  rainMm: number
  weatherCode: number
  windKmh: number
  windDirectionDeg: number
  condition: WeatherCondition
}

export interface HourlyPoint {
  time: string
  precipitationMm: number
  probabilityPct: number
  temperatureC: number
}

export interface DailyPoint {
  date: string
  precipitationMm: number
  probabilityPct: number
  maxC: number
  minC: number
}

export interface WeatherData {
  current: CurrentWeather
  /** Próximas 24 horas, em intervalos de 3 horas. */
  hourly: HourlyPoint[]
  /** Previsão diária para 3 dias. */
  daily: DailyPoint[]
  /** Soma da precipitação prevista nas próximas 24 horas. */
  next24hPrecipMm: number
  /** Maior soma da precipitação em 3h e 6h consecutivas na próxima janela de 24h. */
  next24hMax3hMm?: number
  next24hMax6hMm?: number
  next24hMaxProbabilityPct: number
  /** Elevação do ponto de grade do modelo, em metros. */
  elevationM: number
  timezone: string
  latitude: number
  longitude: number
  /** Momento da resposta da API no navegador. */
  fetchedAt: number
}
