import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ForecastCard } from '@/components/home/ForecastCard'
import { weatherQueryFixture } from '@/test/fixtures/weather'

describe('ForecastCard', () => {
  it('identifica a previsão e não a confunde com chuva observada', () => {
    render(<ForecastCard weather={weatherQueryFixture} />)

    expect(screen.getByText('Previsão de chuva')).toBeInTheDocument()
    expect(screen.getByText('Previsão')).toBeInTheDocument()
    expect(
      screen.getByText('Modelo Open-Meteo · não é chuva observada'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Modelo Open-Meteo · não é chuva observada'),
    ).toBeVisible()
  })

  it('mostra o acumulado das próximas 24 horas e a previsão diária', () => {
    render(<ForecastCard weather={weatherQueryFixture} />)

    expect(screen.getByText('Próximas 24 h')).toBeInTheDocument()
    expect(screen.getByText('24,0 mm')).toBeInTheDocument()
    expect(screen.getByText('Hoje')).toBeInTheDocument()
    expect(screen.getByText('Amanhã')).toBeInTheDocument()
  })

  it('exibe erro explícito quando não há dados', () => {
    render(
      <ForecastCard
        weather={{
          ...weatherQueryFixture,
          data: null,
          error: 'Serviço indisponível para teste.',
          isLoading: false,
        }}
      />,
    )

    expect(screen.getByText('Previsão indisponível')).toBeInTheDocument()
    expect(
      screen.getByText('Serviço indisponível para teste.'),
    ).toBeInTheDocument()
  })
})
