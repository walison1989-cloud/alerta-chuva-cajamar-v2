import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContatosPage } from './ContatosPage'

const state = vi.hoisted(() => ({ error: null as string | null, retry: vi.fn(async () => {}) }))
vi.mock('@/hooks/useContatos', () => ({ useContatos: () => ({
  contatos: [], contatoEmEdicao: null, isLoading: false, isRefreshing: false,
  error: state.error, isCreating: false, isUpdating: false, createError: null,
  updateError: null, deleteError: null, revokeError: null,
  carregarContatos: state.retry, selecionarContato: vi.fn(), criarContato: vi.fn(),
  atualizarContato: vi.fn(), excluirContato: vi.fn(), revogarConsentimento: vi.fn(), limparErros: vi.fn(),
}) }))

beforeEach(() => { state.error = null; state.retry.mockClear() })
describe('Contatos: erro não é lista vazia', () => {
  it('preserva a tentativa de recuperação e não afirma inexistência de contatos', async () => {
    state.error = 'Cadastro precisa de configuração. Código: 42703.'
    render(<MemoryRouter><ContatosPage /></MemoryRouter>)
    expect(screen.queryByText('Nenhum contato cadastrado')).not.toBeInTheDocument()
    expect(screen.queryByText('0 contato(s) cadastrado(s)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo contato' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(state.retry).toHaveBeenCalledOnce()
  })
  it('mostra cadastro inicial quando a consulta vazia teve sucesso', () => {
    render(<MemoryRouter><ContatosPage /></MemoryRouter>)
    expect(screen.getByText('Nenhum contato cadastrado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo contato' })).toBeEnabled()
  })
})
