import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWeather, isWeatherData } from '@/lib/weather'
import type { WeatherCoordinates } from '@/lib/weather'
import type { WeatherData } from '@/types/weather'

const CACHE_KEY_PREFIX = 'alerta-chuva-cajamar:weather:v1'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 12_000

interface CachedWeather {
  savedAt: number
  data: WeatherData
}

export interface WeatherQuery {
  data: WeatherData | null
  error: string | null
  isLoading: boolean
  isRefreshing: boolean
  isCached: boolean
  lastFetchedAt: number | null
  refresh: () => void
}

/**
 * Cache em memória de requisições Open-Meteo em voo.
 *
 * Cada entrada tem um contador de consumidores. Uma requisição compartilhada
 * só é abortada quando o último consumidor cancela; assim, desmontar um card
 * não derruba a consulta de outro componente que usa as mesmas coordenadas.
 */
interface InflightWeatherRequest {
  promise: Promise<WeatherData>
  controller: AbortController
  consumers: number
  settled: boolean
}

const inflightRequests = new Map<string, InflightWeatherRequest>()
const privateWeatherCache = new Map<string, CachedWeather>()

export function clearPrivateWeatherCache(): void {
  privateWeatherCache.clear()
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(`${CACHE_KEY_PREFIX}:imovel:`)) window.localStorage.removeItem(key)
    }
    // Remove the persistent runtime cache created by pre-MVP service workers.
    void globalThis.caches?.delete('open-meteo').catch(() => {})
  } catch { /* Storage may be disabled. */ }
}

function acquireWeatherRequest(
  cacheKey: string,
  coordinates: WeatherCoordinates | null,
  signal: AbortSignal,
): { promise: Promise<WeatherData>; release: () => void } {
  let entry = inflightRequests.get(cacheKey)

  if (!entry) {
    const controller = new AbortController()
    const created: InflightWeatherRequest = {
      controller,
      consumers: 0,
      settled: false,
      promise: fetchWeather(controller.signal, coordinates),
    }
    created.promise = created.promise.finally(() => {
      created.settled = true
      if (inflightRequests.get(cacheKey) === created) {
        inflightRequests.delete(cacheKey)
      }
    })
    entry = created
    inflightRequests.set(cacheKey, entry)
  }

  const request = entry
  request.consumers += 1

  let released = false
  const release = () => {
    if (released) return
    released = true
    request.consumers = Math.max(0, request.consumers - 1)

    if (request.consumers === 0 && !request.settled) {
      request.controller.abort()
      if (inflightRequests.get(cacheKey) === request) {
        inflightRequests.delete(cacheKey)
      }
    }
  }

  if (signal.aborted) release()
  else signal.addEventListener('abort', release, { once: true })

  return {
    promise: request.promise,
    release: () => {
      signal.removeEventListener('abort', release)
      release()
    },
  }
}

function readCache(cacheKey: string): CachedWeather | null {
  if (cacheKey.includes(':imovel:')) {
    const cached = privateWeatherCache.get(cacheKey)
    return cached && Date.now() - cached.savedAt >= 0 && Date.now() - cached.savedAt <= CACHE_TTL_MS ? cached : null
  }
  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const candidate = parsed as { savedAt?: unknown; data?: unknown }
    if (
      typeof candidate.savedAt !== 'number' ||
      !isWeatherData(candidate.data)
    ) {
      return null
    }

    if (Date.now() - candidate.savedAt > CACHE_TTL_MS) return null

    return { savedAt: candidate.savedAt, data: candidate.data }
  } catch {
    return null
  }
}

function writeCache(cacheKey: string, data: WeatherData): void {
  if (cacheKey.includes(':imovel:')) {
    if (privateWeatherCache.size >= 20) privateWeatherCache.delete(privateWeatherCache.keys().next().value!)
    privateWeatherCache.set(cacheKey, { savedAt: data.fetchedAt, data })
    return
  }
  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({ savedAt: data.fetchedAt, data }),
    )
  } catch {
    // Armazenamento indisponível (modo privado/cota). O app continua online.
  }
}

function describeError(error: unknown, timedOut: boolean): string {
  if (timedOut) {
    return 'A consulta demorou mais que o esperado. Verifique sua conexão e tente novamente.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Não foi possível obter os dados meteorológicos agora.'
}

export function useWeather(
  coordinates?: WeatherCoordinates | null,
): WeatherQuery {
  const [data, setData] = useState<WeatherData | null>(null)
  const [dataCacheKey, setDataCacheKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCached, setIsCached] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const latitude = coordinates?.latitude
  const longitude = coordinates?.longitude

  // A chave separa o cache da região central do cache do imóvel. Sem isso, a
  // previsão do imóvel poderia reutilizar (ou sobrescrever) a previsão padrão.
  const coordinateKey = useMemo(() => {
    if (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      return `imovel:${latitude.toFixed(4)},${longitude.toFixed(4)}`
    }
    return 'municipio'
  }, [latitude, longitude])

  const cacheKey = `${CACHE_KEY_PREFIX}:${coordinateKey}`
  const coordinatesRef = useRef<WeatherCoordinates | null>(coordinates ?? null)
  coordinatesRef.current = coordinates ?? null

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1)
  }, [])

  // BroadcastChannel para sincronizar entre abas: quando uma aba obtém novos
  // dados, as outras abas com as mesmas coordenadas podem reutilizá-los em vez
  // de disparar requisições duplicadas.
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined' || cacheKey.includes(':imovel:')) return
    let active = true
    broadcastChannelRef.current = new BroadcastChannel('alerta-chuva-cajamar:weather')
    const handler = (event: MessageEvent) => {
      if (!active) return
      if (event.data?.cacheKey !== cacheKey) return
      if (!isWeatherData(event.data?.data)) return
      setDataCacheKey(cacheKey)
      setData(event.data.data)
      setLastFetchedAt(event.data.data.fetchedAt)
      setIsCached(true)
      setError(null)
      setIsLoading(false)
      setIsRefreshing(false)
    }
    broadcastChannelRef.current.addEventListener('message', handler)
    return () => {
      active = false
      broadcastChannelRef.current?.removeEventListener('message', handler)
      broadcastChannelRef.current?.close()
      broadcastChannelRef.current = null
    }
  }, [cacheKey])

  useEffect(() => {
    let active = true
    let timedOut = false
    const controller = new AbortController()

    setError(null)
    setIsRefreshing((previous) => previous || data !== null)
    setIsLoading(data === null)

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const cached = readCache(cacheKey)
      if (cached) {
        setDataCacheKey(cacheKey)
        setData(cached.data)
        setLastFetchedAt(cached.savedAt)
        setIsCached(true)
        setError(
          'Você está offline. Exibindo a última consulta meteorológica salva neste aparelho.',
        )
      } else {
        setError(
          'Você está offline e não há dados meteorológicos salvos neste aparelho.',
        )
      }
      setIsLoading(false)
      setIsRefreshing(false)
      return () => {
        active = false
      }
    }

    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    async function load(): Promise<void> {
      const request = acquireWeatherRequest(
        cacheKey,
        coordinatesRef.current,
        controller.signal,
      )

      try {
        const result = await request.promise
        if (!active) return

        writeCache(cacheKey, result)
        setDataCacheKey(cacheKey)
        setData(result)
        setError(null)
        setIsCached(false)
        setLastFetchedAt(result.fetchedAt)
        broadcastChannelRef.current?.postMessage({ cacheKey, data: result })
      } catch (caught) {
        if (!active) return
        handleError(caught, timedOut)
      } finally {
        request.release()
        if (active) {
          window.clearTimeout(timeoutId)
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    function handleError(caught: unknown, timedOut: boolean): void {
      const cached = readCache(cacheKey)
      const message = describeError(caught, timedOut)

      if (cached) {
        setDataCacheKey(cacheKey)
        setData(cached.data)
        setLastFetchedAt(cached.savedAt)
        setIsCached(true)
      } else {
        setData(null)
        setLastFetchedAt(null)
        setIsCached(false)
      }
      setError(message)
    }

    void load()

    return () => {
      active = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
    // `data` é intencionalmente lido apenas para definir o estado de carregamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, refreshToken])

  return {
    data: dataCacheKey === cacheKey ? data : null,
    error,
    isLoading,
    isRefreshing,
    isCached,
    lastFetchedAt,
    refresh,
  }
}
