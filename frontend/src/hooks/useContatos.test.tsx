import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useContatos } from '@/hooks/useContatos'
import type { ContatoResume } from '@/types/contatos'

const contatoResume: ContatoResume = {
  id: 1,
  tipoContato: 'celular',
  nome: 'João Silva',
  telefone: '(11) 99999-9999',
  email: null,
  ativo: true,
  consentimento: true,
  verificado: false,
  versaoConsentimento: '1.0',
  revogado: false,
  preferencias: { interno: true, email: false, sms: false },
  elegivelParaNotificacao: true,
  dataCadastro: '2026-11-07T10:00:00.000Z',
}

const mocks = vi.hoisted(() => ({
  client: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })),
  },
  auth: {
    user: { id: 'usuario-teste-1' } as { id: string } | null,
    isLoading: false,
  },
  listarMeusContatos: vi.fn(),
  criarMeuContato: vi.fn(),
  atualizarMeuContato: vi.fn(),
  excluirMeuContato: vi.fn(),
  revogarConsentimentoContato: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => mocks.client,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mocks.auth,
}))

vi.mock('@/lib/contatos', () => ({
  listarMeusContatos: mocks.listarMeusContatos,
  criarMeuContato: mocks.criarMeuContato,
  atualizarMeuContato: mocks.atualizarMeuContato,
  excluirMeuContato: mocks.excluirMeuContato,
  revogarConsentimentoContato: mocks.revogarConsentimentoContato,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listarMeusContatos.mockResolvedValue([contatoResume])
  mocks.criarMeuContato.mockResolvedValue(true)
  mocks.atualizarMeuContato.mockResolvedValue(true)
  mocks.excluirMeuContato.mockResolvedValue(true)
  mocks.revogarConsentimentoContato.mockResolvedValue(true)
})

describe('useContatos', () => {
  it('carrega contatos do usuário na montagem', async () => {
    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.contatos).toHaveLength(1)
    expect(result.current.contatos[0].nome).toBe('João Silva')
    expect(mocks.listarMeusContatos).toHaveBeenCalled()
  })

  it('cria um contato com sucesso', async () => {
    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const ok = await result.current.criarContato({
      nome: 'Maria Souza',
      tipoContato: 'celular',
      telefone: '11988887777',
      email: '',
      canalInterno: true,
      canalEmail: false,
      canalSms: false,
      consentimento: true,
      versaoConsentimento: '1.0',
    })

    expect(ok).toBe(true)
    expect(mocks.criarMeuContato).toHaveBeenCalled()
  })

  it('atualiza um contato com sucesso', async () => {
    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const ok = await result.current.atualizarContato(1, {
      nome: 'João Atualizado',
    })

    expect(ok).toBe(true)
    expect(mocks.atualizarMeuContato).toHaveBeenCalled()
  })

  it('exclui um contato com sucesso', async () => {
    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const ok = await result.current.excluirContato(1)

    expect(ok).toBe(true)
    expect(mocks.excluirMeuContato).toHaveBeenCalled()
  })

  it('revoga consentimento com sucesso', async () => {
    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const ok = await result.current.revogarConsentimento(1)

    expect(ok).toBe(true)
    expect(mocks.revogarConsentimentoContato).toHaveBeenCalled()
  })

  it('retorna erro quando Supabase não está configurado', async () => {
    mocks.auth.user = null

    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let ok: boolean | null = null
    await act(async () => {
      ok = await result.current.criarContato({
        nome: 'Maria Souza',
        tipoContato: 'celular',
        telefone: '11988887777',
        email: '',
        canalInterno: true,
        canalEmail: false,
        canalSms: false,
        consentimento: true,
        versaoConsentimento: '1.0',
      })
    })

    expect(ok).toBe(false)
    expect(result.current.createError).toBeTruthy()
  })

  it('seleciona contato para edição', async () => {
    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.selecionarContato(contatoResume)
    })

    expect(result.current.contatoEmEdicao).toBe(contatoResume)
  })

  it('limpa erros', async () => {
    const { result } = renderHook(() => useContatos())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.limparErros()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.createError).toBeNull()
    expect(result.current.updateError).toBeNull()
    expect(result.current.deleteError).toBeNull()
  })
})
