import type { RainStation } from '@/types/rain'
import type { RainSourceStatus, SupplementalSource } from '@/types/rainSources'

export const RAIN_SOURCE_URLS = Object.freeze({
  CEMADEN: 'https://mapainterativo.cemaden.gov.br/',
  INMET: 'https://portal.inmet.gov.br/servicos/mapa-de-esta%C3%A7%C3%B5es-meteorol%C3%B3gicas',
  'SP Águas': 'https://ph.spaguas.sp.gov.br/Pluviometricos',
  ANA: 'https://www.snirh.gov.br/hidroweb/',
})
const SOURCE_NAMES: SupplementalSource[] = ['INMET', 'SP Águas', 'ANA']
const record = (v: unknown): Record<string, unknown> | null => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
const text = (v: unknown): string => typeof v === 'string' ? v.trim().slice(0, 500) : ''

export function unavailableSources(): RainSourceStatus[] {
  return SOURCE_NAMES.map(source => ({ source, status: 'unavailable', count: 0,
    url: RAIN_SOURCE_URLS[source], message: 'Consulta complementar indisponível. A camada CEMADEN continua independente.' }))
}

export function parseRainCatalog(payload: unknown): { stations: RainStation[]; sources: RainSourceStatus[] } {
  const body = record(payload)
  if (body?.schema !== 1 || !Array.isArray(body.stations) || !Array.isArray(body.sources) || body.stations.length > 200) throw new Error('Resposta de catálogo inválida')
  const stations: RainStation[] = []
  for (const item of body.stations) {
    const row = record(item)
    if (!row || (row.source !== 'INMET' && row.source !== 'SP Águas') || row.catalogueOnly !== true) continue
    if (typeof row.latitude !== 'number' || !Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90 || typeof row.longitude !== 'number' || !Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180) continue
    const code = text(row.code), name = text(row.name)
    if (!code || !name) continue
    const source = row.source
    // Ignore any observation values in a catalogue response, even when present.
    stations.push({ key: `${source}:${code}`, code, name, source, sourceId: code,
      latitude: row.latitude, longitude: row.longitude, municipality: text(row.municipality) || null,
      state: 'SP', id: null, stationType: 'Pluviométrica', network: source,
      sourceStatus: null, lastCollectedAt: null, lastReadingAt: null, accumulatedMm: null,
      measurementType: null, windowHours: null, unit: 'mm', distanceKm: null,
      quality: text(row.quality) || 'catalogo_sem_medicao', catalogueOnly: true,
      sourceUrl: RAIN_SOURCE_URLS[source] })
  }
  const uniqueStations = mergeRainStations([], stations)
  const sources = unavailableSources()
  for (const item of body.sources) {
    const row = record(item)
    if (!row || !SOURCE_NAMES.includes(row.source as SupplementalSource)) continue
    if (row.status !== 'catalogue' && row.status !== 'authorization_required' && row.status !== 'unavailable') continue
    const source = row.source as SupplementalSource
    const index = sources.findIndex(item => item.source === source)
    sources[index] = { source, status: row.status, count: uniqueStations.filter(station => station.source === source).length,
      message: text(row.message), url: RAIN_SOURCE_URLS[source] }
  }
  return { stations: uniqueStations, sources }
}

function identity(station: RainStation): string {
  const source = station.source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return `${source}:${station.code.trim().toUpperCase()}`
}
/** Same code in different networks is not automatically the same gauge. */
export function mergeRainStations(base: RainStation[], catalogs: RainStation[]): RainStation[] {
  const byId = new Map<string, RainStation>()
  for (const station of [...base, ...catalogs]) {
    const key = identity(station)
    const previous = byId.get(key)
    if (!previous || (previous.catalogueOnly && !station.catalogueOnly)) byId.set(key, station)
  }
  return [...byId.values()]
}

export async function fetchRainCatalog(signal: AbortSignal) {
  const response = await fetch('/api/rain-sources', { signal: AbortSignal.any([signal, AbortSignal.timeout(11000)]), credentials: 'omit', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('Catálogo indisponível')
  return parseRainCatalog(await response.json())
}
