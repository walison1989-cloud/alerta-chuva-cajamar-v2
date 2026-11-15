import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/AuthContext'
import type { AuthContextValue } from '@/auth/AuthContext'
import { LoginPage } from '@/pages/LoginPage'

function renderLogin(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    session: null,
    user: null,
    isLoading: false,
    isConfigured: true,
    signOut: vi.fn(async () => {}),
    ...overrides,
  }

  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/entrar']}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('LoginPage', () => {
  it('permite conferir e ocultar a senha sem perder o valor', async () => {
    const user = userEvent.setup()
    renderLogin()
    const password = screen.getByLabelText('Senha')
    await user.type(password, 'senha-de-teste')
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('senha-de-teste')
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveValue('senha-de-teste')
  })
  it('não exibe formulário fictício quando o Supabase não está configurado', () => {
    renderLogin({ isConfigured: false })

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(
      screen.getByText('Acesso à conta indisponível'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Criar conta' }),
    ).not.toBeInTheDocument()
  })

  it('exibe o formulário de login quando o Supabase está configurado', () => {
    renderLogin()

    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('permite alternar para o cadastro de morador', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(
      screen.getByRole('heading', { name: 'Criar conta de morador' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Criar conta' }),
    ).toBeInTheDocument()
  })

  it('mostra a conta conectada e permite sair', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => {})
    const userObject = {
      id: 'usuario-1',
      email: 'morador@teste.com',
    } as unknown as AuthContextValue['user']

    renderLogin({
      session: { user: userObject } as unknown as AuthContextValue['session'],
      user: userObject,
      signOut,
    })

    expect(
      screen.getByRole('heading', { name: 'Você já está conectado' }),
    ).toBeInTheDocument()
    expect(screen.getByText('morador@teste.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
