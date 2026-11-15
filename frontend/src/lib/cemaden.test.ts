import { afterEach, describe, expect, it } from 'vitest'
import {
  CemadenLiveError,
  livePayloadToCollectionStatus,
  livePayloadToRainStations,
  loadCemadenLiveSnapshot,
  parseCemadenLivePayload,
  parseCemadenLiveTimestamp,
} from '@/lib/cemaden'

function buildStation(overrides: Record<string, unknown> = {}) {
  return {
    codestacao: '350920504A',
    nomeestacao: 'Água Fria',
    uf: 'SP',
    latitude: -23.35,
    longitude: -46.87,
    acumulado: null,
    codibge: 3509205,
    idestacao: 7030,
    cidade: 'Cajamar',
    status: 1,
    tipoestacao: 'Pluviométrica',
    sigla: 'CEMADEN',
    nomerede: 'CEMADEN',
    ...overrides,
  }
}

function buildPayload(stations = [
  buildStation(),
  buildStation({
    codestacao: '350920502A',
    nomeestacao: 'São Benedito',
    idestacao: 7028,
    latitude: -23.4,
    longitude: -46.8,
    acumulado: 12.4,
  }),
]) {
  return {
    atualizado: '2026-11-06 10:10:47 UTC',
    estacao: stations,
  }
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).estacoes
})

describe('cemaden live fallback', () => {
  it('converte o horário UTC do conjunto', () => {
    expect(parseCemadenLiveTimestamp('2026-11-06 10:10:47 UTC')).toBe(
      '2026-11-06T10:10:47.000Z',
    )
    expect(parseCemadenLiveTimestamp('inválido')).toBeNull()
  })

  it('seleciona Cajamar e entorno e preserva acumulado nulo', () => {
    const payload = parseCemadenLivePayload(buildPayload())

    expect(payload.updatedAt).toBe('2026-11-06T10:10:47.000Z')
    expect(payload.stations).toHaveLength(2)
    expect(payload.stations[0]).toMatchObject({
      code: '350920504A',
      accumulatedMm: null,
    })
    expect(payload.stations[1]).toMatchObject({
      code: '350920502A',
      accumulatedMm: 12.4,
    })
  })

  it('usa o código IBGE do município, não o id da estação', () => {
    const payload = parseCemadenLivePayload(
      buildPayload([
        buildStation({
          codestacao: 'FORA',
          nomeestacao: 'Estação distante',
          latitude: -21.0,
          longitude: -46.0,
          codibge: 3509205,
          idestacao: 9999,
        }),
      ]),
    )

    expect(payload.stations.map((station) => station.code)).toEqual(['FORA'])
  })

  it('exclui outras UFs e estações fora do raio', () => {
    const payload = parseCemadenLivePayload(
      buildPayload([
        buildStation({ codestacao: 'MG', uf: 'MG' }),
        buildStation({
          codestacao: 'LONGE',
          latitude: -21.0,
          longitude: -46.0,
          codibge: 3550308,
        }),
        buildStation({ codestacao: 'OK', nomeestacao: 'Estação válida' }),
      ]),
    )

    expect(payload.stations.map((station) => station.code)).toEqual(['OK'])
  })

  it('falha quando nenhuma estação do recorte é encontrada', () => {
    expect(() =>
      parseCemadenLivePayload(
        buildPayload([
          buildStation({
            codestacao: 'LONGE',
            latitude: -21.0,
            longitude: -46.0,
            codibge: 3550308,
          }),
        ]),
      ),
    ).toThrow(CemadenLiveError)
  })

  it('converte a leitura em estação sem inventar valor ou horário', () => {
    const payload = parseCemadenLivePayload(buildPayload())
    const stations = livePayloadToRainStations(payload)

    expect(stations[0]).toMatchObject({
      key: 'cemaden-live:350920504A',
      accumulatedMm: null,
      lastReadingAt: null,
      distanceKm: null,
    })
    expect(stations[1].lastReadingAt).toBe('2026-11-06T10:10:47.000Z')
  })

  it('resume a coleta direta sem gravar no Supabase', () => {
    const payload = parseCemadenLivePayload(buildPayload())
    const collection = livePayloadToCollectionStatus(payload)

    expect(collection.status).toBe('sucesso')
    expect(collection.measurementsSaved).toBe(1)
    expect(collection.measurementsWithoutReading).toBe(1)
    expect(collection.publicMessage).toContain('sem persistência')
  })

  it('falha quando o envelope não tem atualização ou estação', () => {
    expect(() =>
      parseCemadenLivePayload({ atualizado: 'inválido', estacao: [] }),
    ).toThrow(CemadenLiveError)

    expect(() =>
      parseCemadenLivePayload({ atualizado: '2026-11-06 10:10:47 UTC' }),
    ).toThrow(CemadenLiveError)
  })

  it('carrega o JSONP pelo callback global e remove o script', async () => {
    const promise = loadCemadenLiveSnapshot()
    const script = document.head.querySelector(
      'script[src*="resources.cemaden.gov.br"]',
    )
    expect(script).not.toBeNull()

    const callback = (window as unknown as Record<string, unknown>)
      .estacoes as (data: unknown) => void
    expect(typeof callback).toBe('function')

    callback([buildPayload()])

    const payload = await promise
    expect(payload.stations).toHaveLength(2)
    expect(
      document.head.querySelector('script[src*="resources.cemaden.gov.br"]'),
    ).toBeNull()
    expect(
      (window as unknown as Record<string, unknown>).estacoes,
    ).toBeUndefined()
  })
})
