import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidCoordinate } from '@/lib/addressValidation'
import { formatMm, formatRelativeTime } from '@/lib/format'
import type {
  PublicOccurrence,
  RainCollectionRunStatus,
  RainCollectionStatus,
  RainLevel,
  RainReadingState,
  RainSnapshot,
  RainStation,
} from '@/types/rain'

/** Limite de atualidade exibido na interface. Não é limite de risco. */
export const RAIN_STALE_AFTER_MS = 6 * 60 * 60 * 1000
export const RAIN_NEARBY_RADIUS_KM = 30
export const RAIN_NEARBY_LIMIT = 20

const COLLECTION_STATUSES: RainCollectionRunStatus[] = [
  'sucesso',
  'parcial',
  'erro',
  'em_andamento',
]

export class RainRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RainRepositoryError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readText(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readInteger(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = readNumber(source, key)
  return value === null ? null : Math.trunc(value)
}

function readTimestamp(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = readText(source, key)
  if (!value) return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

/**
 * Normaliza uma linha da view/RPC pública. Rejeita coordenadas inválidas e
 * registros sem proveniência para não exibir dado legado de teste como
 * estação oficial.
 */
export function mapStationRow(row: unknown): RainStation | null {
  const source = asRecord(row)
  if (!source) return null

  const code = readText(source, 'codigo_estacao')
  const name = readText(source, 'nome_estacao')
  const provenance = readText(source, 'fonte')
  const latitude = readNumber(source, 'latitude')
  const longitude = readNumber(source, 'longitude')

  if (!code || !name || !provenance) return null
  if (latitude === null || longitude === null) return null
  if (!isValidCoordinate(latitude, longitude)) return null

  const accumulated = readNumber(source, 'chuva_acumulada_mm')
  const hasReadingFlag = source.tem_leitura
  const hasReading =
    typeof hasReadingFlag === 'boolean'
      ? hasReadingFlag
      : accumulated !== null && accumulated >= 0
  const accumulatedMm =
    hasReading && accumulated !== null && accumulated >= 0
      ? accumulated
      : null

  return {
    key: code,
    id: readInteger(source, 'id_estacao'),
    name,
    code,
    latitude,
    longitude,
    source: provenance,
    sourceId: readText(source, 'fonte_id'),
    municipality: readText(source, 'municipio'),
    state: readText(source, 'uf'),
    stationType: readText(source, 'tipo_estacao'),
    network: readText(source, 'rede'),
    sourceStatus: readInteger(source, 'status_fonte'),
    lastCollectedAt: readTimestamp(source, 'ultima_coleta_em'),
    lastReadingAt:
      accumulatedMm === null
        ? null
        : readTimestamp(source, 'ultima_leitura_em'),
    accumulatedMm,
    measurementType: readText(source, 'tipo_medicao'),
    windowHours: readInteger(source, 'janela_horas'),
    unit: readText(source, 'unidade') ?? 'mm',
    quality: readText(source, 'qualidade_dado'),
    distanceKm: readNumber(source, 'distancia_km'),
  }
}

export function mapCollectionRow(row: unknown): RainCollectionStatus | null {
  const source = asRecord(row)
  if (!source) return null

  const sourceName = readText(source, 'fonte')
  if (!sourceName) return null

  const rawStatus = readText(source, 'status_ultima_tentativa')
  const status =
    rawStatus && COLLECTION_STATUSES.includes(rawStatus as RainCollectionRunStatus)
      ? (rawStatus as RainCollectionRunStatus)
      : null

  return {
    source: sourceName,
    status,
    lastAttemptAt: readTimestamp(source, 'ultima_tentativa_em'),
    lastCompletedAt: readTimestamp(source, 'ultima_conclusao_em'),
    lastSuccessAt: readTimestamp(source, 'ultimo_sucesso_em'),
    payloadUpdatedAt: readTimestamp(source, 'payload_atualizado_em'),
    stationsReceived: readInteger(source, 'estacoes_recebidas'),
    stationsNear: readInteger(source, 'estacoes_no_raio'),
    measurementsSaved: readInteger(source, 'medicoes_gravadas'),
    measurementsWithoutReading: readInteger(
      source,
      'medicoes_sem_leitura',
    ),
    durationMs: readInteger(source, 'duracao_ms'),
    publicMessage: readText(source, 'mensagem_publica'),
  }
}

export function mapOccurrenceRow(row: unknown): PublicOccurrence | null {
  const source = asRecord(row)
  if (!source) return null

  const id = readInteger(source, 'id')
  const type = readText(source, 'tipo')
  const provenance = readText(source, 'fonte')
  const latitude = readNumber(source, 'latitude')
  const longitude = readNumber(source, 'longitude')

  if (id === null || !type || !provenance) return null
  if (latitude === null || longitude === null) return null
  if (!isValidCoordinate(latitude, longitude)) return null

  return {
    id,
    type,
    description: readText(source, 'descricao'),
    neighborhood: readText(source, 'bairro'),
    latitude,
    longitude,
    source: provenance,
    verifiedAt: readTimestamp(source, 'verificado_em'),
    createdAt: readTimestamp(source, 'criado_em'),
  }
}

async function readCollection(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<RainCollectionStatus | null> {
  try {
    const builder = client
      .from('vw_coletas_publicas')
      .select('*')
      .limit(5)
    if (signal) builder.abortSignal(signal)
    const { data, error } = await builder
    if (error) return null
    const rows = (data ?? []) as unknown[]
    return rows.map(mapCollectionRow).find((item) => item !== null) ?? null
  } catch {
    return null
  }
}

async function readOccurrences(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<PublicOccurrence[]> {
  try {
    const builder = client
      .from('vw_ocorrencias_publicas')
      .select('*')
      .order('verificado_em', { ascending: false })
      .limit(200)
    if (signal) builder.abortSignal(signal)
    const { data, error } = await builder
    if (error) return []
    return ((data ?? []) as unknown[])
      .map(mapOccurrenceRow)
      .filter((item): item is PublicOccurrence => item !== null)
  } catch {
    return []
  }
}

/**
 * Consulta a camada pública. A ausência de sincronização devolve lista vazia;
 * o hook decide se tenta a leitura direta do CEMADEN. Nenhum dado é inventado.
 */
export async function fetchRainSnapshot(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<RainSnapshot> {
  const stationBuilder = client
    .from('vw_estacoes_publicas')
    .select('*')
    .order('nome_estacao', { ascending: true })
    .limit(500)
  if (signal) stationBuilder.abortSignal(signal)

  const [{ data, error }, collection, occurrences] = await Promise.all([
    stationBuilder,
    readCollection(client, signal),
    readOccurrences(client, signal),
  ])

  if (error) {
    throw new RainRepositoryError(
      'Não foi possível carregar a camada sincronizada do Supabase. Verifique a conexão e se a migration da Etapa 3 foi aplicada.',
    )
  }

  const stations = ((data ?? []) as unknown[])
    .map(mapStationRow)
    .filter((item): item is RainStation => item !== null)

  return { stations, collection, occurrences }
}

/** Leitura leve, sem status de coleta/ocorrências, usada pelo motor experimental. */
export async function fetchPublicRainStations(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<RainStation[]> {
  const builder = client
    .from('vw_estacoes_publicas')
    .select('*')
    .order('nome_estacao', { ascending: true })
    .limit(500)
  if (signal) builder.abortSignal(signal)
  const { data, error } = await builder
  if (error) {
    throw new RainRepositoryError(
      'Não foi possível carregar as estações públicas para a análise experimental.',
    )
  }
  return ((data ?? []) as unknown[])
    .map(mapStationRow)
    .filter((item): item is RainStation => item !== null)
}

/**
 * Distâncias são calculadas no PostGIS, ancoradas em auth.uid(). O cliente
 * nunca envia as coordenadas do imóvel para esta função.
 */
export async function fetchNearbyStations(
  client: SupabaseClient,
  radiusKm = RAIN_NEARBY_RADIUS_KM,
  limit = RAIN_NEARBY_LIMIT,
  signal?: AbortSignal,
): Promise<RainStation[]> {
  const builder = client.rpc('estacoes_proximas_do_morador', {
    p_raio_km: radiusKm,
    p_limite: limit,
  })
  if (signal) builder.abortSignal(signal)

  const { data, error } = await builder
  if (error) {
    throw new RainRepositoryError(
      'Não foi possível calcular as estações próximas com PostGIS. Confirme se a migration da Etapa 3 foi aplicada e se há endereço cadastrado.',
    )
  }

  return ((data ?? []) as unknown[])
    .map(mapStationRow)
    .filter((item): item is RainStation => item !== null)
    .sort((left, right) => {
      const a = left.distanceKm
      const b = right.distanceKm
      if (a === null && b === null) return left.name.localeCompare(right.name, 'pt-BR')
      if (a === null) return 1
      if (b === null) return -1
      return a - b
    })
}

export const RAIN_LEVEL_META: Record<
  RainLevel,
  { label: string; range: string; description: string }
> = {
  'sem-leitura': {
    label: 'Sem leitura',
    range: 'Sem medição válida',
    description:
      'A fonte não informou valor para esta estação. Não interpretar como 0 mm.',
  },
  zero: {
    label: '0 mm',
    range: '0 mm em 24 h',
    description: 'A fonte informou acumulado igual a zero.',
  },
  leve: {
    label: 'Leve',
    range: '0,1 a 10 mm em 24 h',
    description: 'Faixa apenas visual do acumulado.',
  },
  moderada: {
    label: 'Moderada',
    range: '10,1 a 30 mm em 24 h',
    description: 'Faixa apenas visual do acumulado.',
  },
  forte: {
    label: 'Alta',
    range: 'Acima de 30 mm em 24 h',
    description:
      'Faixa apenas visual do acumulado. Não é classificação de risco.',
  },
}

export function classifyRain(accumulatedMm: number | null): RainLevel {
  if (accumulatedMm === null || !Number.isFinite(accumulatedMm)) {
    return 'sem-leitura'
  }
  if (accumulatedMm <= 0) return 'zero'
  if (accumulatedMm <= 10) return 'leve'
  if (accumulatedMm <= 30) return 'moderada'
  return 'forte'
}

export interface RainReadingStatus {
  state: RainReadingState
  label: string
  detail: string
  level: RainLevel
}

export function getRainReadingStatus(
  station: RainStation,
  now = Date.now(),
): RainReadingStatus {
  const level = classifyRain(station.catalogueOnly ? null : station.accumulatedMm)

  if (station.catalogueOnly) {
    return { state: 'missing', level, label: 'Somente catálogo',
      detail: 'Localização de catálogo. Sem medição de chuva integrada e sem confirmação de operação atual.' }
  }

  if (station.accumulatedMm === null || !station.lastReadingAt) {
    return {
      state: 'missing',
      label: 'Dados indisponíveis ou desatualizados',
      detail:
        'A fonte não informou uma medição válida para esta estação. Ausência de medição não significa ausência de chuva nem de risco.',
      level,
    }
  }

  const timestamp = Date.parse(station.lastReadingAt)
  if (Number.isNaN(timestamp)) {
    return {
      state: 'missing',
      label: 'Dados indisponíveis ou desatualizados',
      detail:
        'O horário da leitura não pôde ser interpretado. Ausência de medição não significa ausência de chuva nem de risco.',
      level,
    }
  }

  const age = Math.max(0, now - timestamp)
  const relative = formatRelativeTime(timestamp, now)

  if (age > RAIN_STALE_AFTER_MS) {
    return {
      state: 'stale',
      label: 'Dados indisponíveis ou desatualizados',
      detail: `Última leitura ${relative}. O limite de atualidade exibido é de 6 horas; ele não é um limite de risco.`,
      level,
    }
  }

  return {
    state: 'ok',
    label: 'Leitura disponível',
    detail: `Atualizada ${relative}.`,
    level,
  }
}

export function formatRainValue(station: RainStation): string {
  return station.catalogueOnly || station.accumulatedMm === null
    ? 'Sem leitura'
    : formatMm(station.accumulatedMm)
}

export function formatDistanceKm(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: value < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value)} km`
}

export function sortStations(stations: RainStation[]): RainStation[] {
  return [...stations].sort((left, right) => {
    const a = left.distanceKm
    const b = right.distanceKm
    if (a !== null && b !== null) return a - b
    if (a !== null) return -1
    if (b !== null) return 1
    return left.name.localeCompare(right.name, 'pt-BR')
  })
}
