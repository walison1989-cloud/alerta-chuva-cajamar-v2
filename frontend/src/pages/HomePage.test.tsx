import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '@/pages/HomePage'
import { buildOpenMeteoPayload } from '@/test/fixtures/weather'

vi.mock('@/components/map/CajamarMap', () => ({
  CajamarMap: () => <div data-testid="mapa-base" />,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    isLoading: false,
    isConfigured: true,
    signOut: async () => {},
  }),
}))

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renderiza a tela inicial com meteorologia real da fonte e avisos honestos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildOpenMeteoPayload(),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHome()

    expect(
      screen.getByRole('heading', { name: 'Como está Cajamar hoje?' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Consultar meu endereço/i }),
    ).toHaveAttribute('href', '/meu-endereco')
    expect(
      screen.getByRole('heading', { name: 'Monitore o seu imóvel' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Chuva observada' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Estações no mapa interativo')).toBeInTheDocument()
    expect(screen.getByText('Pluviômetros oficiais do CEMADEN')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Abrir mapa de estações/i }),
    ).toHaveAttribute('href', '/mapa')
    expect(
      screen.getByRole('heading', { name: 'Avisos oficiais' }),
    ).toBeInTheDocument()

    expect(await screen.findByText('Garoa leve')).toBeInTheDocument()
    expect(screen.getByText('Fonte: Open-Meteo')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(requestedUrl.origin).toBe('https://api.open-meteo.com')
    expect(requestedUrl.searchParams.get('timezone')).toBe('America/Sao_Paulo')
    expect(requestedUrl.searchParams.get('forecast_days')).toBe('3')
  })
})
