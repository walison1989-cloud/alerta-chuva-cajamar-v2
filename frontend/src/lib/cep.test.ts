import { afterEach, describe, expect, it, vi } from 'vitest'
import { CepLookupError, lookupCep } from '@/lib/cep'

function mockFetchResponse({
  ok = true,
  status = 200,
  body,
}: {
  ok?: boolean
  status?: number
  body: unknown
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('consulta de CEP (ViaCEP)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('consulta o CEP normalizado e devolve os campos do endereço', async () => {
    const fetchMock = mockFetchResponse({
      body: {
        cep: '07750-000',
        logradouro: 'Rua de Teste',
        complemento: '',
        bairro: 'Centro',
        localidade: 'Cajamar',
        uf: 'sp',
      },
    })

    const result = await lookupCep('07750-000')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toBe('https://viacep.com.br/ws/07750000/json/')
    expect(result).toMatchObject({
      logradouro: 'Rua de Teste',
      bairro: 'Centro',
      localidade: 'Cajamar',
      uf: 'SP',
    })
  })

  it('rejeita CEP com formato inválido sem chamar a rede', async () => {
    const fetchMock = mockFetchResponse({ body: {} })

    await expect(lookupCep('123')).rejects.toBeInstanceOf(CepLookupError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('traduz a resposta de CEP inexistente', async () => {
    mockFetchResponse({ body: { erro: true } })

    await expect(lookupCep('99999999')).rejects.toThrow(
      'CEP não encontrado. Confira os números.',
    )
  })

  it('traduz a falha HTTP do serviço', async () => {
    mockFetchResponse({ ok: false, status: 500, body: {} })

    await expect(lookupCep('07750000')).rejects.toThrow(
      'Não foi possível consultar o CEP agora',
    )
  })

  it('orienta o preenchimento manual quando a rede falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(lookupCep('07750000')).rejects.toThrow(
      'Preencha o endereço manualmente',
    )
  })
})
