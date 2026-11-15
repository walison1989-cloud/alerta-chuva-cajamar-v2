import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  SUSCETIBILIDADE_META,
  SUSCETIBILIDADE_NOTA,
  SuscetibilidadeRepositoryError,
  fetchSuscetibilidadeDoMorador,
  fetchSuscetibilidadePublica,
  formatAreaSuscetibilidade,
  formatDistanciaSuscetibilidade,
  mapAreaProximaRow,
  mapCartografiaRow,
  mapSuscetibilidadeFeatureRow,
} from '@/lib/suscetibilidade'

const GEOJSON = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [-46.88, -23.37],
        [-46.86, -23.37],
        [-46.86, -23.35],
        [-46.88, -23.35],
        [-46.88, -23.37],
      ],
    ],
  ],
}

const FEATURE_ROW = {
  id: 11,
  cartografia_slug: 'sgb-ipt-cajamar-2017-suscetibilidade',
  tipo: 'inundacao',
  classe: 'Alta',
  classe_ordem: 3,
  processo: 'Inundação, alagamento e assoreamento',
  area_ha: 1.25,
  geojson: GEOJSON,
}

const CARTOGRAFIA_ROW = {
  id: 1,
  slug: 'sgb-ipt-cajamar-2017-suscetibilidade',
  titulo: 'Carta de suscetibilidade de Cajamar',
  fonte: 'SGB/CPRM e IPT',
  editor: 'CPRM; IPT',
  municipio: 'Cajamar',
  uf: 'SP',
  escala: '1:25.000',
  ano_publicacao: 2017,
  mes_publicacao: 6,
  url_item:
    'https://rigeo.sgb.gov.br/items/ffa6864e-5fbd-4e3e-a1bd-28d22fe50cf4',
  url_download: null,
  licenca: 'Acesso aberto',
  srid_origem: 31983,
  srid_destino: 4326,
  importado_em: '2026-11-07T09:00:00.000Z',
  total_inundacao: 305,
  total_enxurrada: 2,
  area_ha_inundacao: 1764,
  area_ha_enxurrada: 77.28,
  metadados: {},
}

function createClient(options: {
  features?: { data: unknown; error: unknown }
  cartografia?: { data: unknown; error: unknown }
  rpc?: { data: unknown; error: unknown }
}) {
  const client = {
    from(table: string) {
      const result =
        table === 'vw_areas_suscetibilidade_publicas'
          ? (options.features ?? { data: [], error: null })
          : (options.cartografia ?? { data: [], error: null })
      const builder = {
        select: () => builder,
        limit: () => Promise.resolve(result),
        abortSignal: () => builder,
      }
      return builder
    },
    rpc: vi.fn((_name: string, _params: Record<string, unknown>) => {
      const promise = Promise.resolve(
        options.rpc ?? { data: [], error: null },
      )
      return Object.assign(promise, { abortSignal: () => promise })
    }),
  }
  return client as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> }
}

describe('suscetibilidade lib', () => {
  it('normaliza feição pública com geometria MultiPolygon e proveniência', () => {
    expect(mapSuscetibilidadeFeatureRow(FEATURE_ROW)).toMatchObject({
      id: 11,
      tipo: 'inundacao',
      classe: 'Alta',
      classeOrdem: 3,
      areaHa: 1.25,
      cartografiaSlug: 'sgb-ipt-cajamar-2017-suscetibilidade',
    })
  })

  it('descarta feições sem classe, com área não positiva ou geometria inválida', () => {
    expect(
      mapSuscetibilidadeFeatureRow({ ...FEATURE_ROW, classe: 'Desconhecida' }),
    ).toBeNull()
    expect(
      mapSuscetibilidadeFeatureRow({ ...FEATURE_ROW, area_ha: 0 }),
    ).toBeNull()
    expect(
      mapSuscetibilidadeFeatureRow({ ...FEATURE_ROW, geojson: { type: 'Polygon' } }),
    ).toBeNull()
    expect(mapSuscetibilidadeFeatureRow({ ...FEATURE_ROW, tipo: 'massa' })).toBeNull()
  })

  it('normaliza metadados e área oficial da cartografia', () => {
    expect(mapCartografiaRow(CARTOGRAFIA_ROW)).toMatchObject({
      slug: 'sgb-ipt-cajamar-2017-suscetibilidade',
      escala: '1:25.000',
      sridOrigem: 31983,
      totalInundacao: 305,
      totalEnxurrada: 2,
    })
  })

  it('normaliza a área próxima sem devolver coordenadas pessoais', () => {
    const area = mapAreaProximaRow({
      id: 11,
      cartografia_slug: 'sgb-ipt-cajamar-2017-suscetibilidade',
      tipo: 'inundacao',
      classe: 'Alta',
      classe_ordem: 3,
      processo: 'Inundação, alagamento e assoreamento',
      area_ha: 1.25,
      contem_ponto: true,
      distancia_m: 0,
    })

    expect(area).toMatchObject({
      id: 11,
      contemPonto: true,
      distanciaM: 0,
    })
    expect(area).not.toHaveProperty('latitude')
    expect(area).not.toHaveProperty('localizacao')
  })

  it('consulta a view pública, ordena por classe e traz os metadados', async () => {
    const client = createClient({
      features: {
        data: [
          { ...FEATURE_ROW, id: 12, classe: 'Baixa', classe_ordem: 1 },
          FEATURE_ROW,
        ],
        error: null,
      },
      cartografia: { data: [CARTOGRAFIA_ROW], error: null },
    })

    const snapshot = await fetchSuscetibilidadePublica(client)

    expect(snapshot.features.map((feature) => feature.classe)).toEqual([
      'Alta',
      'Baixa',
    ])
    expect(snapshot.cartografia?.escala).toBe('1:25.000')
  })

  it('propaga erro acionável quando a camada ainda não foi publicada', async () => {
    const client = createClient({
      features: { data: null, error: { message: 'relation does not exist' } },
    })

    await expect(fetchSuscetibilidadePublica(client)).rejects.toBeInstanceOf(
      SuscetibilidadeRepositoryError,
    )
    await expect(fetchSuscetibilidadePublica(client)).rejects.toThrow(
      'Etapa 5',
    )
  })

  it('consulta a RPC do imóvel autenticado sem enviar coordenadas', async () => {
    const client = createClient({
      rpc: {
        data: [
          {
            id: 11,
            cartografia_slug: 'sgb-ipt-cajamar-2017-suscetibilidade',
            tipo: 'inundacao',
            classe: 'Alta',
            classe_ordem: 3,
            processo: 'Inundação, alagamento e assoreamento',
            area_ha: 1.25,
            contem_ponto: true,
            distancia_m: 0,
          },
        ],
        error: null,
      },
    })

    const areas = await fetchSuscetibilidadeDoMorador(client, 500, 20)

    expect(areas).toHaveLength(1)
    expect(client.rpc).toHaveBeenCalledWith(
      'areas_suscetibilidade_do_morador',
      { p_raio_m: 500, p_limite: 20 },
    )
  })

  it('formata áreas pequenas em m² e distâncias em metros ou quilômetros', () => {
    expect(formatAreaSuscetibilidade(1.25)).toBe('1,25 ha')
    expect(formatAreaSuscetibilidade(0.00003)).toBe('0,3 m²')
    expect(formatDistanciaSuscetibilidade(320)).toBe('320 m')
    expect(formatDistanciaSuscetibilidade(1500)).toBe('1,5 km')
  })

  it('mantém a nota explícita de que suscetibilidade não é previsão', () => {
    expect(SUSCETIBILIDADE_NOTA).toContain('Não é previsão de alagamento')
    expect(SUSCETIBILIDADE_META.Enxurrada.label).toBe('Enxurrada')
  })
})
