import { describe, expect, it } from 'vitest'
import { mergeRainStations, parseRainCatalog } from './rainSources'
import { formatRainValue, getRainReadingStatus } from './rain'

const ROW = { source: 'INMET', catalogueOnly: true, code: 'A001', name: 'Fixture', latitude: -23.35, longitude: -46.87, municipality: null }
const payload = (rows: unknown[]) => ({ schema: 1, stations: rows, sources: [{ source: 'INMET', status: 'catalogue', message: 'Fixture', url: 'https://malicious.invalid/' }] })

describe('Catálogos complementares', () => {
  it('preserva a identidade da rede e remove medições não autorizadas', () => {
    const { stations, sources } = parseRainCatalog(payload([{ ...ROW, accumulatedMm: 100, lastReadingAt: '2026-11-08', distanceKm: 0 }]))
    expect(stations[0].key).toBe('INMET:A001')
    expect(stations[0].accumulatedMm).toBeNull()
    expect(stations[0].lastReadingAt).toBeNull()
    expect(stations[0].distanceKm).toBeNull()
    expect(sources[0].url).not.toContain('malicious')
    expect(sources[1].status).toBe('unavailable')
  })
  it('ignora coordenadas inválidas, fontes desconhecidas e entrada sem contrato', () => {
    const rows = [{ ...ROW, latitude: true }, { ...ROW, latitude: Infinity }, { ...ROW, longitude: 181 }, { ...ROW, source: 'Outra' }, { ...ROW, catalogueOnly: false }]
    expect(parseRainCatalog(payload(rows)).stations).toEqual([])
    expect(() => parseRainCatalog({ error: 'html' })).toThrow()
  })
  it('deduplica por rede e código e dá prioridade à estação com dados do banco', () => {
    const station = parseRainCatalog(payload([ROW])).stations[0]
    const observed = { ...station, key: 'A001', catalogueOnly: false, accumulatedMm: 4 }
    expect(mergeRainStations([observed], [station])).toEqual([observed])
    expect(mergeRainStations([station], [observed])).toEqual([observed])
    expect(mergeRainStations([station], [{ ...station, source: 'SP Águas' }])).toHaveLength(2)
  })
  it('mantém coordenadas próximas de redes distintas sem afirmar duplicidade física', () => {
    const station = parseRainCatalog(payload([ROW])).stations[0]
    expect(mergeRainStations([station], [{ ...station, source: 'CEMADEN', code: 'A001' }])).toHaveLength(2)
  })
  it('nunca apresenta catálogo como chuva observada mesmo com valor indevido', () => {
    const station = { ...parseRainCatalog(payload([ROW])).stations[0], accumulatedMm: 99, lastReadingAt: new Date().toISOString() }
    expect(formatRainValue(station)).toBe('Sem leitura')
    expect(getRainReadingStatus(station).level).toBe('sem-leitura')
    expect(getRainReadingStatus(station).state).toBe('missing')
  })
})
