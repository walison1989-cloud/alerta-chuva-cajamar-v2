import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRainMap } from '@/hooks/useRainMap'
import { notifyAddressUpdated } from '@/lib/addressEvents'
import type { AddressRecord } from '@/types/address'
import type { RainCollectionStatus, RainStation } from '@/types/rain'
import type {
  AreaSuscetibilidadeProxima,
  CartografiaSuscetibilidade,
  SuscetibilidadeFeature,
} from '@/types/suscetibilidade'

const mocks = vi.hoisted(() => ({
  client: {},
  liveFallback: false,
  auth: {
    user: null as { id: string } | null,
    isLoading: false,
  },
  fetchRainSnapshot: vi.fn(),
  fetchNearbyStations: vi.fn(),
  fetchSuscetibilidadePublica: vi.fn(),
  fetchSuscetibilidadeDoMorador: vi.fn(),
  loadCemadenLiveSnapshot: vi.fn(),
  livePayloadToRainStations: vi.fn(),
  livePayloadToCollectionStatus: vi.fn(),
  getMyAddress: vi.fn(),
}))

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/env')>()
  return { ...actual, env: { ...actual.env, get cemadenLiveFallbackEnabled() { return mocks.liveFallback } } }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => mocks.client,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mocks.auth,
}))

vi.mock('@/lib/rain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rain')>()
  return {
    ...actual,
    fetchRainSnapshot: mocks.fetchRainSnapshot,
    fetchNearbyStations: mocks.fetchNearbyStations,
  }
})

vi.mock('@/lib/cemaden', () => ({
  loadCemadenLiveSnapshot: mocks.loadCemadenLiveSnapshot,
  livePayloadToRainStations: mocks.livePayloadToRainStations,
  livePayloadToCollectionStatus: mocks.livePayloadToCollectionStatus,
}))

vi.mock('@/lib/suscetibilidade', () => ({
  fetchSuscetibilidadePublica: mocks.fetchSuscetibilidadePublica,
  fetchSuscetibilidadeDoMorador: mocks.fetchSuscetibilidadeDoMorador,
}))

vi.mock('@/lib/addresses', () => ({
  getMyAddress: mocks.getMyAddress,
}))

const STATION: RainStation = {
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
  accumulatedMm: 2.5,
  measurementType: 'acumulado_24h',
  windowHours: 24,
  unit: 'mm',
  quality: 'oficial',
  distanceKm: null,
}

const COLLECTION: RainCollectionStatus = {
  source: 'CEMADEN',
  status: 'sucesso',
  lastAttemptAt: '2026-11-06T11:55:00.000Z',
  lastCompletedAt: '2026-11-06T11:55:00.000Z',
  lastSuccessAt: '2026-11-06T11:55:00.000Z',
  payloadUpdatedAt: '2026-11-06T11:50:00.000Z',
  stationsReceived: 5938,
  stationsNear: 3,
  measurementsSaved: 2,
  measurementsWithoutReading: 1,
  durationMs: 1200,
  publicMessage: 'Sincronização concluída.',
}

const ADDRESS: AddressRecord = {
  id: 'endereco-1',
  usuario_id: 'usuario-1',
  cep: '07790000',
  logradouro: 'Rua Teste',
  numero: '100',
  bairro: 'Centro',
  complemento: null,
  municipio: 'Cajamar',
  uf: 'SP',
  latitude: -23.36,
  longitude: -46.87,
  precisao: 'ajustado_manual',
  geocoding_fonte: null,
  geocoding_label: null,
  consentimento_lgpd: true,
  created_at: '2026-11-01T12:00:00.000Z',
  updated_at: '2026-11-01T12:00:00.000Z',
}

const SUSCETIBILIDADE_FEATURE: SuscetibilidadeFeature = {
  id: 11,
  cartografiaSlug: 'sgb-ipt-cajamar-2017-suscetibilidade',
  tipo: 'inundacao',
  classe: 'Alta',
  classeOrdem: 3,
  processo: 'Inundação, alagamento e assoreamento',
  areaHa: 1.25,
  geojson: {
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
  },
}

const CARTOGRAFIA: CartografiaSuscetibilidade = {
  id: 1,
  slug: 'sgb-ipt-cajamar-2017-suscetibilidade',
  titulo: 'Carta de suscetibilidade de Cajamar',
  fonte: 'SGB/CPRM e IPT',
  editor: 'CPRM; IPT',
  municipio: 'Cajamar',
  uf: 'SP',
  escala: '1:25.000',
  anoPublicacao: 2017,
  mesPublicacao: 6,
  urlItem: 'https://rigeo.sgb.gov.br/items/ffa6864e-5fbd-4e3e-a1bd-28d22fe50cf4',
  urlDownload: null,
  licenca: 'Acesso aberto',
  sridOrigem: 31983,
  sridDestino: 4326,
  importadoEm: '2026-11-07T09:00:00.000Z',
  totalInundacao: 1,
  totalEnxurrada: 0,
  areaHaInundacao: 1.25,
  areaHaEnxurrada: 0,
  metadados: {},
}

const AREA_IMOVEL: AreaSuscetibilidadeProxima = {
  id: 11,
  cartografiaSlug: 'sgb-ipt-cajamar-2017-suscetibilidade',
  tipo: 'inundacao',
  classe: 'Alta',
  classeOrdem: 3,
  processo: 'Inundação, alagamento e assoreamento',
  areaHa: 1.25,
  contemPonto: true,
  distanciaM: 0,
}

function resetMocks() {
  mocks.liveFallback = false
  vi.clearAllMocks()
  mocks.auth.user = null
  mocks.auth.isLoading = false
  mocks.fetchRainSnapshot.mockResolvedValue({
    stations: [],
    collection: null,
    occurrences: [],
  })
  mocks.fetchNearbyStations.mockResolvedValue([])
  mocks.fetchSuscetibilidadePublica.mockResolvedValue({
    cartografia: null,
    features: [],
  })
  mocks.fetchSuscetibilidadeDoMorador.mockResolvedValue([])
  mocks.getMyAddress.mockResolvedValue(null)
  mocks.loadCemadenLiveSnapshot.mockRejectedValue(
    new Error('JSONP não carregado no teste.'),
  )
}

describe('useRainMap', () => {
  it('usa a camada do Supabase e mescla distâncias do PostGIS', async () => {
    resetMocks()
    mocks.auth.user = { id: 'usuario-1' }
    mocks.fetchRainSnapshot.mockResolvedValue({
      stations: [STATION],
      collection: COLLECTION,
      occurrences: [],
    })
    mocks.fetchNearbyStations.mockResolvedValue([
      { ...STATION, distanceKm: 1.42 },
    ])
    mocks.getMyAddress.mockResolvedValue(ADDRESS)

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.mode).toBe('supabase')
    expect(result.current.stations).toHaveLength(1)
    expect(result.current.stations[0].distanceKm).toBe(1.42)
    expect(result.current.nearbyStations).toHaveLength(1)
    expect(result.current.nearbyStations[0].distanceKm).toBe(1.42)
    expect(result.current.address?.id).toBe('endereco-1')
    expect(result.current.collection?.status).toBe('sucesso')
  })

  it('cai para a leitura direta do CEMADEN quando a view está vazia', async () => {
    resetMocks()
    mocks.liveFallback = true
    mocks.loadCemadenLiveSnapshot.mockResolvedValue({
      updatedAt: '2026-11-06T11:50:00.000Z',
      stations: [],
      stationsReceived: 5938,
    })
    mocks.livePayloadToRainStations.mockReturnValue([
      { ...STATION, key: 'cemaden-live:350920504A', id: null },
    ])
    mocks.livePayloadToCollectionStatus.mockReturnValue({
      ...COLLECTION,
      lastSuccessAt: null,
      publicMessage: 'Leitura direta, sem persistência.',
    })

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.mode).toBe('cemaden-live')
    expect(result.current.stations).toHaveLength(1)
    expect(result.current.notice).toContain('leitura direta do CEMADEN')
    expect(result.current.collection?.publicMessage).toContain('sem persistência')
  })

  it('expõe indisponibilidade quando as duas fontes falham', async () => {
    resetMocks()
    mocks.liveFallback = true
    mocks.fetchRainSnapshot.mockRejectedValue(
      new Error('A view da Etapa 3 não existe.'),
    )
    mocks.loadCemadenLiveSnapshot.mockRejectedValue(
      new Error('O JSONP do CEMADEN foi bloqueado.'),
    )

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.mode).toBe('none')
    expect(result.current.stations).toEqual([])
    expect(result.current.error).toContain('A view da Etapa 3 não existe.')
    expect(result.current.error).toContain('O JSONP do CEMADEN foi bloqueado.')
  })

  it('recarrega o endereço privado quando o formulário sinaliza uma atualização', async () => {
    resetMocks()
    mocks.auth.user = { id: 'usuario-1' }
    mocks.fetchRainSnapshot.mockResolvedValue({
      stations: [STATION],
      collection: COLLECTION,
      occurrences: [],
    })
    mocks.getMyAddress
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ADDRESS)

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.address).toBeNull()

    act(() => {
      notifyAddressUpdated()
    })

    await waitFor(() => {
      expect(result.current.address?.id).toBe('endereco-1')
    })
    expect(mocks.getMyAddress).toHaveBeenCalledTimes(2)
  })

  it('carrega a suscetibilidade pública mesmo sem endereço', async () => {
    resetMocks()
    mocks.fetchSuscetibilidadePublica.mockResolvedValue({
      cartografia: CARTOGRAFIA,
      features: [SUSCETIBILIDADE_FEATURE],
    })

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.suscetibilidade.features).toHaveLength(1)
    expect(result.current.suscetibilidade.cartografia?.escala).toBe('1:25.000')
    expect(result.current.suscetibilidade.error).toBeNull()
    expect(mocks.fetchSuscetibilidadeDoMorador).not.toHaveBeenCalled()
  })

  it('consulta a suscetibilidade do imóvel pela RPC autenticada', async () => {
    resetMocks()
    mocks.auth.user = { id: 'usuario-1' }
    mocks.getMyAddress.mockResolvedValue(ADDRESS)
    mocks.fetchSuscetibilidadeDoMorador.mockResolvedValue([AREA_IMOVEL])

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() =>
      expect(result.current.suscetibilidade.areasImovel).toHaveLength(1),
    )

    expect(mocks.fetchSuscetibilidadeDoMorador).toHaveBeenCalled()
    const [clientArg, radiusArg, limitArg] =
      mocks.fetchSuscetibilidadeDoMorador.mock.calls[0]
    expect(clientArg).toBe(mocks.client)
    expect(radiusArg).toBeUndefined()
    expect(limitArg).toBeUndefined()
    expect(result.current.suscetibilidade.areasImovel[0]).not.toHaveProperty(
      'latitude',
    )
    expect(result.current.suscetibilidade.areasImovel[0].contemPonto).toBe(true)
  })

  it('não consulta a suscetibilidade do imóvel sem endereço', async () => {
    resetMocks()
    mocks.auth.user = { id: 'usuario-1' }
    mocks.getMyAddress.mockResolvedValue(null)

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mocks.fetchSuscetibilidadeDoMorador).not.toHaveBeenCalled()
  })

  it('expõe indisponibilidade quando a camada de suscetibilidade falha', async () => {
    resetMocks()
    mocks.fetchSuscetibilidadePublica.mockRejectedValue(
      new Error('Aplique a migration da Etapa 5.'),
    )

    const { result } = renderHook(() => useRainMap())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.suscetibilidade.error).toContain(
      'migration da Etapa 5',
    )
    expect(result.current.suscetibilidade.features).toEqual([])
  })
})
