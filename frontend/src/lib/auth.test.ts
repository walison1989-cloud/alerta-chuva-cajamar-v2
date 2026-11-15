import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: authMocks }),
}))

import {
  AuthError,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
} from '@/lib/auth'

const credentials = {
  nome: 'Morador Teste',
  email: 'Morador@Teste.com ',
  password: 'senha-segura',
  consentimentoLgpd: true,
}

describe('autenticação Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exige consentimento LGPD antes de criar a conta', async () => {
    await expect(
      signUpWithPassword({ ...credentials, consentimentoLgpd: false }),
    ).rejects.toBeInstanceOf(AuthError)

    expect(authMocks.signUp).not.toHaveBeenCalled()
  })

  it('cria a conta com metadados de nome e consentimento', async () => {
    authMocks.signUp.mockResolvedValue({ data: { session: null }, error: null })

    const result = await signUpWithPassword(credentials)

    expect(result.needsEmailConfirmation).toBe(true)
    expect(authMocks.signUp).toHaveBeenCalledWith({
      email: 'morador@teste.com',
      password: 'senha-segura',
      options: {
        data: {
          nome: 'Morador Teste',
          consentimento_lgpd: true,
        },
        emailRedirectTo: expect.stringContaining('/entrar?confirmado=1'),
      },
    })
  })

  it('rejeita e-mail inválido e senha curta', async () => {
    await expect(
      signUpWithPassword({ ...credentials, email: 'sem-arroba' }),
    ).rejects.toThrow('e-mail válido')

    await expect(
      signUpWithPassword({ ...credentials, password: '123' }),
    ).rejects.toThrow('pelo menos 8 caracteres')

    expect(authMocks.signUp).not.toHaveBeenCalled()
  })

  it('traduz credenciais inválidas no login', async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })

    await expect(
      signInWithPassword('morador@teste.com', 'senha-errada'),
    ).rejects.toThrow('E-mail ou senha incorretos.')
  })

  it('traduz e-mail não confirmado', async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      error: { message: 'Email not confirmed' },
    })

    await expect(
      signInWithPassword('morador@teste.com', 'senha-segura'),
    ).rejects.toThrow('Confirme seu e-mail antes de entrar.')
  })

  it('solicita recuperação com redirecionamento para a rota dedicada', async () => {
    authMocks.resetPasswordForEmail.mockResolvedValue({ error: null })

    await requestPasswordReset('morador@teste.com')

    expect(authMocks.resetPasswordForEmail).toHaveBeenCalledWith(
      'morador@teste.com',
      { redirectTo: expect.stringContaining('/redefinir-senha') },
    )
  })

  it('atualiza a senha somente quando ela tem tamanho mínimo', async () => {
    await expect(updatePassword('123')).rejects.toThrow(
      'pelo menos 8 caracteres',
    )
    expect(authMocks.updateUser).not.toHaveBeenCalled()

    authMocks.updateUser.mockResolvedValue({ error: null })
    await updatePassword('nova-senha-segura')

    expect(authMocks.updateUser).toHaveBeenCalledWith({
      password: 'nova-senha-segura',
    })
  })

  it('informa falha ao encerrar a sessão', async () => {
    authMocks.signOut.mockResolvedValue({ error: { message: 'network' } })

    await expect(signOut()).rejects.toThrow(
      'Não foi possível encerrar a sessão',
    )
  })
})
