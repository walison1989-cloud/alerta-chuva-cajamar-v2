import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { env } from '@/config/env'
import { cn } from '@/lib/cn'
import {
  classifyRain,
  formatDistanceKm,
  formatRainValue,
  getRainReadingStatus,
} from '@/lib/rain'
import {
  SUSCETIBILIDADE_META,
  describeTipoSuscetibilidade,
  formatAreaSuscetibilidade,
} from '@/lib/suscetibilidade'
import { formatDateTime } from '@/lib/format'
import type { PublicOccurrence, RainLevel, RainStation } from '@/types/rain'
import type { SuscetibilidadeClasse, SuscetibilidadeFeature } from '@/types/suscetibilidade'
import type { RainLayerVisibility } from '@/components/map/LayerControls'
import { createMapBasemap } from '@/lib/mapBasemaps'

const LEVEL_COLORS: Record<RainLevel, string> = {
  'sem-leitura': '#cbd5e1',
  zero: '#64748b',
  leve: '#38bdf8',
  moderada: '#f59e0b',
  forte: '#dc2626',
}

const OCCURRENCE_LABELS: Record<string, string> = {
  alagamento: 'Alagamento',
  transbordamento: 'Transbordamento',
  deslizamento: 'Deslizamento',
  outro: 'Outro',
}

export interface PrivateMapAddress {
  latitude: number
  longitude: number
  label: string
}

interface RainMapProps {
  stations: RainStation[]
  selectedKey: string | null
  onSelect: (key: string) => void
  layers: RainLayerVisibility
  occurrences: PublicOccurrence[]
  suscetibilidade: SuscetibilidadeFeature[]
  address: PrivateMapAddress | null
  /** Incrementado pelo botão “Centralizar no imóvel”. */
  centerRequest?: number
  className?: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildStationIcon(
  station: RainStation,
  selected: boolean,
  showRain: boolean,
): L.DivIcon {
  const level = classifyRain(station.accumulatedMm)
  const color = showRain ? LEVEL_COLORS[level] : '#0b4f9c'
  const size = selected ? 34 : 27
  const value =
    station.accumulatedMm === null
      ? '—'
      : new Intl.NumberFormat('pt-BR', {
          maximumFractionDigits: 1,
        }).format(station.accumulatedMm)
  const border = selected ? '3px solid #0b4f9c' : '2px solid #ffffff'
  const shadow = selected
    ? '0 0 0 4px rgba(11,79,156,.22),0 4px 12px rgba(15,23,42,.35)'
    : '0 2px 7px rgba(15,23,42,.35)'
  const nameLabel = selected
    ? `<div style="margin-top:3px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:5px;background:rgba(255,255,255,.96);padding:1px 5px;font-size:10px;font-weight:700;color:#0f172a;box-shadow:0 1px 4px rgba(15,23,42,.2)">${escapeHtml(station.name)}</div>`
    : ''
  const valueLabel = showRain
    ? `<span style="font-size:${selected ? 10 : 9}px;font-weight:700;color:#ffffff;line-height:1">${escapeHtml(value)}</span>`
    : '<span style="width:7px;height:7px;border-radius:9999px;background:#ffffff;display:block"></span>'

  return L.divIcon({
    className: '',
    html: [
      `<div style="display:flex;flex-direction:column;align-items:center;width:${size}px">`,
      `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:${border};box-shadow:${shadow};display:flex;align-items:center;justify-content:center">`,
      valueLabel,
      '</div>',
      nameLabel,
      '</div>',
    ].join(''),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

function buildStationPopup(station: RainStation): string {
  const reading = getRainReadingStatus(station)
  const location = [station.municipality, station.state]
    .filter(Boolean)
    .join('/')
  const distance =
    station.distanceKm === null
      ? 'não calculada'
      : formatDistanceKm(station.distanceKm)

  return [
    '<div style="min-width:200px;max-width:250px">',
    `<strong style="font-size:13px;color:#0f172a">${escapeHtml(station.name)}</strong>`,
    `<div style="font-size:10px;color:#64748b;margin-top:1px">Código ${escapeHtml(station.code)}${location ? ` · ${escapeHtml(location)}` : ''}</div>`,
    `<div style="margin-top:7px;font-size:12px;font-weight:700;color:#0f172a">${escapeHtml(formatRainValue(station))}</div>`,
    `<div style="font-size:10px;color:#475569">${station.catalogueOnly ? 'Somente catálogo. Sem medição atual; operação não confirmada.' : station.windowHours ? `Acumulado em ${station.windowHours} h informado pela fonte` : 'Janela de acumulação não informada'}</div>`,
    `<div style="margin-top:6px;padding:5px 7px;border-radius:7px;background:${reading.state === 'ok' ? '#ecfdf5' : '#fffbeb'};font-size:10px;line-height:1.4;color:#334155">${escapeHtml(reading.label)}<br/>${escapeHtml(reading.detail)}</div>`,
    `<div style="margin-top:6px;font-size:10px;color:#475569">Leitura: ${escapeHtml(formatDateTime(station.lastReadingAt))}</div>`,
    `<div style="font-size:10px;color:#475569">Coleta: ${escapeHtml(formatDateTime(station.lastCollectedAt))}</div>`,
    `<div style="font-size:10px;color:#475569">Distância do imóvel: ${escapeHtml(distance)}</div>`,
    `<div style="margin-top:5px;font-size:9px;color:#94a3b8">Fonte: ${escapeHtml(station.source)} · qualidade ${escapeHtml(station.quality ?? 'não informada')}</div>`,
    '</div>',
  ].join('')
}

/**
 * Mapa interativo das camadas reais da Medição. O marcador do imóvel só é
 * criado quando a página recebe o endereço privado da conta autenticada; ele
 * nunca é incluído em uma consulta pública.
 */
export function RainMap({
  stations,
  selectedKey,
  onSelect,
  layers,
  occurrences,
  suscetibilidade,
  address,
  centerRequest = 0,
  className,
}: RainMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const suscetibilidadeLayerRef = useRef<L.LayerGroup | null>(null)
  const stationLayerRef = useRef<L.LayerGroup | null>(null)
  const occurrenceLayerRef = useRef<L.LayerGroup | null>(null)
  const addressLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const lastAddressKeyRef = useRef<string | null>(null)
  const lastCenterRequestRef = useRef(0)
  const hasFittedStationsRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: [env.municipality.latitude, env.municipality.longitude],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
    })
    mapRef.current = map
    createMapBasemap().addTo(map)

    suscetibilidadeLayerRef.current = L.layerGroup().addTo(map)
    stationLayerRef.current = L.layerGroup().addTo(map)
    occurrenceLayerRef.current = L.layerGroup().addTo(map)
    addressLayerRef.current = L.layerGroup().addTo(map)

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize()
    }, 140)

    const markers = markersRef.current

    return () => {
      window.clearTimeout(resizeTimer)
      map.remove()
      mapRef.current = null
      suscetibilidadeLayerRef.current = null
      stationLayerRef.current = null
      occurrenceLayerRef.current = null
      addressLayerRef.current = null
      markers.clear()
      hasFittedStationsRef.current = false
    }
  }, [])

  const suscetibilidadeGeoJSON = useMemo(() => {
    if (!layers.suscetibilidade || suscetibilidade.length === 0) return null

    const collection = {
      type: 'FeatureCollection' as const,
      features: suscetibilidade.map((area) => ({
        type: 'Feature' as const,
        properties: {
          id: area.id,
          classe: area.classe,
          classeLabel: SUSCETIBILIDADE_META[area.classe].label,
          tipoLabel: describeTipoSuscetibilidade(area.tipo),
          areaLabel: formatAreaSuscetibilidade(area.areaHa),
          processo: area.processo,
        },
        geometry: area.geojson,
      })),
    }

    return L.geoJSON(collection, {
      style: (feature) => {
        const classe = feature?.properties?.classe as
          | SuscetibilidadeClasse
          | undefined
        const meta = classe ? SUSCETIBILIDADE_META[classe] : undefined
        return {
          color: meta?.color ?? '#475569',
          weight: 1.2,
          opacity: 0.85,
          fillColor: meta?.color ?? '#475569',
          fillOpacity: 0.28,
          dashArray: '4 3',
        }
      },
      onEachFeature: (feature, geoLayer) => {
        const props = feature.properties as {
          classeLabel: string
          tipoLabel: string
          areaLabel: string
          processo: string
        }
        geoLayer.bindPopup(
          [
            '<div style="min-width:190px;max-width:250px">',
            `<strong style="font-size:12px;color:#0f172a">${escapeHtml(props.tipoLabel)}</strong>`,
            `<div style="font-size:11px;color:#334155;margin-top:2px">Classe <strong>${escapeHtml(props.classeLabel)}</strong></div>`,
            `<div style="font-size:10px;color:#475569">Área ${escapeHtml(props.areaLabel)}</div>`,
            `<div style="font-size:10px;color:#475569;margin-top:2px">${escapeHtml(props.processo)}</div>`,
            '<div style="margin-top:5px;font-size:9px;color:#94a3b8">Fonte: SGB/CPRM e IPT (2017) · 1:25.000. Não é previsão de alagamento.</div>',
            '</div>',
          ].join(''),
        )
        geoLayer.bindTooltip(
          `${escapeHtml(props.tipoLabel)} · ${escapeHtml(props.classeLabel)}`,
          { sticky: true },
        )
      },
    })
  }, [suscetibilidade, layers.suscetibilidade])

  // Atualiza os marcadores de estação de forma incremental: reutiliza o
  // marcador existente (preservando popup, foco e seleção) e só cria/remove
  // quando a estação entra ou sai da camada.
  useEffect(() => {
    const map = mapRef.current
    const layer = stationLayerRef.current
    if (!map || !layer) return

    const visibleKeys = new Set(
      layers.stations ? stations.map((station) => station.key) : [],
    )

    for (const [key, marker] of markersRef.current) {
      if (!visibleKeys.has(key)) {
        layer.removeLayer(marker)
        markersRef.current.delete(key)
      }
    }

    if (!layers.stations) return

    for (const station of stations) {
      const icon = buildStationIcon(
        station,
        station.key === selectedKey,
        layers.rain,
      )
      const popup = buildStationPopup(station)

      let marker = markersRef.current.get(station.key)
      if (!marker) {
        marker = L.marker([station.latitude, station.longitude], {
          icon,
          title: station.name,
          keyboard: true,
          riseOnHover: true,
        })
          .bindPopup(popup)
          .on('click', () => onSelect(station.key))
        marker.addTo(layer)
        markersRef.current.set(station.key, marker)
      } else {
        marker.setLatLng([station.latitude, station.longitude])
        marker.setIcon(icon)
        marker.options.title = station.name
        // `onSelect` pode mudar entre renders; mantém o handler atual.
        marker.off('click')
        marker.on('click', () => onSelect(station.key))
        marker.setPopupContent(popup)
        if (!layer.hasLayer(marker)) marker.addTo(layer)
      }
    }
  }, [stations, layers.stations, layers.rain, selectedKey, onSelect])

  useEffect(() => {
    const map = mapRef.current
    const layer = suscetibilidadeLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    const geoJSON = suscetibilidadeGeoJSON
    if (!geoJSON) return

    geoJSON.addTo(layer)
  }, [suscetibilidadeGeoJSON])

  useEffect(() => {
    const map = mapRef.current
    const layer = occurrenceLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    if (!layers.occurrences) return

    for (const occurrence of occurrences) {
      const label = OCCURRENCE_LABELS[occurrence.type] ?? occurrence.type
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:24px;height:24px;border-radius:9999px;background:#d97706;border:2px solid #ffffff;box-shadow:0 2px 7px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800">!</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      })

      L.marker([occurrence.latitude, occurrence.longitude], {
        icon,
        title: `${label} verificada`,
      })
        .bindPopup(
          [
            '<div style="min-width:160px">',
            `<strong style="font-size:12px;color:#0f172a">${escapeHtml(label)}</strong>`,
            occurrence.neighborhood
              ? `<div style="font-size:10px;color:#64748b">${escapeHtml(occurrence.neighborhood)}</div>`
              : '',
            occurrence.description
              ? `<div style="margin-top:4px;font-size:10px;color:#475569">${escapeHtml(occurrence.description)}</div>`
              : '',
            `<div style="margin-top:5px;font-size:9px;color:#94a3b8">Verificada em ${escapeHtml(formatDateTime(occurrence.verifiedAt))} · ${escapeHtml(occurrence.source)}</div>`,
            '</div>',
          ].join(''),
        )
        .addTo(layer)
    }
  }, [layers.occurrences, occurrences])

  useEffect(() => {
    const map = mapRef.current
    const layer = addressLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    if (!address) return

    const icon = L.divIcon({
      className: '',
      html: [
        '<div style="position:relative;width:34px;height:34px">',
        '<div style="position:absolute;inset:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#047857;border:3px solid #ffffff;box-shadow:0 3px 12px rgba(4,120,87,.45)"></div>',
        '<div style="position:absolute;inset:9px;border-radius:9999px;background:#d1fae5"></div>',
        '</div>',
      ].join(''),
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -30],
    })

    L.marker([address.latitude, address.longitude], {
      icon,
      title: 'Meu imóvel (privado)',
      zIndexOffset: 1000,
    })
      .bindPopup(
        `<strong>Meu imóvel</strong><br/><span style="font-size:11px;color:#475569">${escapeHtml(address.label)}</span><br/><span style="font-size:10px;color:#94a3b8">Este ponto é privado e só aparece para a sua conta.</span>`,
      )
      .bindTooltip('Meu imóvel (privado)', { direction: 'top', offset: [0, -28] })
      .addTo(layer)
  }, [address])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (address) {
      const key = `${address.latitude},${address.longitude}`
      if (lastAddressKeyRef.current !== key) {
        lastAddressKeyRef.current = key
        map.setView([address.latitude, address.longitude], 14)
      }
      return
    }

    if (!hasFittedStationsRef.current && stations.length > 0) {
      hasFittedStationsRef.current = true
      const bounds = L.latLngBounds(
        stations.map((station) =>
          L.latLng(station.latitude, station.longitude),
        ),
      )
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 })
    }
  }, [address, stations])

  // Centralização explícita pelo botão do cartão privado. O token evita
  // repetir o movimento a cada render; sem endereço, nada acontece.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !address) return
    if (centerRequest <= 0 || lastCenterRequestRef.current === centerRequest) {
      return
    }
    lastCenterRequestRef.current = centerRequest
    map.setView([address.latitude, address.longitude], 16, { animate: true })
  }, [address, centerRequest])

  return (
    <div
      ref={containerRef}
      className={cn('map-shell h-[420px] w-full sm:h-[520px]', className)}
      role="region"
      aria-label="Mapa interativo de estações pluviométricas de Cajamar. Use o seletor acima para alternar o mapa de ruas ou satélite."
    />
  )
}
