import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DemoPage } from '@/pages/DemoPage'
import { buildOpenMeteoPayload } from '@/test/fixtures/weather'

vi.mock('@/components/map/CajamarMap', () => ({
  CajamarMap: () => <div data-testid="mapa-demo" />,
}))

function stubWeather() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => buildOpenMeteoPayload(),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('DemoPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('separa simulação de dados reais e identifica o aviso', async () => {
    const fetchMock = stubWeather()

    render(<DemoPage />)

    expect(
      screen.getByRole('heading', {
        name: 'Laboratório de chuva e indicadores',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('DEMONSTRAÇÃO').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/DADOS SIMULADOS/)).toBeInTheDocument()
    expect(screen.getByText('Nenhum alerta real')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma notificação')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Indicadores simulados' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Mapa de Cajamar' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('mapa-demo')).toBeInTheDocument()

    expect(await screen.findByText('Garoa leve')).toBeInTheDocument()
    expect(screen.getByText('Fonte: Open-Meteo')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(requestedUrl.origin).toBe('https://api.open-meteo.com')
    expect(requestedUrl.searchParams.get('timezone')).toBe('America/Sao_Paulo')
  })

  it('troca o cenário e atualiza a classificação simulada', async () => {
    stubWeather()
    const user = userEvent.setup()

    render(<DemoPage />)

    expect(screen.getByText('Cenário moderado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Temporal/ }))

    expect(
      screen.getByRole('button', { name: /Temporal/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Cenário crítico')).toBeInTheDocument()
    expect(screen.getAllByText('Muito forte').length).toBeGreaterThanOrEqual(2)
  })

  it('ativa o modo manual ao mover um controle e restaura o padrão', async () => {
    stubWeather()
    const user = userEvent.setup()

    render(<DemoPage />)

    fireEvent.change(screen.getByLabelText('Chuva agora'), {
      target: { value: '0' },
    })

    expect(screen.getByText('Sem chuva')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Chuva moderada/ }),
    ).toHaveAttribute('aria-pressed', 'false')

    await user.click(
      screen.getByRole('button', { name: /Restaurar cenário padrão/ }),
    )

    expect(
      screen.getByRole('button', { name: /Chuva moderada/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Cenário moderado')).toBeInTheDocument()
  })
})
