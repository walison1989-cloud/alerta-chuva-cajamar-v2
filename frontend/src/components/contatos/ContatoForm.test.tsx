import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContatoForm } from './ContatoForm'

describe('ContatoForm: recuperação de erros', () => {
  it('associa rótulos, mantém valores e foca o primeiro campo inválido', async () => {
    const user = userEvent.setup()
    const onSalvar = vi.fn(async () => true)
    render(<ContatoForm contato={null} onSalvar={onSalvar} onCancelar={vi.fn()} isSaving={false} saveError={null} />)
    const phone = screen.getByLabelText(/Celular com DDD/)
    await user.type(phone, '11')
    await user.click(screen.getByRole('button', { name: 'Cadastrar contato' }))
    await waitFor(() => expect(screen.getByLabelText(/^Nome/)).toHaveFocus())
    expect(phone).toHaveValue('11')
    expect(onSalvar).not.toHaveBeenCalled()
  })

  it('impede alterações durante o salvamento', () => {
    render(<ContatoForm contato={null} onSalvar={vi.fn(async () => true)} onCancelar={vi.fn()} isSaving saveError={null} />)
    expect(screen.getByLabelText(/^Nome/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fechar formulário' })).toBeDisabled()
    expect(screen.getByLabelText('Receber avisos internos no aplicativo')).toBeDisabled()
  })
})
