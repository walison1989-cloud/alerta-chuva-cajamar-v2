import { env } from '@/config/env'
import { isValidCoordinate } from '@/lib/addressValidation'
import type {
  RainCollectionStatus,
  RainStation,
} from '@/types/rain'

/**
 * Leitura direta do JSONP público do CEMADEN.
 *
 * É um modo secundário, usado apenas quando a camada sincronizada do Supabase
 * ainda não tem estações. Ele não substitui o PostGIS nem grava histórico; a
 * interface identifica essa origem e não calcula distâncias do imóvel.
 *
 * O CEMADEN publica `estacoes([...])`. O próprio mapa oficial usa JSONP, por
 * isso o carregamento por <script> funciona sem CORS.
 */
export const CEMADEN_LIVE_ENDPOINT =
  'https://resources.cemaden.gov.br/dados/311_24.json'
export const CEMADEN_LIVE_RADIUS_KM = 30
export const CEMADEN_LIVE_MAX_STATIONS = 300
export const CEMADEN_LIVE_MAX_MM = 500
export const CEMADEN_LIVE_CALLBACK = 'estacoes'
export const CEMADEN_LIVE_TIMEOUT_MS = 15_000

const CAJAMAR_IBGE = 3509205

export class CemadenLiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CemadenLiveError'
  }
}

interface LiveRawStation {
  code: string
  name: string
  latitude: number
  longitude: number
  municipality: string | null
  state: string
  accumulatedMm: number | null
  sourceId: string | null
  ibgeCode: number | null
  sourceStatus: number | null
  stationType: string | null
  network: string | null
  distanceKm: number
}

export interface CemadenLivePayload {
  updatedAt: string
  stations: LiveRawStation[]
  stationsReceived: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readInteger(value: unknown): number | null {
  const valueAsNumber = readNumber(value)
  return valueAsNumber === null ? null : Math.trunc(valueAsNumber)
}

export function parseCemadenLiveTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = /UTC$/i.test(trimmed)
    ? `${trimmed.replace(/\s*UTC$/i, '')}Z`
    : trimmed
  const parsed = new Date(normalized.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function haversineKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const deltaLatitude = toRadians(latitudeB - latitudeA)
  const deltaLongitude = toRadians(longitudeB - longitudeA)
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

export function parseCemadenLivePayload(
  payload: unknown,
  radiusKm = CEMADEN_LIVE_RADIUS_KM,
): CemadenLivePayload {
  const root = Array.isArray(payload) ? payload[0] : payload
  if (!isRecord(root)) {
    throw new CemadenLiveError('O CEMADEN retornou um envelope inválido.')
  }

  const updatedAt = parseCemadenLiveTimestamp(root.atualizado)
  if (!updatedAt) {
    throw new CemadenLiveError(
      'O CEMADEN não informou um horário de atualização válido.',
    )
  }

  const rawStations = root.estacao
  if (!Array.isArray(rawStations)) {
    throw new CemadenLiveError('O CEMADEN não retornou a lista de estações.')
  }

  const effectiveRadius = Math.min(Math.max(radiusKm, 1), 100)

  const stations = rawStations
    .map((value): LiveRawStation | null => {
      if (!isRecord(value)) return null

      const code = readString(value.codestacao)
      const name = readString(value.nomeestacao)
      const state = readString(value.uf)?.toUpperCase() ?? null
      const latitude = readNumber(value.latitude)
      const longitude = readNumber(value.longitude)

      if (!code || !name || !state || !/^[A-Z]{2}$/.test(state)) return null
      if (latitude === null || longitude === null) return null
      if (!isValidCoordinate(latitude, longitude)) return null

      const rawAccumulated = readNumber(value.acumulado)
      const accumulatedMm =
        rawAccumulated !== null &&
        rawAccumulated >= 0 &&
        rawAccumulated <= CEMADEN_LIVE_MAX_MM
          ? rawAccumulated
          : null

      const sourceId = readInteger(value.idestacao)

      return {
        code,
        name,
        latitude,
        longitude,
        municipality: readString(value.cidade),
        state,
        accumulatedMm,
        sourceId: sourceId === null ? null : String(sourceId),
        // `codibge` é o código do município; `idestacao` é o id da estação
        // na rede. Confundir os dois excluiria Cajamar do filtro.
        ibgeCode: readInteger(value.codibge),
        sourceStatus: readInteger(value.status),
        stationType: readString(value.tipoestacao),
        network: readString(value.sigla) ?? readString(value.nomerede),
        distanceKm: haversineKm(
          env.municipality.latitude,
          env.municipality.longitude,
          latitude,
          longitude,
        ),
      }
    })
    .filter((station): station is LiveRawStation => station !== null)
    .filter(
      (station) =>
        station.state === 'SP' &&
        (station.ibgeCode === CAJAMAR_IBGE ||
          station.distanceKm <= effectiveRadius),
    )
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, CEMADEN_LIVE_MAX_STATIONS)

  if (stations.length === 0) {
    throw new CemadenLiveError(
      'O CEMADEN não retornou estações no raio de Cajamar.',
    )
  }

  return {
    updatedAt,
    stations,
    stationsReceived: rawStations.length,
  }
}

export function livePayloadToRainStations(
  payload: CemadenLivePayload,
): RainStation[] {
  return payload.stations.map((station) => ({
    key: `cemaden-live:${station.code}`,
    id: null,
    name: station.name,
    code: station.code,
    latitude: station.latitude,
    longitude: station.longitude,
    source: 'CEMADEN',
    sourceId: station.sourceId,
    municipality: station.municipality,
    state: station.state,
    stationType: station.stationType,
    network: station.network,
    sourceStatus: station.sourceStatus,
    lastCollectedAt: payload.updatedAt,
    lastReadingAt:
      station.accumulatedMm === null ? null : payload.updatedAt,
    accumulatedMm: station.accumulatedMm,
    measurementType: 'acumulado_24h',
    windowHours: 24,
    unit: 'mm',
    quality: 'oficial',
    distanceKm: null,
  }))
}

export function livePayloadToCollectionStatus(
  payload: CemadenLivePayload,
): RainCollectionStatus {
  const withReading = payload.stations.filter(
    (station) => station.accumulatedMm !== null,
  ).length

  return {
    source: 'CEMADEN',
    status: 'sucesso',
    lastAttemptAt: payload.updatedAt,
    lastCompletedAt: payload.updatedAt,
    lastSuccessAt: payload.updatedAt,
    payloadUpdatedAt: payload.updatedAt,
    stationsReceived: payload.stationsReceived,
    stationsNear: payload.stations.length,
    measurementsSaved: withReading,
    measurementsWithoutReading: payload.stations.length - withReading,
    durationMs: null,
    publicMessage:
      'Leitura direta do JSONP do CEMADEN, sem persistência no Supabase. O horário é o de atualização do conjunto informado pela fonte.',
  }
}

let inFlight: Promise<CemadenLivePayload> | null = null

/**
 * Carrega o JSONP do CEMADEN no navegador. O callback global tem o nome fixo
 * `estacoes` porque o endpoint não aceita um nome alternativo. O callback
 * anterior é restaurado ao final.
 */
export function loadCemadenLiveSnapshot(
  signal?: AbortSignal,
): Promise<CemadenLivePayload> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new CemadenLiveError('A leitura direta do CEMADEN exige um navegador.'),
    )
  }
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Consulta cancelada.', 'AbortError'))
  }
  if (inFlight) return inFlight

  inFlight = new Promise<CemadenLivePayload>((resolve, reject) => {
    const globalObject = window as unknown as Record<string, unknown>
    const previousCallback = globalObject[CEMADEN_LIVE_CALLBACK]
    const script = document.createElement('script')
    let settled = false
    let timeoutId = 0

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      script.onload = null
      script.onerror = null
      signal?.removeEventListener('abort', onAbort)
      script.remove()

      if (previousCallback === undefined) {
        delete globalObject[CEMADEN_LIVE_CALLBACK]
      } else {
        globalObject[CEMADEN_LIVE_CALLBACK] = previousCallback
      }
    }

    const finish = (
      callback: () => void,
    ) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const fail = (error: Error) => {
      finish(() => reject(error))
    }

    const onAbort = () => {
      fail(new DOMException('Consulta cancelada.', 'AbortError'))
    }

    globalObject[CEMADEN_LIVE_CALLBACK] = (data: unknown) => {
      try {
        const payload = parseCemadenLivePayload(data)
        finish(() => resolve(payload))
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new CemadenLiveError('Resposta inválida do CEMADEN.'),
        )
      }
    }

    script.async = true
    script.src = `${CEMADEN_LIVE_ENDPOINT}?ts=${Date.now()}`
    script.onerror = () => {
      fail(
        new CemadenLiveError(
          'Não foi possível carregar a leitura direta do CEMADEN. Verifique a conexão ou aguarde a sincronização no Supabase.',
        ),
      )
    }
    script.onload = () => {
      if (!settled) {
        fail(
          new CemadenLiveError(
            'O CEMADEN carregou a resposta, mas o callback esperado não foi chamado.',
          ),
        )
      }
    }

    timeoutId = window.setTimeout(() => {
      fail(
        new CemadenLiveError(
          'A leitura direta do CEMADEN demorou mais que o esperado. Tente novamente.',
        ),
      )
    }, CEMADEN_LIVE_TIMEOUT_MS)

    signal?.addEventListener('abort', onAbort, { once: true })
    document.head.appendChild(script)
  }).finally(() => {
    inFlight = null
  })

  return inFlight
}
