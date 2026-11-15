import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MobileMenuButton, MobileMenuProvider } from './MobileMenu'

describe('Menu móvel acessível', () => {
  it('contém o foco, fecha por Escape e devolve o foco ao botão', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><MobileMenuProvider><MobileMenuButton /><main>Conteúdo</main></MobileMenuProvider></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'Abrir menu de navegação' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog')
    const close = within(dialog).getByRole('button', { name: 'Fechar menu' })
    await waitFor(() => expect(close).toHaveFocus())
    expect(screen.getByText('Conteúdo').parentElement).toHaveAttribute('inert')
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('link', { name: 'Ligar 199' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('fecha ao escolher a conta', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><MobileMenuProvider><MobileMenuButton /></MobileMenuProvider></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Abrir menu de navegação' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Minha conta' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
