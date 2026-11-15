// =====================================================================
// Parser compartilhado do CEMADEN
//
// Fonte: https://resources.cemaden.gov.br/dados/311_24.json
// Formato: JSONP `estacoes([{ atualizado, estacao: [...] }])`.
//
// Semântica adotada:
// - `acumulado` é o acumulado de 24 h informado pela fonte. Nunca é
//   tratado como chuva do intervalo entre duas coletas.
// - `atualizado` é o horário de geração do conjunto, não um horário
//   individual por estação. A interface deve deixar isso explícito.
// - `acumulado` nulo significa indisponibilidade, não 0 mm.
// =====================================================================

export const CEMADEN_SOURCE = 'CEMADEN'
export const CEMADEN_PLUVIOMETRIC_ENDPOINT =
  'https://resources.cemaden.gov.br/dados/311_24.json'
export const CEMADEN_WINDOW_HOURS = 24
export const CEMADEN_MAX_DAILY_MM = 500
export const CEMADEN_MAX_STATIONS = 300
export const CAJAMAR_IBGE = 3509205
export const CAJAMAR_CENTER = Object.freeze({
  latitude: -23.3561111,
  longitude: -46.8769444,
})
export const DEFAULT_RADIUS_KM = 30

export class CemadenParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CemadenParseError'
  }
}

export interface CemadenRawStation {
  acumulado: number | null
  cidade: string | null
  codestacao: string
  codibge: number | null
  idestacao: number | null
  idmunicipio: number | null
  idrede: number | null
  idtipoestacao: number | null
  latitude: number
  longitude: number
  nomeestacao: string
  nomerede: string | null
  sigla: string | null
  status: number | null
  tipoestacao: string | null
  uf: string
}

export interface CemadenPayload {
  updatedAt: string
  stations: CemadenRawStation[]
}

export interface SelectedCemadenStation extends CemadenRawStation {
  distanceKm: number
}

export interface EstacaoUpsertRow {
  codigo_estacao: string
  nome_estacao: string
  latitude: number
  longitude: number
  fonte: string
  fonte_id: string | null
  municipio: string | null
  uf: string
  tipo_estacao: string | null
  rede: string | null
  status_fonte: number | null
  ultima_coleta_em: string
  validada: boolean
  ativa: boolean
  metadados: Record<string, unknown>
}

export interface MedicaoUpsertRow {
  id_estacao: number
  data_hora: string
  precipitacao_mm: number
  fonte_dado: string
  tipo_medicao: 'acumulado_24h'
  janela_horas: number
  unidade: 'mm'
  qualidade_dado: 'oficial'
  coletado_em: string
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
  const number = readNumber(value)
  return number === null ? null : Math.trunc(number)
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  )
}

export function parseCemadenTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // A fonte envia "2026-11-06 10:10:47 UTC".
  const normalized = /UTC$/i.test(trimmed)
    ? `${trimmed.replace(/\s*UTC$/i, '')}Z`
    : trimmed
  const parsed = new Date(normalized.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function normalizeStation(value: unknown): CemadenRawStation | null {
  if (!isRecord(value)) return null

  const codestacao = readString(value.codestacao)
  const nomeestacao = readString(value.nomeestacao)
  const uf = readString(value.uf)?.toUpperCase() ?? null
  const latitude = readNumber(value.latitude)
  const longitude = readNumber(value.longitude)

  if (!codestacao || codestacao.length > 50) return null
  if (!nomeestacao || nomeestacao.length > 150) return null
  if (!uf || !/^[A-Z]{2}$/.test(uf)) return null
  if (latitude === null || longitude === null) return null
  if (!isValidCoordinate(latitude, longitude)) return null

  const accumulated = readNumber(value.acumulado)
  const acumulado =
    accumulated !== null && accumulated >= 0 && accumulated <= CEMADEN_MAX_DAILY_MM
      ? accumulated
      : null

  return {
    acumulado,
    cidade: readString(value.cidade),
    codestacao,
    codibge: readInteger(value.codibge),
    idestacao: readInteger(value.idestacao),
    idmunicipio: readInteger(value.idmunicipio),
    idrede: readInteger(value.idrede),
    idtipoestacao: readInteger(value.idtipoestacao),
    latitude,
    longitude,
    nomeestacao,
    nomerede: readString(value.nomerede),
    sigla: readString(value.sigla),
    status: readInteger(value.status),
    tipoestacao: readString(value.tipoestacao),
    uf,
  }
}

/**
 * Extrai o objeto do JSONP. Aceita também JSON puro, útil em testes e caso a
 * fonte mude o envelope sem aviso.
 */
export function parseCemadenJsonp(text: string): CemadenPayload {
  const raw = text.trim()
  if (!raw) throw new CemadenParseError('Resposta vazia do CEMADEN.')

  const start = raw.indexOf('(')
  const end = raw.lastIndexOf(')')
  const jsonText =
    start >= 0 && end > start ? raw.slice(start + 1, end).trim() : raw

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new CemadenParseError('A resposta do CEMADEN não é um JSONP válido.')
  }

  const root = Array.isArray(parsed) ? parsed[0] : parsed
  if (!isRecord(root)) {
    throw new CemadenParseError('O envelope do CEMADEN não contém um objeto.')
  }

  const updatedAt = parseCemadenTimestamp(root.atualizado)
  if (!updatedAt) {
    throw new CemadenParseError(
      'O CEMADEN não informou um horário de atualização válido.',
    )
  }

  const rawStations = root.estacao
  if (!Array.isArray(rawStations)) {
    throw new CemadenParseError('O CEMADEN não retornou a lista de estações.')
  }

  const stations = rawStations
    .map(normalizeStation)
    .filter((station): station is CemadenRawStation => station !== null)

  return { updatedAt, stations }
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

/**
 * Seleciona estações de Cajamar e do entorno. O critério é explícito:
 * UF=SP e (código IBGE de Cajamar ou distância <= raio). Nada é sintetizado.
 */
export function selectStationsNear(
  stations: CemadenRawStation[],
  radiusKm = DEFAULT_RADIUS_KM,
  center = CAJAMAR_CENTER,
): SelectedCemadenStation[] {
  const effectiveRadius = Math.min(Math.max(radiusKm, 1), 100)

  return stations
    .filter((station) => station.uf === 'SP')
    .map((station) => ({
      ...station,
      distanceKm: haversineKm(
        center.latitude,
        center.longitude,
        station.latitude,
        station.longitude,
      ),
    }))
    .filter(
      (station) =>
        station.codibge === CAJAMAR_IBGE ||
        station.distanceKm <= effectiveRadius,
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, CEMADEN_MAX_STATIONS)
}

export function toEstacaoRow(
  station: CemadenRawStation,
  updatedAt: string,
): EstacaoUpsertRow {
  return {
    codigo_estacao: station.codestacao,
    nome_estacao: station.nomeestacao,
    latitude: station.latitude,
    longitude: station.longitude,
    fonte: CEMADEN_SOURCE,
    fonte_id: station.idestacao === null ? null : String(station.idestacao),
    municipio: station.cidade,
    uf: station.uf,
    tipo_estacao: station.tipoestacao,
    rede: station.sigla ?? station.nomerede,
    status_fonte: station.status,
    ultima_coleta_em: updatedAt,
    validada: true,
    ativa: true,
    metadados: {
      codibge: station.codibge,
      idestacao: station.idestacao,
      idmunicipio: station.idmunicipio,
      idrede: station.idrede,
      idtipoestacao: station.idtipoestacao,
      nomerede: station.nomerede,
      sigla: station.sigla,
      tipoestacao: station.tipoestacao,
      horario_origem: 'atualizado_conjunto',
      janela_acumulado_horas: CEMADEN_WINDOW_HOURS,
    },
  }
}

/**
 * Retorna null quando a estação não tem medição válida. Nunca transforma
 * ausência de leitura em 0 mm.
 */
export function toMedicaoRow(
  station: CemadenRawStation,
  idEstacao: number,
  updatedAt: string,
  collectedAt: string,
): MedicaoUpsertRow | null {
  if (station.acumulado === null) return null
  if (!Number.isFinite(station.acumulado) || station.acumulado < 0) return null
  if (station.acumulado > CEMADEN_MAX_DAILY_MM) return null

  return {
    id_estacao: idEstacao,
    data_hora: updatedAt,
    precipitacao_mm: Math.round(station.acumulado * 100) / 100,
    fonte_dado: CEMADEN_SOURCE,
    tipo_medicao: 'acumulado_24h',
    janela_horas: CEMADEN_WINDOW_HOURS,
    unidade: 'mm',
    qualidade_dado: 'oficial',
    coletado_em: collectedAt,
  }
}
