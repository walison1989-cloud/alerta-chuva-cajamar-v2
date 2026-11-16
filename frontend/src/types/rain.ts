export type RainLevel =
  | 'sem-leitura'
  | 'zero'
  | 'leve'
  | 'moderada'
  | 'forte'

export type RainReadingState = 'ok' | 'stale' | 'missing'

export type RainDataSourceMode = 'supabase' | 'cemaden-live' | 'none'

export type RainCollectionRunStatus =
  | 'sucesso'
  | 'parcial'
  | 'erro'
  | 'em_andamento'

/**
 * Estação pública já normalizada para a interface. As coordenadas são da
 * estação (dado público), nunca do imóvel do morador.
 */
export interface RainStation {
  /** Catalogue entry only: never interpret as an observation or active gauge. */
  catalogueOnly?: boolean
  sourceUrl?: string
  /** Chave estável para React e para correlacionar com a RPC de distância. */
  key: string
  /** id_estacao no Supabase; null no modo de leitura direta do CEMADEN. */
  id: number | null
  name: string
  code: string
  latitude: number
  longitude: number
  source: string
  sourceId: string | null
  municipality: string | null
  state: string | null
  stationType: string | null
  network: string | null
  sourceStatus: number | null
  /** Estação habilitada no Supabase; sem confirmação, não participa da triangulação. */
  active?: boolean
  /** Estação validada no Supabase; sem confirmação, não participa da triangulação. */
  validated?: boolean
  lastCollectedAt: string | null
  lastReadingAt: string | null
  /** Acumulado da janela informada. null significa indisponível. */
  accumulatedMm: number | null
  measurementType: string | null
  windowHours: number | null
  unit: string
  quality: string | null
  /** Distância PostGIS do imóvel do usuário, quando calculada. */
  distanceKm: number | null
}

export interface RainCollectionStatus {
  source: string
  status: RainCollectionRunStatus | null
  lastAttemptAt: string | null
  lastCompletedAt: string | null
  lastSuccessAt: string | null
  payloadUpdatedAt: string | null
  stationsReceived: number | null
  stationsNear: number | null
  measurementsSaved: number | null
  measurementsWithoutReading: number | null
  durationMs: number | null
  publicMessage: string | null
}

export interface PublicOccurrence {
  id: number
  type: string
  description: string | null
  neighborhood: string | null
  latitude: number
  longitude: number
  source: string
  verifiedAt: string | null
  createdAt: string | null
}

export interface RainSnapshot {
  stations: RainStation[]
  collection: RainCollectionStatus | null
  occurrences: PublicOccurrence[]
}
