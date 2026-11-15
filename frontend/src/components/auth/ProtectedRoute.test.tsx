import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '@/auth/AuthContext'
import type { AuthContextValue } from '@/auth/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

function renderProtected(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    session: null,
    user: null,
    isLoading: false,
    isConfigured: true,
    signOut: async () => {},
    ...overrides,
  }

  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/meu-endereco']}>
        <Routes>
          <Route
            path="/meu-endereco"
            element={
              <ProtectedRoute>
                <p>Conteúdo privado</p>
              </ProtectedRoute>
            }
          />
          <Route path="/entrar" element={<p>Tela de login</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ProtectedRoute', () => {
  it('explica a configuração pendente quando o Supabase não está configurado', () => {
    renderProtected({ isConfigured: false })

    expect(
      screen.getByRole('heading', { name: 'Acesso à conta indisponível' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument()
  })

  it('mostra o estado de verificação durante o carregamento da sessão', () => {
    renderProtected({ isLoading: true })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Verificando sua sessão',
    )
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument()
  })

  it('redireciona para o login quando não há sessão', () => {
    renderProtected()

    expect(screen.getByText('Tela de login')).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument()
  })

  it('libera o conteúdo privado quando existe sessão', () => {
    const user = {
      id: 'usuario-1',
      email: 'morador@teste.com',
    } as unknown as AuthContextValue['user']

    renderProtected({
      session: { user } as unknown as AuthContextValue['session'],
      user,
    })

    expect(screen.getByText('Conteúdo privado')).toBeInTheDocument()
    expect(screen.queryByText('Tela de login')).not.toBeInTheDocument()
  })
})
