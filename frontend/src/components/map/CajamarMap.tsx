import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { env } from '@/config/env'
import { cn } from '@/lib/cn'
import { createMapBasemap } from '@/lib/mapBasemaps'

interface CajamarMapProps {
  className?: string
  interactive?: boolean
  zoom?: number
}

/**
 * Mapa base do município. O marcador é apenas o centro administrativo
 * aproximado (OpenStreetMap/Nominatim) e não representa risco, estação ou
 * imóvel. Camadas de estações e ocorrências entram nas etapas seguintes.
 */
export function CajamarMap({
  className,
  interactive = true,
  zoom = 12,
}: CajamarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: [env.municipality.latitude, env.municipality.longitude],
      zoom,
      zoomControl: interactive,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    })

    mapRef.current = map

    createMapBasemap().addTo(map)

    const markerIcon = L.divIcon({
      className: '',
      html: [
        '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0b4f9c;border:3px solid #ffffff;box-shadow:0 3px 12px rgba(8,61,122,.45)">',
        '<div style="position:absolute;inset:7px;border-radius:9999px;background:#7dd3fc"></div>',
        '</div>',
      ].join(''),
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28],
    })

    L.marker([env.municipality.latitude, env.municipality.longitude], {
      icon: markerIcon,
      title: 'Centro de Cajamar (ponto de referência)',
      keyboard: false,
    })
      .addTo(map)
      .bindPopup(
        '<strong>Centro de Cajamar</strong><br/>Ponto de referência aproximado. Não representa risco, estação pluviométrica ou imóvel.',
      )

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize()
    }, 120)

    return () => {
      window.clearTimeout(resizeTimer)
      map.remove()
      mapRef.current = null
    }
  }, [interactive, zoom])

  return (
    <div
      ref={containerRef}
      className={cn('map-shell h-64 w-full', className)}
      role="region"
      aria-label="Mapa de Cajamar"
    />
  )
}
