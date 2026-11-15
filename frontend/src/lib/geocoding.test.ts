import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabase = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    functions: { invoke: supabase.invoke },
  }),
}))

import {
  buildGeocodeQuery,
  clearGeocodeCache,
  GeocodingError,
  geocodeAddress,
  parseGeocodeResponse,
} from '@/lib/geocoding'

const values = {
  cep: '07793240',
  logradouro: 'Rua Vereador João Cardoso',
  numero: '512',
  bairro: 'Jardim Mariana',
  complemento: '',
  municipio: 'Cajamar',
  uf: 'SP',
}

const exactPayload = {
  found: true,
  latitude: -23.4055123,
  longitude: -46.8488771,
  displayName:
    'Rua Vereador João Cardoso, 512, Jardim Mariana, Cajamar, SP, Brasil',
  goodMatch: true,
  addressDetails: {
    country: 'Brasil',
    countryCode: 'br',
    state: 'São Paulo',
    city: 'Cajamar',
    road: 'Rua Vereador João Cardoso',
    houseNumber: '512',
    postcode: '07793-240',
  },
  provider: 'opengeocoding.com',
  attribution: 'Data © OpenStreetMap contributors',
}

function htmlResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('geocodificação via Edge Function', () => {
  beforeEach(() => {
    clearGeocodeCache()
    supabase.invoke.mockReset()
  })

  it('monta a consulta com número, município, UF, CEP e país', () => {
    expect(buildGeocodeQuery(values)).toBe(
      'Rua Vereador João Cardoso, 512, Jardim Mariana, Cajamar, SP, 07793-240, Brasil',
    )
  })

  it('chama a função geocode-address e normaliza o resultado exato', async () => {
    supabase.invoke.mockResolvedValue({
      data: exactPayload,
      error: null,
    })

    const result = await geocodeAddress(values)

    expect(supabase.invoke).toHaveBeenCalledWith(
      'geocode-address',
      expect.objectContaining({
        body: {
          addressString:
            'Rua Vereador João Cardoso, 512, Jardim Mariana, Cajamar, SP, 07793-240, Brasil',
        },
        timeout: 15_000,
      }),
    )
    expect(result.latitude).toBe(-23.405512)
    expect(result.longitude).toBe(-46.848877)
    expect(result.goodMatch).toBe(true)
    expect(result.approximate).toBe(false)
    expect(result.provider).toBe('opengeocoding.com')
    expect(result.label).toContain('Rua Vereador João Cardoso')
  })

  it('marca como aproximada a correspondência parcial (goodMatch falso)', async () => {
    supabase.invoke.mockResolvedValue({
      data: {
        ...exactPayload,
        goodMatch: false,
        addressDetails: {
          ...exactPayload.addressDetails,
          houseNumber: undefined,
        },
      },
      error: null,
    })

    const result = await geocodeAddress(values)

    expect(result.goodMatch).toBe(false)
    expect(result.approximate).toBe(true)
  })

  it('trata goodMatch ausente como aproximado, sem presumir exatidão', async () => {
    supabase.invoke.mockResolvedValue({
      data: { ...exactPayload, goodMatch: undefined },
      error: null,
    })

    const result = await parseGeocodeResponse(
      { ...exactPayload, goodMatch: undefined },
      values,
    )

    expect(result.approximate).toBe(true)
  })

  it('orienta o ajuste manual quando nenhum ponto é encontrado', async () => {
    supabase.invoke.mockResolvedValue({
      data: {
        found: false,
        reason: 'not_found',
        message:
          'Nenhum ponto foi encontrado para este endereço. Ajuste os dados ou marque o local no mapa.',
      },
      error: null,
    })

    await expect(geocodeAddress(values)).rejects.toThrow(
      'Nenhum ponto foi encontrado',
    )
  })

  it('rejeita um ponto fora da área de Cajamar', async () => {
    supabase.invoke.mockResolvedValue({
      data: { ...exactPayload, latitude: 0, longitude: 0 },
      error: null,
    })

    await expect(geocodeAddress(values)).rejects.toThrow(
      'fora da área de Cajamar',
    )
  })

  it('rejeita resposta sem coordenadas válidas', async () => {
    supabase.invoke.mockResolvedValue({
      data: { found: true, displayName: 'Sem ponto' },
      error: null,
    })

    await expect(geocodeAddress(values)).rejects.toThrow(
      'não retornou coordenadas válidas',
    )
  })

  it('rejeita município diferente de Cajamar mesmo dentro da caixa', async () => {
    supabase.invoke.mockResolvedValue({
      data: {
        ...exactPayload,
        addressDetails: {
          ...exactPayload.addressDetails,
          city: 'Jundiaí',
        },
      },
      error: null,
    })

    await expect(geocodeAddress(values)).rejects.toThrow(
      'não a Cajamar',
    )
  })

  it('rejeita endereço fora do Brasil', async () => {
    supabase.invoke.mockResolvedValue({
      data: {
        ...exactPayload,
        addressDetails: {
          ...exactPayload.addressDetails,
          country: 'Portugal',
          countryCode: 'pt',
        },
      },
      error: null,
    })

    await expect(geocodeAddress(values)).rejects.toThrow('fora do Brasil')
  })

  it('traduz 401 em orientação de sessão', async () => {
    supabase.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        htmlResponse(401, { message: 'Sessão inválida.' }),
      ),
    })

    await expect(geocodeAddress(values)).rejects.toBeInstanceOf(GeocodingError)
    await expect(geocodeAddress(values)).rejects.toThrow('sessão expirou')
  })

  it('traduz 429 respeitando o Retry-After', async () => {
    supabase.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        htmlResponse(
          429,
          { message: 'Limite atingido.' },
          { 'Retry-After': '3' },
        ),
      ),
    })

    await expect(geocodeAddress(values)).rejects.toThrow('Aguarde 3 s')
  })

  it('traduz falha de conexão sem inventar coordenadas', async () => {
    supabase.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsFetchError({ message: 'network down' }),
    })

    await expect(geocodeAddress(values)).rejects.toThrow(
      'Não foi possível conectar',
    )
  })

  it('traduz falha do relay do Supabase', async () => {
    supabase.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsRelayError({ region: 'us-east-1' }),
    })

    await expect(geocodeAddress(values)).rejects.toThrow(
      'temporariamente indisponível',
    )
  })

  it('usa cache para consultas idênticas e evita gastar créditos', async () => {
    supabase.invoke.mockResolvedValue({
      data: exactPayload,
      error: null,
    })

    await geocodeAddress(values)
    await geocodeAddress(values)

    expect(supabase.invoke).toHaveBeenCalledTimes(1)
  })

  it('valida CEP e campos obrigatórios antes de chamar a função', async () => {
    await expect(
      geocodeAddress({ ...values, cep: '123' }),
    ).rejects.toThrow('CEP válido')

    await expect(
      geocodeAddress({ ...values, numero: '' }),
    ).rejects.toThrow('Preencha logradouro, número, bairro e município')

    expect(supabase.invoke).not.toHaveBeenCalled()
  })
})
