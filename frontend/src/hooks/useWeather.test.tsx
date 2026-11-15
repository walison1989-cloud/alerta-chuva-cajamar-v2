import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeather, clearPrivateWeatherCache } from '@/hooks/useWeather'
import { weatherDataFixture } from '@/test/fixtures/weather'
import type { WeatherData } from '@/types/weather'

const mocks = vi.hoisted(() => ({
  fetchWeather: vi.fn(),
}))

vi.mock('@/lib/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/weather')>()
  return {
    ...actual,
    fetchWeather: mocks.fetchWeather,
  }
})

function prepararRequisicaoAdiada() {
  let resolve!: (value: WeatherData) => void
  let reject!: (reason?: unknown) => void
  const signalRef: { current: AbortSignal | null } = { current: null }

  mocks.fetchWeather.mockImplementation((signal: AbortSignal) => {
    signalRef.current = signal
    return new Promise<WeatherData>((res, rej) => {
      resolve = res
      reject = rej
      signal.addEventListener(
        'abort',
        () => rej(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
    })
  })

  return {
    resolve: (value: WeatherData) => resolve(value),
    reject: (reason?: unknown) => reject(reason),
    signalRef,
  }
}

beforeEach(() => {
  clearPrivateWeatherCache()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('useWeather — compartilhamento de requisições', () => {
  it('não persiste coordenadas do imóvel em localStorage', async () => {
    const request = prepararRequisicaoAdiada()
    const hook = renderHook(() => useWeather({ latitude: -23.4001, longitude: -46.8001 }))
    request.resolve(weatherDataFixture)
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    expect(Object.keys(window.localStorage).some(key => key.includes(':imovel:'))).toBe(false)
    hook.unmount()
  })

  it('não mostra a previsão do ponto anterior quando muda de local offline', async () => {
    const request = prepararRequisicaoAdiada()
    const hook = renderHook(({ latitude }) => useWeather({ latitude, longitude: -46.8 }), {
      initialProps: { latitude: -23.4 },
    })
    request.resolve(weatherDataFixture)
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      hook.rerender({ latitude: -23.3 })
      await waitFor(() => expect(hook.result.current.data).toBeNull())
    } finally {
      online.mockRestore()
      hook.unmount()
    }
  })
  it('usa uma única requisição e não aborta o consumidor restante', async () => {
    const request = prepararRequisicaoAdiada()

    const primeiro = renderHook(() =>
      useWeather({ latitude: -23.4, longitude: -46.8 }),
    )
    const segundo = renderHook(() =>
      useWeather({ latitude: -23.4, longitude: -46.8 }),
    )

    await waitFor(() => expect(mocks.fetchWeather).toHaveBeenCalledTimes(1))

    // Desmontar um card não pode cancelar a consulta usada pelo outro.
    primeiro.unmount()
    expect(request.signalRef.current?.aborted).toBe(false)

    request.resolve(weatherDataFixture)

    await waitFor(() =>
      expect(segundo.result.current.data?.fetchedAt).toBe(
        weatherDataFixture.fetchedAt,
      ),
    )
    expect(request.signalRef.current?.aborted).toBe(false)

    segundo.unmount()
  })

  it('aborta a requisição compartilhada quando o último consumidor sai', async () => {
    const request = prepararRequisicaoAdiada()

    const { unmount } = renderHook(() =>
      useWeather({ latitude: -23.4, longitude: -46.8 }),
    )

    await waitFor(() => expect(mocks.fetchWeather).toHaveBeenCalledTimes(1))

    unmount()

    expect(request.signalRef.current?.aborted).toBe(true)
  })
})
