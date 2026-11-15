import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OfficialAlertsCard } from '@/components/home/OfficialAlertsCard'

describe('OfficialAlertsCard', () => {
  it('não afirma que existe um canal oficial integrado', () => {
    render(<OfficialAlertsCard />)

    expect(screen.getByText('Avisos oficiais')).toBeInTheDocument()
    expect(screen.getByText('Sem canal integrado')).toBeInTheDocument()
    expect(
      screen.getByText(/não emite alertas oficiais nesta etapa/i),
    ).toBeInTheDocument()
  })

  it('apresenta os canais oficiais externos com segurança', () => {
    render(<OfficialAlertsCard />)

    const cemaden = screen.getByRole('link', { name: /CEMADEN/i })
    expect(cemaden).toHaveAttribute('href', 'https://www.cemaden.gov.br/')
    expect(cemaden).toHaveAttribute('target', '_blank')
    expect(cemaden).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('oferece os números de emergência', () => {
    render(<OfficialAlertsCard />)

    expect(
      screen.getByRole('link', { name: 'Defesa Civil: 199' }),
    ).toHaveAttribute('href', 'tel:199')
    expect(
      screen.getByRole('link', { name: 'Bombeiros: 193' }),
    ).toHaveAttribute('href', 'tel:193')
  })
})
