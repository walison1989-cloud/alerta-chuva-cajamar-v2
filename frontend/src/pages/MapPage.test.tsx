import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MapPage } from '@/pages/MapPage'
import type { AddressRecord } from '@/types/address'
import type { RainStation } from '@/types/rain'
import type {
  AreaSuscetibilidadeProxima,
  CartografiaSuscetibilidade,
  SuscetibilidadeFeature,
} from '@/types/suscetibilidade'

const mockState = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  refresh: vi.fn(),
  catalogStations: [] as RainStation[],
}))

vi.mock('@/hooks/useRainCatalog', () => ({
  useRainCatalog: () => ({ stations: mockState.catalogStations, sources: [], isLoading: false, refresh: vi.fn() }),
}))

vi.mock('@/hooks/useRainMap', () => ({
  useRainMap: () => mockState.query,
}))

vi.mock('@/components/map/RainMap', () => ({
  RainMap: ({
    stations,
    address,
    centerRequest,
    suscetibilidade,
  }: {
    stations: RainStation[]
    address: { latitude: number; longitude: number } | null
    centerRequest?: number
    suscetibilidade: unknown[]
  }) => (
    <div
      data-testid="rain-map"
      data-address={address ? 'sim' : 'nao'}
      data-center-request={centerRequest ?? 0}
      data-suscetibilidade={suscetibilidade.length}
    >
      {stations.length} marcadores
    </div>
  ),
}))

vi.mock('@/components/map/RegionWeatherCard', () => ({
  RegionWeatherCard: () => <div data-testid="clima-regiao">Clima</div>,
}))

const NOW = Date.parse('2026-11-06T12:00:00.000Z')

const STATIONS: RainStation[] = [
  {
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
    lastReadingAt: null,
    accumulatedMm: null,
    measurementType: 'acumulado_24h',
    windowHours: 24,
    unit: 'mm',
    quality: 'oficial',
    distanceKm: null,
  },
  {
    key: '350920502A',
    id: 7028,
    name: 'São Benedito',
    code: '350920502A',
    latitude: -23.4,
    longitude: -46.8,
    source: 'CEMADEN',
    sourceId: '7028',
    municipality: 'Cajamar',
    state: 'SP',
    stationType: 'Pluviométrica',
    network: 'CEMADEN',
    sourceStatus: 1,
    lastCollectedAt: '2026-11-06T11:50:00.000Z',
    lastReadingAt: '2026-11-06T11:50:00.000Z',
    accumulatedMm: 12.4,
    measurementType: 'acumulado_24h',
    windowHours: 24,
    unit: 'mm',
    quality: 'oficial',
    distanceKm: 2.6,
  },
]

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

const SUSCETIBILIDADE_FEATURES: SuscetibilidadeFeature[] = [
  {
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
  },
  {
    id: 12,
    cartografiaSlug: 'sgb-ipt-cajamar-2017-suscetibilidade',
    tipo: 'enxurrada',
    classe: 'Enxurrada',
    classeOrdem: null,
    processo: 'Enxurrada',
    areaHa: 0.73,
    geojson: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-46.9, -23.4],
            [-46.89, -23.4],
            [-46.89, -23.39],
            [-46.9, -23.39],
            [-46.9, -23.4],
          ],
        ],
      ],
    },
  },
]

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
  totalEnxurrada: 1,
  areaHaInundacao: 1.25,
  areaHaEnxurrada: 0.73,
  metadados: {},
}

const AREAS_IMOVEL: AreaSuscetibilidadeProxima[] = [
  {
    id: 11,
    cartografiaSlug: 'sgb-ipt-cajamar-2017-suscetibilidade',
    tipo: 'inundacao',
    classe: 'Alta',
    classeOrdem: 3,
    processo: 'Inundação, alagamento e assoreamento',
    areaHa: 1.25,
    contemPonto: true,
    distanciaM: 0,
  },
  {
    id: 12,
    cartografiaSlug: 'sgb-ipt-cajamar-2017-suscetibilidade',
    tipo: 'enxurrada',
    classe: 'Enxurrada',
    classeOrdem: null,
    processo: 'Enxurrada',
    areaHa: 0.73,
    contemPonto: false,
    distanciaM: 320,
  },
]

function buildQuery(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'supabase',
    modeLabel: 'Supabase + PostGIS',
    stations: STATIONS,
    nearbyStations: [],
    collection: {
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
      publicMessage: 'Sincronização concluída com leituras oficiais do CEMADEN.',
    },
    occurrences: [],
    address: null,
    addressError: null,
    suscetibilidade: {
      cartografia: CARTOGRAFIA,
      features: SUSCETIBILIDADE_FEATURES,
      areasImovel: [],
      error: null,
    },
    error: null,
    notice: null,
    isLoading: false,
    isRefreshing: false,
    lastLoadedAt: NOW,
    isAuthenticated: false,
    isAuthLoading: false,
    refresh: mockState.refresh,
    ...overrides,
  }
}

function renderMapPage() {
  return render(
    <MemoryRouter>
      <MapPage />
    </MemoryRouter>,
  )
}

function getDetailsCard(): HTMLElement {
  const card = document.querySelector('[aria-labelledby="detalhes-estacao"]')
  if (!(card instanceof HTMLElement)) {
    throw new Error('Cartão de detalhes não encontrado.')
  }
  return card
}

describe('MapPage', () => {
  beforeEach(() => {
    mockState.query = buildQuery()
    mockState.refresh.mockClear()
    mockState.catalogStations = []
  })

  it('filtra o mapa e a lista por rede e identifica catálogo sem leitura', async () => {
    const user = userEvent.setup()
    mockState.catalogStations = [{ ...STATIONS[0], key: 'SP Águas:E3-233', source: 'SP Águas', name: 'Ponunduva', code: 'E3-233', catalogueOnly: true, accumulatedMm: null, lastReadingAt: null, windowHours: null }]
    renderMapPage()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rede no mapa e na lista' }), 'SP Águas')
    expect(screen.getByTestId('rain-map')).toHaveTextContent('1 marcadores')
    expect(screen.getByText('Somente catálogo · sem medição')).toBeInTheDocument()
    expect(screen.getByText(/este posto não tem medição de chuva integrada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Consultar SP Águas' })).toHaveAttribute('href', 'https://ph.spaguas.sp.gov.br/Pluviometricos')
  })

  it('preserva a camada principal quando o catálogo complementar não retorna estações', () => {
    renderMapPage()
    expect(screen.getByTestId('rain-map')).toHaveTextContent(`${STATIONS.length} marcadores`)
    expect(screen.getByRole('heading', { name: 'Redes de medição de chuva' })).toBeInTheDocument()
  })

  it('busca sem acentos e permite limpar sem remover marcadores do mapa', async () => {
    const user = userEvent.setup()
    renderMapPage()
    const search = screen.getByRole('searchbox', { name: 'Buscar na lista de estações' })
    await user.type(search, 'agua fria')
    expect(screen.getByText(/1 estação\(ões\) na lista/)).toBeInTheDocument()
    expect(screen.getByTestId('rain-map')).toHaveTextContent(`${STATIONS.length} marcadores`)
    await user.clear(search)
    await user.type(search, 'estacao-inexistente')
    expect(screen.getByText('Nenhuma estação corresponde à busca')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar busca de estações' }))
    expect(search).toHaveValue('')
    expect(screen.getByText(new RegExp(`${STATIONS.length} estação\\(ões\\) na lista`))).toBeInTheDocument()
  })

  it('mostra estações reais, status da coleta e estado de leitura ausente', () => {
    renderMapPage()

    expect(
      screen.getByRole('heading', { name: 'Mapa de chuva e estações' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('rain-map')).toHaveTextContent('2 marcadores')
    expect(screen.getAllByText('Água Fria').length).toBeGreaterThan(0)
    expect(screen.getAllByText('São Benedito').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Dados indisponíveis ou desatualizados').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'Sincronização concluída com leituras oficiais do CEMADEN.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('1 com leitura')).toBeInTheDocument()
  })

  it('atualiza os detalhes ao selecionar outra estação', async () => {
    const user = userEvent.setup()
    renderMapPage()

    const details = getDetailsCard()
    expect(within(details).getByText('Água Fria')).toBeInTheDocument()
    expect(within(details).getByText('Sem leitura')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /São Benedito/ }),
    )

    expect(within(details).getByText('São Benedito')).toBeInTheDocument()
    expect(within(details).getByText('12,4 mm')).toBeInTheDocument()
    expect(
      within(details).getByText(/Código 350920502A/),
    ).toBeInTheDocument()
  })

  it('permite alternar camadas disponíveis e explica as indisponíveis', async () => {
    const user = userEvent.setup()
    renderMapPage()

    await user.click(screen.getByRole('button', { name: 'Camadas' }))
    const stationsSwitch = screen.getByRole('switch', {
      name: /Estações pluviométricas/,
    })
    expect(stationsSwitch).toHaveAttribute('aria-checked', 'true')

    await user.click(stationsSwitch)

    expect(stationsSwitch).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByRole('switch', { name: /Chuva observada/ }),
    ).toBeDisabled()

    const suscetibilidadeSwitch = screen.getByRole('switch', {
      name: /Suscetibilidade oficial/,
    })
    expect(suscetibilidadeSwitch).toHaveAttribute('aria-checked', 'true')
    await user.click(suscetibilidadeSwitch)
    expect(suscetibilidadeSwitch).toHaveAttribute('aria-checked', 'false')

    expect(screen.getByText('Cursos d’água')).toBeInTheDocument()
    expect(screen.getByText('Camadas ainda indisponíveis')).toBeInTheDocument()
    expect(screen.getByTestId('rain-map')).toHaveAttribute(
      'data-suscetibilidade',
      '2',
    )
  })

  it('exibe o imóvel privado somente quando o endereço está disponível', () => {
    mockState.query = buildQuery({
      isAuthenticated: true,
      address: ADDRESS,
    })

    renderMapPage()

    expect(
      screen.getByText('Rua Teste, 100 · Centro · Cajamar/SP'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Marcador privado ativo/)).toBeInTheDocument()
    expect(screen.getByText('Meu imóvel (privado)')).toBeInTheDocument()
    expect(screen.getByTestId('rain-map')).toHaveAttribute('data-address', 'sim')
  })

  it('exibe a carta oficial e as áreas do imóvel sem revelar coordenadas', () => {
    mockState.query = buildQuery({
      isAuthenticated: true,
      address: ADDRESS,
      suscetibilidade: {
        cartografia: CARTOGRAFIA,
        features: SUSCETIBILIDADE_FEATURES,
        areasImovel: AREAS_IMOVEL,
        error: null,
      },
    })

    renderMapPage()

    expect(
      screen.getByRole('heading', { name: 'Suscetibilidade oficial' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/SGB\/CPRM e IPT/).length).toBeGreaterThan(0)
    expect(screen.getByText('2 áreas oficiais')).toBeInTheDocument()
    expect(document.body.textContent).toContain(
      'O ponto cadastrado está dentro de uma área oficial',
    )
    expect(screen.getByText(/O imóvel está nesta área/)).toBeInTheDocument()
    expect(screen.getByText(/A 320 m do imóvel/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Ver fonte no Rigeo/SGB' }),
    ).toHaveAttribute('href', CARTOGRAFIA.urlItem)
    expect(screen.queryByText(/-23\.36/)).not.toBeInTheDocument()
  })

  it('explica como consultar a suscetibilidade quando não há sessão', () => {
    renderMapPage()

    expect(
      screen.getByText(
        /Entre na sua conta e cadastre o imóvel para comparar o ponto privado/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/Suscetibilidade descreve a predisposição/).length,
    ).toBeGreaterThan(0)
  })

  it('mostra as cinco estações mais próximas e permite expandir', async () => {
    const nearby: RainStation[] = Array.from({ length: 7 }, (_, index) => ({
      ...STATIONS[1],
      key: `nearby-${index}`,
      id: 8000 + index,
      name: `Estação Próxima ${index + 1}`,
      code: `PROX${index + 1}`,
      distanceKm: index + 1,
    }))
    mockState.query = buildQuery({
      isAuthenticated: true,
      address: ADDRESS,
      nearbyStations: nearby,
    })
    const user = userEvent.setup()

    renderMapPage()

    expect(screen.getByText('Estação Próxima 1')).toBeInTheDocument()
    expect(screen.getByText('Estação Próxima 5')).toBeInTheDocument()
    expect(screen.queryByText('Estação Próxima 6')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /Mostrar todas as 7 estações/ }),
    )

    expect(screen.getByText('Estação Próxima 6')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Mostrar apenas as 5 mais próximas/ }),
    ).toBeInTheDocument()
  })

  it('centraliza o mapa no imóvel pelo botão do cartão privado', async () => {
    mockState.query = buildQuery({
      isAuthenticated: true,
      address: ADDRESS,
    })
    const user = userEvent.setup()

    renderMapPage()

    expect(screen.getByTestId('rain-map')).toHaveAttribute(
      'data-center-request',
      '0',
    )

    await user.click(
      screen.getByRole('button', { name: 'Centralizar no imóvel' }),
    )

    expect(screen.getByTestId('rain-map')).toHaveAttribute(
      'data-center-request',
      '1',
    )
  })

  it('mantém aviso honesto quando as fontes falham', () => {
    mockState.query = buildQuery({
      mode: 'none',
      modeLabel: 'Sem fonte disponível',
      stations: [],
      collection: null,
      error:
        'A sincronização com o CEMADEN falhou. Os últimos dados válidos permanecem disponíveis, se existirem.',
    })

    renderMapPage()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Camada de chuva indisponível',
    )
    expect(screen.getByText('Nenhuma estação disponível')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma coleta registrada')).toBeInTheDocument()
  })

  it('identifica a leitura direta do CEMADEN sem persistência', () => {
    mockState.query = buildQuery({
      mode: 'cemaden-live',
      modeLabel: 'CEMADEN (leitura direta)',
      notice:
        'Exibindo leitura direta do CEMADEN, sem persistência no Supabase e sem cálculo PostGIS de distância do imóvel.',
    })

    renderMapPage()

    expect(
      screen.getByText('CEMADEN (leitura direta)'),
    ).toBeInTheDocument()
    expect(screen.getByText(/sem persistência no Supabase/)).toBeInTheDocument()
    expect(
      screen.getByText(/Este status vem da leitura direta do JSONP/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Leitura direta: Cajamar e entorno (30 km)'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Camada pública validada')).not.toBeInTheDocument()
  })
})
