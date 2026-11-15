import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const leaflet = vi.hoisted(() => {
  const map = {
    setView: vi.fn(),
    invalidateSize: vi.fn(),
    getZoom: vi.fn(() => 13),
    on: vi.fn(),
    remove: vi.fn(),
  }

  const marker = {
    addTo: vi.fn(),
    bindTooltip: vi.fn(),
    on: vi.fn(),
    getLatLng: vi.fn(() => ({ lat: -23.4, lng: -46.85 })),
    setLatLng: vi.fn(),
    remove: vi.fn(),
  }
  marker.addTo.mockReturnValue(marker)

  const tileLayer = { addTo: vi.fn() }
  tileLayer.addTo.mockReturnValue(tileLayer)

  const L = {
    map: vi.fn((_container?: unknown, _options?: unknown) => map),
    tileLayer: vi.fn((_url?: unknown, _options?: unknown) => tileLayer),
    divIcon: vi.fn((_options?: unknown) => ({})),
    marker: vi.fn((_point?: unknown, _options?: unknown) => marker),
  }

  return { L, map, marker, tileLayer }
})

vi.mock('leaflet', () => ({ default: leaflet.L }))

import { AddressMapPicker } from '@/components/address/AddressMapPicker'

function lastHandler(
  registration: ReturnType<typeof vi.fn>,
  event: string,
): (argument?: unknown) => void {
  const call = [...registration.mock.calls]
    .reverse()
    .find(([name]) => name === event)
  expect(call).toBeDefined()
  return call![1] as (argument?: unknown) => void
}

describe('AddressMapPicker', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('cria o mapa no centro do município sem marcador quando não há ponto', () => {
    render(<AddressMapPicker latitude={null} longitude={null} onChange={vi.fn()} />)

    expect(leaflet.L.map).toHaveBeenCalledTimes(1)
    expect(leaflet.L.map.mock.calls[0][1]).toMatchObject({ zoom: 13 })
    expect(leaflet.L.marker).not.toHaveBeenCalled()
  })

  it('centraliza pela API do Leaflet e posiciona o marcador ao receber coordenadas', () => {
    const { rerender } = render(
      <AddressMapPicker latitude={null} longitude={null} onChange={vi.fn()} />,
    )

    rerender(
      <AddressMapPicker
        latitude={-23.406341}
        longitude={-46.862282}
        onChange={vi.fn()}
      />,
    )

    expect(leaflet.L.marker).toHaveBeenCalledTimes(1)
    expect(leaflet.L.marker.mock.calls[0][0]).toEqual([
      -23.406341, -46.862282,
    ])
    // A prop `center` não existe: o mapa já montado é reposicionado por
    // setView, com zoom de detalhe.
    expect(leaflet.map.setView).toHaveBeenCalledWith(
      [-23.406341, -46.862282],
      16,
      { animate: false },
    )
  })

  it('move o marcador existente ao receber um novo ponto', () => {
    const { rerender } = render(
      <AddressMapPicker
        latitude={-23.406341}
        longitude={-46.862282}
        onChange={vi.fn()}
      />,
    )

    rerender(
      <AddressMapPicker
        latitude={-23.35}
        longitude={-46.87}
        onChange={vi.fn()}
      />,
    )

    expect(leaflet.L.marker).toHaveBeenCalledTimes(1)
    expect(leaflet.marker.setLatLng).toHaveBeenCalledWith([-23.35, -46.87])
    expect(leaflet.map.setView).toHaveBeenLastCalledWith(
      [-23.35, -46.87],
      16,
      { animate: false },
    )
  })

  it('propaga o arraste do marcador para o formulário', () => {
    const onChange = vi.fn()
    render(
      <AddressMapPicker
        latitude={-23.406341}
        longitude={-46.862282}
        onChange={onChange}
      />,
    )

    const dragEnd = lastHandler(leaflet.marker.on, 'dragend')
    act(() => {
      dragEnd()
    })

    expect(onChange).toHaveBeenCalledWith(-23.4, -46.85)
  })

  it('propaga o clique no mapa como novo ponto', () => {
    const onChange = vi.fn()
    render(
      <AddressMapPicker latitude={null} longitude={null} onChange={onChange} />,
    )

    const click = lastHandler(leaflet.map.on, 'click')
    act(() => {
      click({ latlng: { lat: -23.37, lng: -46.83 } })
    })

    expect(onChange).toHaveBeenCalledWith(-23.37, -46.83)
  })

  it('remove o marcador quando o ponto é invalidado', () => {
    const { rerender } = render(
      <AddressMapPicker
        latitude={-23.406341}
        longitude={-46.862282}
        onChange={vi.fn()}
      />,
    )

    rerender(
      <AddressMapPicker latitude={null} longitude={null} onChange={vi.fn()} />,
    )

    expect(leaflet.marker.remove).toHaveBeenCalled()
  })
})
