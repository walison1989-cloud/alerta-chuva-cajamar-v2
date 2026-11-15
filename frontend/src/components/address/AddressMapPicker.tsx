import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { env } from '@/config/env'
import { isValidCoordinate } from '@/lib/addressValidation'
import { cn } from '@/lib/cn'

interface AddressMapPickerProps {
  latitude: number | null
  longitude: number | null
  onChange: (latitude: number, longitude: number) => void
  className?: string
}

const FOCUS_ZOOM = 16

/**
 * Mapa de ajuste do endereço. O marcador é movido por arraste ou por toque
 * no mapa. Nenhum dado é enviado ao OpenStreetMap além da requisição de tiles.
 *
 * O centro e o zoom são aplicados pela API do Leaflet (`setView`), não pela
 * prop `center`: um mapa já montado não se reposiciona apenas porque a prop
 * mudou. O efeito abaixo também invalida o tamanho do mapa, necessário quando
 * o contêiner estava oculto ou mudou de dimensão na transição responsiva.
 */
export function AddressMapPicker({
  latitude,
  longitude,
  onChange,
  className,
}: AddressMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: [env.municipality.latitude, env.municipality.longitude],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    })

    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 3,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map)

    map.on('click', (event: L.LeafletMouseEvent) => {
      onChangeRef.current(event.latlng.lat, event.latlng.lng)
    })

    // Em telas responsivas, o cartão pode mudar de altura depois da montagem.
    // Sem invalidateSize o Leaflet mantém o tamanho antigo e ignora o novo
    // centro/zoom até o próximo redimensionamento manual.
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => map.invalidateSize())

    resizeObserver?.observe(container)

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize()
    }, 120)

    return () => {
      window.clearTimeout(resizeTimer)
      resizeObserver?.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const hasPoint =
      latitude !== null &&
      longitude !== null &&
      isValidCoordinate(latitude, longitude)

    if (!hasPoint) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    const point: L.LatLngExpression = [latitude, longitude]
    const targetZoom = Math.max(map.getZoom(), FOCUS_ZOOM)

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: '',
        html: [
          '<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0b4f9c;border:3px solid #fff;box-shadow:0 4px 14px rgba(8,61,122,.45)">',
          '<div style="position:absolute;inset:8px;border-radius:9999px;background:#7dd3fc"></div>',
          '</div>',
        ].join(''),
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      })

      const marker = L.marker(point, {
        icon,
        draggable: true,
        keyboard: true,
        title: 'Arraste para ajustar a localização do imóvel',
        bubblingMouseEvents: false,
      }).addTo(map)

      marker.bindTooltip(
        'Arraste este marcador ou toque no mapa para ajustar o ponto.',
        { direction: 'top', offset: [0, -28] },
      )

      marker.on('dragend', () => {
        const position = marker.getLatLng()
        onChangeRef.current(position.lat, position.lng)
      })

      markerRef.current = marker
    } else {
      markerRef.current.setLatLng(point)
    }

    // Centraliza imediatamente e repete após o layout estabilizar. A segunda
    // chamada cobre o caso em que o mapa acabou de sair de um contêiner oculto.
    map.setView(point, targetZoom, { animate: false })

    const focusTimer = window.setTimeout(() => {
      map.invalidateSize()
      map.setView(point, targetZoom, { animate: false })
    }, 120)

    return () => {
      window.clearTimeout(focusTimer)
    }
  }, [latitude, longitude])

  return (
    <div
      ref={containerRef}
      className={cn('map-shell h-80 w-full', className)}
      role="region"
      aria-label="Mapa para confirmar a localização do endereço"
    />
  )
}
