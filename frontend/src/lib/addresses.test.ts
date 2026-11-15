import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AddressRepositoryError,
  getMyAddress,
  listMyAddressVersions,
  saveMyAddress,
} from '@/lib/addresses'

interface ChainMock {
  table: string | null
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

function createClient() {
  const state: ChainMock = {
    table: null,
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    upsert: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  }

  const chain = {
    select: state.select.mockImplementation(() => chain),
    eq: state.eq.mockImplementation(() => chain),
    order: state.order.mockImplementation(() => chain),
    limit: state.limit.mockImplementation(() => chain),
    upsert: state.upsert.mockImplementation(() => chain),
    maybeSingle: state.maybeSingle,
    single: state.single,
  }

  const client = {
    from: vi.fn((table: string) => {
      state.table = table
      return chain
    }),
  }

  return { client: client as unknown as SupabaseClient, state, chain, from: client.from }
}

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
  precisao: 'ajustado_manual',
  geocoding_fonte: null,
  geocoding_label: null,
  consentimento_lgpd: true,
  created_at: '2026-11-05T12:00:00Z',
  updated_at: '2026-11-05T12:00:00Z',
}

const addressInput = {
  cep: '07750-000',
  logradouro: '  Rua de Teste  ',
  numero: ' 10 ',
  bairro: ' Centro ',
  complemento: '',
  municipio: ' Cajamar ',
  uf: 'sp',
  latitude: -23.3561114,
  longitude: -46.8769446,
  precisao: 'ajustado_manual' as const,
  geocodingFonte: null,
  geocodingLabel: null,
}

describe('repositório de endereços', () => {
  it('busca apenas o endereço do usuário autenticado', async () => {
    const { client, state, from } = createClient()
    state.maybeSingle.mockResolvedValue({ data: savedRecord, error: null })

    const result = await getMyAddress(client, 'usuario-1')

    expect(from).toHaveBeenCalledWith('enderecos')
    expect(state.eq).toHaveBeenCalledWith('usuario_id', 'usuario-1')
    expect(result).toEqual(savedRecord)
  })

  it('propaga uma mensagem segura quando a leitura falha', async () => {
    const { client, state } = createClient()
    state.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'detalhe interno do banco' },
    })

    await expect(getMyAddress(client, 'usuario-1')).rejects.toThrow(
      'Não foi possível carregar seu endereço',
    )
  })

  it('cria ou atualiza o endereço normalizando campos e coordenadas', async () => {
    const { client, state } = createClient()
    state.single.mockResolvedValue({ data: savedRecord, error: null })

    const result = await saveMyAddress(client, 'usuario-1', addressInput)
    const [payload, options] = state.upsert.mock.calls[0]

    expect(options).toEqual({ onConflict: 'usuario_id' })
    expect(payload).toMatchObject({
      usuario_id: 'usuario-1',
      cep: '07750000',
      logradouro: 'Rua de Teste',
      numero: '10',
      bairro: 'Centro',
      complemento: null,
      municipio: 'Cajamar',
      uf: 'SP',
      latitude: -23.356111,
      longitude: -46.876945,
      precisao: 'ajustado_manual',
      consentimento_lgpd: true,
    })
    expect(payload).not.toHaveProperty('localizacao')
    expect(result).toEqual(savedRecord)
  })

  it('envia latitude e longitude na ordem do contrato e delega o PostGIS ao banco', async () => {
    const { client, state } = createClient()
    state.single.mockResolvedValue({ data: savedRecord, error: null })

    await saveMyAddress(client, 'usuario-1', addressInput)
    const [payload] = state.upsert.mock.calls[0]

    // O trigger do banco monta POINT(longitude latitude) a partir destas duas
    // colunas. Inverter os valores criaria um ponto no hemisfério errado.
    expect(payload.latitude).toBe(-23.356111)
    expect(payload.longitude).toBe(-46.876945)
    expect(payload).not.toHaveProperty('localizacao')
    expect(Object.keys(payload)).not.toContain('localizacao')
  })

  it('impede salvar sem coordenadas', async () => {
    const { client, state } = createClient()

    await expect(
      saveMyAddress(client, 'usuario-1', {
        ...addressInput,
        latitude: null,
        longitude: null,
      }),
    ).rejects.toBeInstanceOf(AddressRepositoryError)

    expect(state.upsert).not.toHaveBeenCalled()
  })

  it('traduz falta de permissão em mensagem de sessão', async () => {
    const { client, state } = createClient()
    state.single.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'row-level security' },
    })

    await expect(
      saveMyAddress(client, 'usuario-1', addressInput),
    ).rejects.toThrow('Sem permissão para salvar este endereço')
  })

  it('lista somente as versões do próprio usuário, da mais recente para a mais antiga', async () => {
    const { client, state, from } = createClient()
    state.limit.mockResolvedValue({
      data: [
        {
          id: 2,
          operacao: 'UPDATE',
          alterado_em: '2026-11-05T13:00:00Z',
          precisao: 'ajustado_manual',
          geocoding_fonte: null,
        },
      ],
      error: null,
    })

    const versions = await listMyAddressVersions(client, 'usuario-1', 5)

    expect(from).toHaveBeenCalledWith('versoes_endereco')
    expect(state.eq).toHaveBeenCalledWith('usuario_id', 'usuario-1')
    expect(state.order).toHaveBeenCalledWith('alterado_em', {
      ascending: false,
    })
    expect(state.limit).toHaveBeenCalledWith(5)
    expect(versions).toHaveLength(1)
  })
})
