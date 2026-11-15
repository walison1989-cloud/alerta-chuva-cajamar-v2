import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/AuthContext'
import type { AuthContextValue } from '@/auth/AuthContext'
import type { GeocodeResult } from '@/types/address'

const repo = vi.hoisted(() => ({
  getMyAddress: vi.fn(),
  listMyAddressVersions: vi.fn(),
  saveMyAddress: vi.fn(),
}))

const services = vi.hoisted(() => ({
  lookupCep: vi.fn(),
  geocodeAddress: vi.fn(),
}))

const geolocation = vi.hoisted(() => ({
  requestCurrentPosition: vi.fn(),
  getSecureContextInfo: vi.fn(),
}))

vi.mock('@/lib/addresses', () => ({
  AddressRepositoryError: class AddressRepositoryError extends Error {},
  getMyAddress: repo.getMyAddress,
  listMyAddressVersions: repo.listMyAddressVersions,
  saveMyAddress: repo.saveMyAddress,
}))

vi.mock('@/lib/cep', () => ({
  CepLookupError: class CepLookupError extends Error {},
  lookupCep: services.lookupCep,
}))

vi.mock('@/lib/geocoding', () => ({
  GeocodingError: class GeocodingError extends Error {},
  geocodeAddress: services.geocodeAddress,
  OPENGEOCODING_ATTRIBUTION:
    'Data © OpenStreetMap contributors (ODbL), Overture Maps Foundation, OpenAddresses contributors, GeoNames (CC BY 4.0, modified).',
}))

vi.mock('@/lib/geolocation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/geolocation')>()
  return {
    ...actual,
    requestCurrentPosition: geolocation.requestCurrentPosition,
    getSecureContextInfo: geolocation.getSecureContextInfo,
  }
})

vi.mock('@/lib/supabase', () => {
  const client = {}
  return {
    getSupabaseClient: () => client,
  }
})

vi.mock('@/components/address/AddressMapPicker', () => ({
  AddressMapPicker: ({
    latitude,
    longitude,
    onChange,
  }: {
    latitude: number | null
    longitude: number | null
    onChange: (latitude: number, longitude: number) => void
  }) => (
    <div
      data-testid="map-picker"
      data-latitude={latitude ?? ''}
      data-longitude={longitude ?? ''}
    >
      <button type="button" onClick={() => onChange(-23.4, -46.85)}>
        Ajustar ponto no mapa
      </button>
    </div>
  ),
}))

import { AddressForm } from '@/components/address/AddressForm'
import { GeolocationError } from '@/lib/geolocation'

const authUser = {
  id: 'usuario-1',
  email: 'morador@teste.com',
} as unknown as AuthContextValue['user']

const savedRecord = {
  id: 'endereco-1',
  usuario_id: 'usuario-1',
  cep: '07750000',
  logradouro: 'Rua de Teste',
  numero: '10',
  bairro: 'Centro',
  complemento: null,
  municipio: 'Cajamar',
  uf: 'SP',
  latitude: -23.356111,
  longitude: -46.876944,
  precisao: 'ajustado_manual' as const,
  geocoding_fonte: null,
  geocoding_label: null,
  consentimento_lgpd: true,
  created_at: '2026-11-05T12:00:00Z',
  updated_at: '2026-11-05T12:00:00Z',
}

function geocodeResult(
  overrides: Partial<GeocodeResult> = {},
): GeocodeResult {
  return {
    latitude: -23.406341,
    longitude: -46.862282,
    label: 'Rua de Teste, 10, Centro, Cajamar, SP, Brasil',
    provider: 'opengeocoding.com',
    goodMatch: true,
    approximate: false,
    addressDetails: {
      country: 'Brasil',
      countryCode: 'br',
      state: 'São Paulo',
      city: 'Cajamar',
      road: 'Rua de Teste',
      houseNumber: '10',
      postcode: '07750-000',
    },
    attribution:
      'Data © OpenStreetMap contributors (ODbL), Overture Maps Foundation, OpenAddresses contributors, GeoNames (CC BY 4.0, modified).',
    cached: false,
    ...overrides,
  }
}

function renderForm() {
  const value: AuthContextValue = {
    session: { user: authUser } as unknown as AuthContextValue['session'],
    user: authUser,
    isLoading: false,
    isConfigured: true,
    signOut: async () => {},
  }

  return render(
    <AuthContext.Provider value={value}>
      <AddressForm />
    </AuthContext.Provider>,
  )
}

async function fillRequiredFields() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('CEP'), '07750-000')
  await user.type(screen.getByLabelText('Logradouro'), 'Rua de Teste')
  await user.type(screen.getByLabelText('Número'), '10')
  await user.type(screen.getByLabelText('Bairro'), 'Centro')
  await user.click(screen.getByLabelText(/Autorizo o armazenamento/))
  return user
}

describe('AddressForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repo.getMyAddress.mockResolvedValue(null)
    repo.listMyAddressVersions.mockResolvedValue([])
    geolocation.getSecureContextInfo.mockReturnValue({
      isSecure: true,
      protocol: 'http:',
      hostname: 'localhost',
      isLoopback: true,
      isPrivateNetwork: false,
      warning: null,
    })
  })

  it('preenche os campos a partir do CEP consultado', async () => {
    services.lookupCep.mockResolvedValue({
      cep: '07750-000',
      logradouro: 'Avenida de Teste',
      complemento: '',
      bairro: 'Centro',
      localidade: 'Cajamar',
      uf: 'SP',
    })

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CEP'), '07750-000')
    await user.click(
      screen.getByRole('button', { name: 'Consultar CEP no ViaCEP' }),
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Logradouro')).toHaveValue(
        'Avenida de Teste',
      )
    })
    expect(services.lookupCep).toHaveBeenCalledWith(
      '07750000',
      expect.any(AbortSignal),
    )
    expect(screen.getByLabelText('Bairro')).toHaveValue('Centro')
    expect(
      screen.getByText(/Campos preenchidos pelo ViaCEP/i),
    ).toBeInTheDocument()
  })

  it('geocodifica automaticamente 800 ms após preencher CEP, rua, número e bairro', async () => {
    services.geocodeAddress.mockResolvedValue(geocodeResult())

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    await fillRequiredFields()

    // Nenhum clique em “Localizar no mapa”: a consulta parte do debounce.
    await waitFor(
      () => {
        expect(services.geocodeAddress).toHaveBeenCalledTimes(1)
      },
      { timeout: 3_000 },
    )

    const [query] = services.geocodeAddress.mock.calls[0]
    expect(query).toMatchObject({
      cep: '07750000',
      logradouro: 'Rua de Teste',
      numero: '10',
      bairro: 'Centro',
      municipio: 'Cajamar',
      uf: 'SP',
    })

    await waitFor(() => {
      expect(screen.getByTestId('map-picker')).toHaveAttribute(
        'data-latitude',
        '-23.406341',
      )
    })
    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.406341)
    expect(screen.getByLabelText('Longitude')).toHaveValue(-46.862282)
    expect(
      screen.getAllByText('Geocodificado (exato)').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/Localização encontrada. Confirme o marcador/i),
    ).toBeInTheDocument()
  })

  it('orienta o ajuste manual quando a geocodificação falha', async () => {
    services.geocodeAddress.mockRejectedValue(new Error('geocoder offline'))

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Localizar no mapa' }))

    expect(
      await screen.findByText(
        /Não foi possível localizar este endereço. Marque o ponto no mapa./i,
      ),
    ).toBeInTheDocument()
  })

  it('carrega o formulário vazio quando ainda não existe endereço', async () => {
    renderForm()

    expect(
      await screen.findByRole('heading', { name: 'Meu endereço' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Município')).toHaveValue('Cajamar')
    expect(screen.getByLabelText('UF')).toHaveValue('SP')
    expect(
      screen.getByRole('button', { name: 'Salvar endereço' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Nenhuma versão registrada ainda/i),
    ).toBeInTheDocument()
  })

  it('bloqueia o salvamento sem ponto confirmado no mapa', async () => {
    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }))

    expect(
      await screen.findByText(/Localize o endereço ou marque o ponto/i),
    ).toBeInTheDocument()
    expect(repo.saveMyAddress).not.toHaveBeenCalled()
  })

  it('exige confirmação explícita do ponto antes de salvar', async () => {
    repo.saveMyAddress.mockResolvedValue(savedRecord)
    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(
      screen.getByRole('button', { name: 'Ajustar ponto no mapa' }),
    )
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }))

    expect(
      await screen.findByText(/Confirme o ponto no mapa antes de salvar/i),
    ).toBeInTheDocument()
    expect(repo.saveMyAddress).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText(/Confirmo que o marcador/))
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }))

    await waitFor(() => {
      expect(repo.saveMyAddress).toHaveBeenCalledTimes(1)
    })
  })

  it('salva as coordenadas ajustadas e atualiza o histórico', async () => {
    repo.saveMyAddress.mockResolvedValue(savedRecord)
    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(
      screen.getByRole('button', { name: 'Ajustar ponto no mapa' }),
    )
    await user.click(screen.getByLabelText(/Confirmo que o marcador/))
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }))

    await waitFor(() => {
      expect(repo.saveMyAddress).toHaveBeenCalledTimes(1)
    })

    const [, userId, input] = repo.saveMyAddress.mock.calls[0]
    expect(userId).toBe('usuario-1')
    expect(input).toMatchObject({
      cep: '07750000',
      logradouro: 'Rua de Teste',
      numero: '10',
      bairro: 'Centro',
      municipio: 'Cajamar',
      uf: 'SP',
      latitude: -23.4,
      longitude: -46.85,
      precisao: 'ajustado_manual',
    })
    expect(input).not.toHaveProperty('localizacao')
    expect(
      await screen.findByText(/Endereço salvo. A primeira versão/i),
    ).toBeInTheDocument()
  })

  it('salva a fonte e a precisão retornadas pela geocodificação', async () => {
    services.geocodeAddress.mockResolvedValue(geocodeResult())
    repo.saveMyAddress.mockResolvedValue({
      ...savedRecord,
      cep: '07750000',
      logradouro: 'Rua de Teste',
      numero: '10',
      bairro: 'Centro',
      latitude: -23.406341,
      longitude: -46.862282,
      precisao: 'geocodificado' as const,
      geocoding_fonte: 'opengeocoding.com (exato)',
      geocoding_label: 'Rua de Teste, 10, Centro, Cajamar, SP, Brasil',
    })

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Localizar no mapa' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue(-23.406341)
    })

    await user.click(screen.getByLabelText(/Confirmo que o marcador/))
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }))

    await waitFor(() => {
      expect(repo.saveMyAddress).toHaveBeenCalledTimes(1)
    })

    const [, , input] = repo.saveMyAddress.mock.calls[0]
    expect(input).toMatchObject({
      latitude: -23.406341,
      longitude: -46.862282,
      precisao: 'geocodificado',
      geocodingFonte: 'opengeocoding.com (exato)',
    })
  })

  it('carrega o endereço existente e oferece atualização', async () => {
    repo.getMyAddress.mockResolvedValue(savedRecord)
    repo.listMyAddressVersions.mockResolvedValue([
      {
        id: 1,
        operacao: 'INSERT',
        alterado_em: '2026-11-05T12:00:00Z',
        precisao: 'ajustado_manual',
        geocoding_fonte: null,
      },
    ])

    renderForm()

    expect(
      await screen.findByRole('button', { name: 'Atualizar endereço' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('CEP')).toHaveValue('07750-000')
    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.356111)
    expect(screen.getByTestId('map-picker')).toHaveAttribute(
      'data-latitude',
      '-23.356111',
    )
    expect(screen.getByText('Endereço criado')).toBeInTheDocument()
    expect(screen.getByLabelText(/Autorizo o armazenamento/)).toBeChecked()
    expect(screen.getByLabelText(/Confirmo que o marcador/)).toBeChecked()
    // Abrir um endereço salvo não deve consultar o geocodificador.
    expect(services.geocodeAddress).not.toHaveBeenCalled()
  })

  it('atualiza mapa, coordenadas e precisão após geocodificar o endereço', async () => {
    services.geocodeAddress.mockResolvedValue(geocodeResult())

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Localizar no mapa' }))

    await waitFor(() => {
      expect(screen.getByTestId('map-picker')).toHaveAttribute(
        'data-latitude',
        '-23.406341',
      )
    })

    expect(screen.getByTestId('map-picker')).toHaveAttribute(
      'data-longitude',
      '-46.862282',
    )
    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.406341)
    expect(screen.getByLabelText('Longitude')).toHaveValue(-46.862282)
    expect(
      screen.getAllByText('Geocodificado (exato)').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/Resultado do geocodificador/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/OpenStreetMap contributors/),
    ).toBeInTheDocument()

    const [query, signal] = services.geocodeAddress.mock.calls[0]
    expect(query).toMatchObject({
      logradouro: 'Rua de Teste',
      numero: '10',
      bairro: 'Centro',
      municipio: 'Cajamar',
      uf: 'SP',
    })
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('exibe o aviso de localização aproximada quando a correspondência é parcial', async () => {
    services.geocodeAddress.mockResolvedValue(
      geocodeResult({
        goodMatch: false,
        approximate: true,
        addressDetails: {
          country: 'Brasil',
          countryCode: 'br',
          state: 'São Paulo',
          city: 'Cajamar',
          road: 'Rua de Teste',
          postcode: '07750-000',
        },
      }),
    )

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Localizar no mapa' }))

    expect(
      await screen.findByText(
        /Localização aproximada. Ajuste o marcador para indicar seu imóvel./i,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText('Geocodificado (aproximado)').length,
    ).toBeGreaterThan(0)
  })

  it('invalida o ponto antigo quando o endereço muda', async () => {
    repo.getMyAddress.mockResolvedValue(savedRecord)
    renderForm()

    await screen.findByRole('button', { name: 'Atualizar endereço' })
    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.356111)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Logradouro'), ' Nova')

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Latitude') as HTMLInputElement).value,
      ).toBe('')
    })
    expect(screen.getByTestId('map-picker')).toHaveAttribute(
      'data-latitude',
      '',
    )
    expect(screen.getByText(/Endereço alterado/i)).toBeInTheDocument()
    expect(
      screen.getAllByText('Sem ponto definido').length,
    ).toBeGreaterThan(0)
  })

  it('invalida o ponto antigo quando o CEP muda', async () => {
    repo.getMyAddress.mockResolvedValue(savedRecord)
    renderForm()

    await screen.findByRole('button', { name: 'Atualizar endereço' })
    expect(screen.getByLabelText('Longitude')).toHaveValue(-46.876944)

    const user = userEvent.setup()
    const cep = screen.getByLabelText('CEP')
    await user.clear(cep)
    await user.type(cep, '07751-000')

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Longitude') as HTMLInputElement).value,
      ).toBe('')
    })
    expect(screen.getByText(/Endereço alterado/i)).toBeInTheDocument()
  })

  it('descarta resposta atrasada de geocodificação de um endereço já editado', async () => {
    let resolveLateGeocode!: (value: GeocodeResult) => void

    services.geocodeAddress.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLateGeocode = resolve
      }),
    )

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Localizar no mapa' }))

    await waitFor(() => {
      expect(services.geocodeAddress).toHaveBeenCalledTimes(1)
    })

    const logradouro = screen.getByLabelText('Logradouro')
    await user.clear(logradouro)
    await user.type(logradouro, 'Rua Nova')

    await act(async () => {
      resolveLateGeocode(geocodeResult({ label: 'Resultado antigo' }))
      await Promise.resolve()
    })

    expect(
      (screen.getByLabelText('Latitude') as HTMLInputElement).value,
    ).toBe('')
    expect(screen.getByTestId('map-picker')).toHaveAttribute(
      'data-latitude',
      '',
    )
    expect(
      screen.queryByText(/Localização encontrada/i),
    ).not.toBeInTheDocument()
  })

  it('atualiza latitude e longitude quando o marcador é ajustado no mapa', async () => {
    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(
      screen.getByRole('button', { name: 'Ajustar ponto no mapa' }),
    )

    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.4)
    expect(screen.getByLabelText('Longitude')).toHaveValue(-46.85)
    expect(screen.getByTestId('map-picker')).toHaveAttribute(
      'data-latitude',
      '-23.4',
    )
    expect(
      screen.getByText(/Ponto ajustado manualmente/i),
    ).toBeInTheDocument()
  })

  it('avisa quando o CEP pertence a outro município', async () => {
    services.lookupCep.mockResolvedValue({
      cep: '01001-000',
      logradouro: 'Praça da Sé',
      complemento: '',
      bairro: 'Sé',
      localidade: 'São Paulo',
      uf: 'SP',
    })

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CEP'), '01001-000')
    await user.click(
      screen.getByRole('button', { name: 'Consultar CEP no ViaCEP' }),
    )

    expect(
      await screen.findByText(/Este aplicativo cobre Cajamar\/SP/i),
    ).toBeInTheDocument()
  })

  it('informa falha ao salvar e mantém as coordenadas confirmadas', async () => {
    repo.saveMyAddress.mockRejectedValue(new Error('falha de conexão'))

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(
      screen.getByRole('button', { name: 'Ajustar ponto no mapa' }),
    )
    await user.click(screen.getByLabelText(/Confirmo que o marcador/))
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }))

    expect(
      await screen.findByText(/Não foi possível salvar o endereço/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.4)
    expect(screen.getByTestId('map-picker')).toHaveAttribute(
      'data-latitude',
      '-23.4',
    )
  })

  it('usa a localização do GPS, mostra a precisão em metros e centraliza o mapa', async () => {
    geolocation.requestCurrentPosition.mockResolvedValue({
      latitude: -23.351234,
      longitude: -46.879876,
      accuracyMeters: 18,
    })

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Usar minha localização atual' }),
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue(-23.351234)
    })
    expect(screen.getByLabelText('Longitude')).toHaveValue(-46.879876)
    expect(screen.getByTestId('map-picker')).toHaveAttribute(
      'data-latitude',
      '-23.351234',
    )
    expect(
      screen.getAllByText('GPS (±18 m)').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/Localização do dispositivo obtida \(±18 m\)/),
    ).toBeInTheDocument()
    expect(screen.getByText('Precisão do GPS')).toBeInTheDocument()
    expect(screen.getByLabelText(/Confirmo que o marcador/)).not.toBeChecked()
    expect(
      screen.getByLabelText(/Confirmo que o marcador/),
    ).toBeEnabled()
  })

  it('explica a permissão de GPS negada sem apagar um ponto existente', async () => {
    geolocation.requestCurrentPosition.mockRejectedValue(
      new GeolocationError(
        'permission-denied',
        'Permissão de localização negada. Autorize o GPS nas configurações do navegador ou selecione o ponto no mapa.',
      ),
    )

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(
      screen.getByRole('button', { name: 'Ajustar ponto no mapa' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Usar minha localização atual' }),
    )

    expect(
      await screen.findByText(/Permissão de localização negada/i),
    ).toBeInTheDocument()
    // O ponto manual continua válido; a falha do GPS não inventa outro.
    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.4)
  })

  it('avisa que o GPS pode estar bloqueado em HTTP por IP da rede local', async () => {
    geolocation.getSecureContextInfo.mockReturnValue({
      isSecure: false,
      protocol: 'http:',
      hostname: '192.168.0.10',
      isLoopback: false,
      isPrivateNetwork: true,
      warning:
        'Você está acessando o aplicativo por um endereço de rede local via HTTP. O navegador só libera o GPS em HTTPS ou em localhost. Abra em http://localhost:5173, use HTTPS ou selecione o ponto no mapa.',
    })

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    expect(
      screen.getByText(/rede local via HTTP.*localhost/i),
    ).toBeInTheDocument()
  })

  it('salva o ponto do GPS como ajuste manual com a fonte do dispositivo', async () => {
    repo.saveMyAddress.mockResolvedValue({
      ...savedRecord,
      cep: '07750000',
      logradouro: 'Rua de Teste',
      numero: '10',
      bairro: 'Centro',
      latitude: -23.351234,
      longitude: -46.879876,
      precisao: 'ajustado_manual' as const,
      geocoding_fonte: 'gps-dispositivo',
      geocoding_label: 'Posição do dispositivo (±18 m)',
    })
    geolocation.requestCurrentPosition.mockResolvedValue({
      latitude: -23.351234,
      longitude: -46.879876,
      accuracyMeters: 18,
    })

    renderForm()
    await screen.findByRole('heading', { name: 'Meu endereço' })

    const user = await fillRequiredFields()
    await user.click(
      screen.getByRole('button', { name: 'Usar minha localização atual' }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue(-23.351234)
    })
    await user.click(screen.getByLabelText(/Confirmo que o marcador/))
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }))

    await waitFor(() => {
      expect(repo.saveMyAddress).toHaveBeenCalledTimes(1)
    })
    const [, , input] = repo.saveMyAddress.mock.calls[0]
    expect(input).toMatchObject({
      latitude: -23.351234,
      longitude: -46.879876,
      precisao: 'ajustado_manual',
      geocodingFonte: 'gps-dispositivo',
    })
  })
})
