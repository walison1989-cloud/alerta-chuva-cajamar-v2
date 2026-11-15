import { describe, expect, it, vi } from 'vitest'
import {
  describeSecureContext,
  formatAccuracy,
  GeolocationError,
  requestCurrentPosition,
} from '@/lib/geolocation'

function fakeGeolocation(
  implementation: (
    success: PositionCallback,
    error: PositionErrorCallback,
  ) => void,
): Geolocation {
  return {
    getCurrentPosition: vi.fn(implementation),
  } as unknown as Geolocation
}

function position(
  latitude: number,
  longitude: number,
  accuracy: number,
): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition
}

function positionError(code: number): GeolocationPositionError {
  return { code, message: 'erro', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
}

describe('contexto seguro para GPS', () => {
  it('trata localhost em HTTP como contexto seguro', () => {
    const info = describeSecureContext({
      isSecureContext: true,
      protocol: 'http:',
      hostname: 'localhost',
    })

    expect(info.isSecure).toBe(true)
    expect(info.isLoopback).toBe(true)
    expect(info.warning).toBeNull()
  })

  it('avisa quando o acesso é por IP de rede local em HTTP', () => {
    const info = describeSecureContext({
      isSecureContext: false,
      protocol: 'http:',
      hostname: '192.168.0.10',
    })

    expect(info.isSecure).toBe(false)
    expect(info.isPrivateNetwork).toBe(true)
    expect(info.warning).toContain('rede local via HTTP')
    expect(info.warning).toContain('localhost')
  })

  it('avisa sobre HTTP remoto sem tratar como rede local', () => {
    const info = describeSecureContext({
      isSecureContext: false,
      protocol: 'http:',
      hostname: 'exemplo.com',
    })

    expect(info.isPrivateNetwork).toBe(false)
    expect(info.warning).toContain('HTTPS')
  })

  it('não avisa em HTTPS', () => {
    const info = describeSecureContext({
      isSecureContext: true,
      protocol: 'https:',
      hostname: 'alerta.exemplo.com',
    })

    expect(info.isSecure).toBe(true)
    expect(info.warning).toBeNull()
  })
})

describe('requestCurrentPosition', () => {
  it('devolve latitude, longitude e precisão do dispositivo', async () => {
    const geolocation = fakeGeolocation((success) => {
      success(position(-23.3561111, -46.8769444, 12.4))
    })

    const result = await requestCurrentPosition({
      geolocation,
      isSecureContext: true,
    })

    expect(result).toEqual({
      latitude: -23.3561111,
      longitude: -46.8769444,
      accuracyMeters: 12,
    })
    expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      }),
    )
  })

  it('rejeita quando a permissão é negada', async () => {
    const geolocation = fakeGeolocation((_success, error) => {
      error(positionError(1))
    })

    await expect(
      requestCurrentPosition({ geolocation, isSecureContext: true }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: expect.stringContaining('Permissão de localização negada'),
    })
  })

  it('rejeita quando a localização está indisponível', async () => {
    const geolocation = fakeGeolocation((_success, error) => {
      error(positionError(2))
    })

    await expect(
      requestCurrentPosition({ geolocation, isSecureContext: true }),
    ).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('rejeita por timeout', async () => {
    const geolocation = fakeGeolocation((_success, error) => {
      error(positionError(3))
    })

    await expect(
      requestCurrentPosition({ geolocation, isSecureContext: true }),
    ).rejects.toMatchObject({ code: 'timeout' })
  })

  it('rejeita sem GPS disponível', async () => {
    await expect(
      requestCurrentPosition({ geolocation: null, isSecureContext: true }),
    ).rejects.toMatchObject({ code: 'unsupported' })
  })

  it('não chama o navegador em contexto inseguro', async () => {
    const geolocation = fakeGeolocation(() => {
      throw new Error('não deveria ser chamado')
    })

    await expect(
      requestCurrentPosition({ geolocation, isSecureContext: false }),
    ).rejects.toBeInstanceOf(GeolocationError)
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('rejeita coordenadas inválidas em vez de inventar um ponto', async () => {
    const geolocation = fakeGeolocation((success) => {
      success(position(Number.NaN, -46.87, 10))
    })

    await expect(
      requestCurrentPosition({ geolocation, isSecureContext: true }),
    ).rejects.toMatchObject({ code: 'invalid-position' })
  })
})

describe('formatAccuracy', () => {
  it('formata metros e quilômetros sem tratar ausência como zero', () => {
    expect(formatAccuracy(null)).toBeNull()
    expect(formatAccuracy(0)).toBe('precisão não informada')
    expect(formatAccuracy(12.6)).toBe('±13 m')
    expect(formatAccuracy(1500)).toMatch(/±1,5 km/)
  })
})
