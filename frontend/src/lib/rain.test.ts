import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  RainRepositoryError,
  classifyRain,
  fetchRainSnapshot,
  formatRainValue,
  getRainReadingStatus,
  mapCollectionRow,
  mapOccurrenceRow,
  mapStationRow,
  sortStations,
} from '@/lib/rain'
import type { RainStation } from '@/types/rain'

const NOW = Date.parse('2026-11-06T12:00:00.000Z')

function buildStation(overrides: Partial<RainStation> = {}): RainStation {
  return {
    key: '350920504A',
    id: 7030,
    name: 'Água Fria',
    code: '350920504A',
    latitude: -23.35,
    longitude: -46.87,
    source: 'CEMADEN',
    sourceId: '7030',
    municipality: 'Cajamar',
    state: 'SP',
    stationType: 'Pluviométrica',
    network: 'CEMADEN',
    sourceStatus: 1,
    lastCollectedAt: '2026-11-06T11:50:00.000Z',
    lastReadingAt: '2026-11-06T11:50:00.000Z',
    accumulatedMm: 4.2,
    measurementType: 'acumulado_24h',
    windowHours: 24,
    unit: 'mm',
    quality: 'oficial',
    distanceKm: null,
    ...overrides,
  }
}

function createClient(tableData: {
  stations?: { data: unknown; error: unknown }
  collection?: { data: unknown; error: unknown }
  occurrences?: { data: unknown; error: unknown }
}): SupabaseClient {
  return {
    from(table: string) {
      const result =
        table === 'vw_estacoes_publicas'
          ? (tableData.stations ?? { data: [], error: null })
          : table === 'vw_coletas_publicas'
            ? (tableData.collection ?? { data: [], error: null })
            : (tableData.occurrences ?? { data: [], error: null })

      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(result),
        abortSignal: () => builder,
      }
      return builder
    },
  } as unknown as SupabaseClient
}

describe('rain lib', () => {
  it('normaliza uma linha pública válida e preserva a proveniência', () => {
    const station = mapStationRow({
      id_estacao: 7030,
      nome_estacao: 'Água Fria',
      codigo_estacao: '350920504A',
      latitude: -23.35,
      longitude: -46.87,
      fonte: 'CEMADEN',
      fonte_id: '7030',
      municipio: 'Cajamar',
      uf: 'SP',
      ultima_coleta_em: '2026-11-06T11:50:00.000Z',
      ultima_leitura_em: '2026-11-06T11:50:00.000Z',
      chuva_acumulada_mm: 4.2,
      tipo_medicao: 'acumulado_24h',
      janela_horas: 24,
      unidade: 'mm',
      qualidade_dado: 'oficial',
      tem_leitura: true,
      distancia_km: 3.14,
    })

    expect(station).toMatchObject({
      key: '350920504A',
      id: 7030,
      name: 'Água Fria',
      source: 'CEMADEN',
      accumulatedMm: 4.2,
      windowHours: 24,
      distanceKm: 3.14,
    })
  })

  it('não transforma ausência de leitura em 0 mm', () => {
    const station = mapStationRow({
      id_estacao: 7027,
      nome_estacao: 'Ponunduva',
      codigo_estacao: '350920501A',
      latitude: -23.4,
      longitude: -46.8,
      fonte: 'CEMADEN',
      chuva_acumulada_mm: null,
      tem_leitura: false,
      ultima_leitura_em: null,
    })

    expect(station?.accumulatedMm).toBeNull()
    expect(station?.lastReadingAt).toBeNull()
    expect(station && formatRainValue(station)).toBe('Sem leitura')
  })

  it('rejeita linha sem fonte ou com coordenada inválida', () => {
    expect(
      mapStationRow({
        nome_estacao: 'Teste',
        codigo_estacao: 'X',
        latitude: -23,
        longitude: -46,
      }),
    ).toBeNull()
    expect(
      mapStationRow({
        nome_estacao: 'Teste',
        codigo_estacao: 'X',
        fonte: 'CEMADEN',
        latitude: 999,
        longitude: -46,
      }),
    ).toBeNull()
  })

  it('classifica apenas o volume visual, nunca risco', () => {
    expect(classifyRain(null)).toBe('sem-leitura')
    expect(classifyRain(0)).toBe('zero')
    expect(classifyRain(0.1)).toBe('leve')
    expect(classifyRain(10)).toBe('leve')
    expect(classifyRain(10.1)).toBe('moderada')
    expect(classifyRain(30)).toBe('moderada')
    expect(classifyRain(30.1)).toBe('forte')
  })

  it('marca leitura ausente como indisponível, sem sugerir ausência de chuva', () => {
    const status = getRainReadingStatus(
      buildStation({ accumulatedMm: null, lastReadingAt: null }),
      NOW,
    )

    expect(status.state).toBe('missing')
    expect(status.label).toBe('Dados indisponíveis ou desatualizados')
    expect(status.detail).toContain('não significa ausência de chuva')
  })

  it('marca leitura antiga como desatualizada pelo limite de 6 h', () => {
    const status = getRainReadingStatus(
      buildStation({ lastReadingAt: '2026-11-06T04:00:00.000Z' }),
      NOW,
    )

    expect(status.state).toBe('stale')
    expect(status.detail).toContain('não é um limite de risco')
  })

  it('considera leitura recente como disponível', () => {
    const status = getRainReadingStatus(
      buildStation({ lastReadingAt: '2026-11-06T11:50:00.000Z' }),
      NOW,
    )

    expect(status.state).toBe('ok')
  })

  it('normaliza status de coleta e rejeita status desconhecido', () => {
    const collection = mapCollectionRow({
      fonte: 'CEMADEN',
      status_ultima_tentativa: 'parcial',
      ultima_tentativa_em: '2026-11-06T11:55:00.000Z',
      ultimo_sucesso_em: '2026-11-06T11:55:00.000Z',
      estacoes_recebidas: 5938,
      estacoes_no_raio: 3,
      medicoes_gravadas: 2,
      medicoes_sem_leitura: 1,
      duracao_ms: 1200,
    })

    expect(collection?.status).toBe('parcial')
    expect(collection?.measurementsWithoutReading).toBe(1)

    expect(
      mapCollectionRow({ fonte: 'CEMADEN', status_ultima_tentativa: 'invalido' })
        ?.status,
    ).toBeNull()
  })

  it('mantém ocorrência apenas quando há ponto e fonte', () => {
    expect(
      mapOccurrenceRow({
        id: 1,
        tipo: 'alagamento',
        fonte: 'registro_comunitario',
        latitude: -23.35,
        longitude: -46.87,
      }),
    ).toMatchObject({ id: 1, type: 'alagamento' })

    expect(
      mapOccurrenceRow({
        id: 2,
        tipo: 'alagamento',
        latitude: -23.35,
        longitude: -46.87,
      }),
    ).toBeNull()
  })

  it('ordena por distância e coloca as sem distância no fim', () => {
    const sorted = sortStations([
      buildStation({ key: 'C', name: 'C', distanceKm: null }),
      buildStation({ key: 'A', name: 'A', distanceKm: 8.2 }),
      buildStation({ key: 'B', name: 'B', distanceKm: 1.4 }),
    ])

    expect(sorted.map((station) => station.key)).toEqual(['B', 'A', 'C'])
  })

  it('consulta a view pública e devolve estações normalizadas', async () => {
    const client = createClient({
      stations: {
        data: [
          {
            id_estacao: 7030,
            nome_estacao: 'Água Fria',
            codigo_estacao: '350920504A',
            latitude: -23.35,
            longitude: -46.87,
            fonte: 'CEMADEN',
            chuva_acumulada_mm: 2,
            tem_leitura: true,
            ultima_leitura_em: '2026-11-06T11:50:00.000Z',
          },
        ],
        error: null,
      },
      collection: {
        data: [{ fonte: 'CEMADEN', status_ultima_tentativa: 'sucesso' }],
        error: null,
      },
      occurrences: { data: [], error: null },
    })

    const snapshot = await fetchRainSnapshot(client)

    expect(snapshot.stations).toHaveLength(1)
    expect(snapshot.stations[0].name).toBe('Água Fria')
    expect(snapshot.collection?.status).toBe('sucesso')
  })

  it('propaga falha da consulta pública com mensagem acionável', async () => {
    const client = createClient({
      stations: { data: null, error: { message: 'relation does not exist' } },
    })

    await expect(fetchRainSnapshot(client)).rejects.toBeInstanceOf(
      RainRepositoryError,
    )
    await expect(fetchRainSnapshot(client)).rejects.toThrow(
      'migration da Etapa 3',
    )
  })
})
