import {
  CloudRain,
  Clock,
  Info,
  Map as MapIcon,
  MapPin,
  Mountain,
  RefreshCw,
  Search,
  X,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CollectionStatusCard } from '@/components/map/CollectionStatusCard'
import { LayerControls } from '@/components/map/LayerControls'
import { NearbyStationsCard } from '@/components/map/NearbyStationsCard'
import type {
  RainLayerKey,
  RainLayerVisibility,
} from '@/components/map/LayerControls'
import { MapLegend } from '@/components/map/MapLegend'
import { PrivateAddressCard } from '@/components/map/PrivateAddressCard'
import { RainMap } from '@/components/map/RainMap'
import type { PrivateMapAddress } from '@/components/map/RainMap'
import { RegionWeatherCard } from '@/components/map/RegionWeatherCard'
import { StationDetails } from '@/components/map/StationDetails'
import { StationList } from '@/components/map/StationList'
import { RainSourcesCard } from '@/components/map/RainSourcesCard'
import { useRainCatalog } from '@/hooks/useRainCatalog'
import { mergeRainStations } from '@/lib/rainSources'
import { SuscetibilidadeCard } from '@/components/map/SuscetibilidadeCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useRainMap } from '@/hooks/useRainMap'
import { formatAddressLabel } from '@/lib/addressFormat'
import { CEMADEN_LIVE_RADIUS_KM } from '@/lib/cemaden'
import { formatDateTimeShort, formatRelativeTime } from '@/lib/format'

const DEFAULT_LAYERS: RainLayerVisibility = {
  stations: true,
  rain: true,
  occurrences: true,
  suscetibilidade: true,
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold leading-none text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  )
}

export function MapPage() {
  useDocumentTitle('Mapa de chuva e estações')
  const primaryRain = useRainMap()
  const catalog = useRainCatalog()
  const [sourceFilter, setSourceFilter] = useState('all')
  const combinedStations = useMemo(() => mergeRainStations(primaryRain.stations, catalog.stations), [primaryRain.stations, catalog.stations])
  const rain = { ...primaryRain, stations: sourceFilter === 'all' ? combinedStations : combinedStations.filter(station => station.source === sourceFilter) }
  const [searchParams] = useSearchParams()
  const [stationQuery, setStationQuery] = useState('')
  const [showLayers, setShowLayers] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [layers, setLayers] = useState<RainLayerVisibility>(DEFAULT_LAYERS)
  // O painel da página inicial envia ?centralizar=imovel. O mapa privado
  // aplica o pedido assim que o endereço autenticado estiver disponível.
  const [centerRequest, setCenterRequest] = useState(
    searchParams.get('centralizar') === 'imovel' ? 1 : 0,
  )

  // A primeira estação é apenas um valor derivado. Manter isso fora de um
  // efeito evita um render extra e não perde a seleção feita pelo usuário
  // quando a lista é atualizada.
  const selectedKeyEffective = useMemo(() => {
    if (
      selectedKey &&
      rain.stations.some((station) => station.key === selectedKey)
    ) {
      return selectedKey
    }
    return rain.stations[0]?.key ?? null
  }, [rain.stations, selectedKey])

  const selectedStation = useMemo(
    () =>
      rain.stations.find((station) => station.key === selectedKeyEffective) ??
      null,
    [rain.stations, selectedKeyEffective],
  )

  const handleToggleLayer = useCallback((key: RainLayerKey) => {
    setLayers((previous) => ({ ...previous, [key]: !previous[key] }))
  }, [])

  const filteredStations = useMemo(() => {
    const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    const query=normalize(stationQuery.trim())
    return rain.stations.filter(station=>normalize(`${station.name} ${station.code} ${station.municipality??''}`).includes(query))
  },[rain.stations,stationQuery])

  const withReading = rain.stations.filter(
    (station) => station.accumulatedMm !== null,
  ).length

  const privateAddress: PrivateMapAddress | null =
    rain.address &&
    rain.address.latitude !== null &&
    rain.address.longitude !== null
      ? {
          latitude: rain.address.latitude,
          longitude: rain.address.longitude,
          label: formatAddressLabel(rain.address),
        }
      : null

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">
              Informativo
            </Badge>
            <Badge tone={rain.mode === 'supabase' ? 'safe' : 'attention'}>
              {rain.modeLabel}
            </Badge>
            {rain.isRefreshing ? (
              <Badge tone="neutral">
                <RefreshCw className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                Atualizando
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Mapa de chuva e estações
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
            Explore as estações, consulte a chuva medida em 24 horas e selecione um ponto para ver os detalhes. O seu endereço aparece apenas para você.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { rain.refresh(); catalog.refresh() }}
            isLoading={rain.isRefreshing}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Atualizar dados
          </Button>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {rain.lastLoadedAt
              ? `Última consulta ${formatRelativeTime(rain.lastLoadedAt)}`
              : 'Consulta inicial em andamento'}
          </p>
        </div>
      </div>

      {rain.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-alert-200 bg-alert-50 p-3"
        >
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-alert-700"
            aria-hidden="true"
          />
          <div>
            <p className="text-xs font-bold text-alert-900">
              Camada de chuva indisponível
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-alert-800">
              {rain.error}
            </p>
          </div>
        </div>
      ) : null}

      {rain.notice ? (
        <div className="flex items-start gap-2 rounded-2xl border border-attention-200 bg-attention-50 p-3">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-attention-700"
            aria-hidden="true"
          />
          <p className="text-[13px] leading-relaxed text-attention-900">
            {rain.notice}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Estações"
          value={rain.isLoading ? '—' : String(rain.stations.length)}
          hint={
            catalog.stations.length > 0
              ? 'Inclui postos de catálogo sem leitura atual'
              : rain.mode === 'supabase'
              ? 'Camada pública validada'
              : rain.mode === 'cemaden-live'
                ? `Leitura direta: Cajamar e entorno (${CEMADEN_LIVE_RADIUS_KM} km)`
                : 'Camada pública indisponível'
          }
        />
        <StatCard
          label="Com leitura"
          value={rain.isLoading ? '—' : String(withReading)}
          hint="Acumulado de 24 h informado"
        />
        <StatCard
          label="Ocorrências"
          value={rain.isLoading ? '—' : String(rain.occurrences.length)}
          hint="Somente verificadas e públicas"
        />
        <StatCard
          label="Imóvel"
          value={
            rain.isAuthLoading
              ? '—'
              : privateAddress
                ? 'No mapa'
                : 'Não exibido'
          }
          hint={
            rain.isAuthenticated
              ? 'Visível apenas para sua conta'
              : 'Entre para exibir seu ponto'
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <MapIcon className="h-4 w-4 text-brand-700" aria-hidden="true" />
                <h2 className="text-sm font-bold tracking-tight text-slate-900">
                  Mapa de Cajamar e entorno
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">
                  <CloudRain className="h-2.5 w-2.5" aria-hidden="true" />
                  {withReading} com leitura
                </Badge>
                <Badge tone="neutral">
                  <Mountain className="h-2.5 w-2.5" aria-hidden="true" />
                  {rain.suscetibilidade.features.length} áreas oficiais
                </Badge>
                <Button variant="secondary" size="sm" aria-expanded={showLayers} aria-controls="camadas-do-mapa" onClick={()=>setShowLayers(value=>!value)}>Camadas</Button>
              </div>
            </div>

            <div id="camadas-do-mapa" hidden={!showLayers} className="border-b border-slate-200 p-4">
            <LayerControls
              layers={layers}
              counts={{
                stations: rain.stations.length,
                withReading,
                occurrences: rain.occurrences.length,
                suscetibilidade: rain.suscetibilidade.features.length,
              }}
              onToggle={handleToggleLayer}
              showPrivateAddress={Boolean(privateAddress)}
            />
            </div>
            <RainMap
              stations={rain.stations}
              selectedKey={selectedKeyEffective}
              onSelect={setSelectedKey}
              layers={layers}
              occurrences={rain.occurrences}
              suscetibilidade={rain.suscetibilidade.features}
              address={privateAddress}
              centerRequest={centerRequest}
            />

            <div className="border-t border-slate-100 px-4 py-3">
              <MapLegend />
            </div>
          </Card>

          <NearbyStationsCard
            stations={rain.nearbyStations}
            isLoading={rain.isLoading}
            isAuthenticated={rain.isAuthenticated}
            hasAddress={Boolean(privateAddress)}
            onSelect={setSelectedKey}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4" aria-labelledby="lista-estacoes">
              <header className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />
                  <h2
                    id="lista-estacoes"
                    className="text-sm font-bold tracking-tight text-slate-900"
                  >
                    Estações no mapa
                  </h2>
                </div>
                <Badge tone="neutral">{rain.stations.length}</Badge>
              </header>
              <p className="mb-2 text-xs leading-relaxed text-slate-500">
                Ordenadas por distância do imóvel quando há endereço
                autenticado. A ausência de leitura aparece explicitamente.
              </p>
              <label htmlFor="filtrar-rede" className="mb-2 block text-sm font-semibold text-slate-700">Rede no mapa e na lista</label>
              <select id="filtrar-rede" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} className="mb-4 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
                <option value="all">Todas as redes</option>
                {Array.from(new Set(combinedStations.map(station => station.source))).sort().map(source => <option key={source} value={source}>{source}</option>)}
              </select>
              <label htmlFor="buscar-estacao" className="mb-2 block text-sm font-semibold text-slate-700">Buscar na lista de estações</label>
              <div className="relative mb-2"><Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-500" aria-hidden="true" /><input id="buscar-estacao" type="search" value={stationQuery} onChange={event=>setStationQuery(event.target.value)} placeholder="Nome, código ou cidade" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-12 text-base text-slate-900" />{stationQuery?<button type="button" aria-label="Limpar busca de estações" onClick={()=>setStationQuery('')} className="absolute right-1 top-0.5 flex h-11 w-11 items-center justify-center rounded-lg text-slate-600"><X className="h-4 w-4" aria-hidden="true" /></button>:null}</div>
              <p role="status" aria-live="polite" className="mb-3 text-[13px] text-slate-600">{filteredStations.length} estação(ões) na lista. O mapa mantém todas as estações.</p>
              <StationList
                stations={filteredStations}
                emptyMessage={stationQuery ? 'Nenhuma estação corresponde à busca' : undefined}
                emptyDescription={stationQuery ? 'Tente outro nome, código ou cidade, ou limpe a busca.' : undefined}
                selectedKey={selectedKeyEffective}
                onSelect={setSelectedKey}
                isLoading={rain.isLoading}
                showDistance={Boolean(privateAddress)}
              />
            </Card>

            <Card className="p-4" aria-labelledby="detalhes-estacao">
              <header className="mb-2 flex items-center gap-2">
                <Info className="h-4 w-4 text-brand-700" aria-hidden="true" />
                <h2
                  id="detalhes-estacao"
                  className="text-sm font-bold tracking-tight text-slate-900"
                >
                  Detalhes da estação
                </h2>
              </header>
              <StationDetails
                station={selectedStation}
                now={rain.lastLoadedAt ?? 0}
              />
            </Card>
          </div>
        </div>

        <aside className="space-y-3">
          <RainSourcesCard sources={catalog.sources} stations={combinedStations} isLoading={catalog.isLoading} />
          <Card className="p-4">
            <PrivateAddressCard
              address={rain.address}
              isAuthenticated={rain.isAuthenticated}
              isAuthLoading={rain.isAuthLoading}
              addressError={rain.addressError}
              onCenter={() => setCenterRequest((value) => value + 1)}
            />
          </Card>

          <Card className="p-4">
            <SuscetibilidadeCard
              cartografia={rain.suscetibilidade.cartografia}
              features={rain.suscetibilidade.features}
              areasImovel={rain.suscetibilidade.areasImovel}
              isLoading={rain.isLoading}
              isAuthenticated={rain.isAuthenticated}
              hasAddress={Boolean(privateAddress)}
              error={rain.suscetibilidade.error}
            />
          </Card>



          <Card className="p-4">
            <CollectionStatusCard collection={rain.collection} mode={rain.mode} />
          </Card>

          <Card className="p-4">
            <RegionWeatherCard />
          </Card>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-slate-500">
              {rain.lastLoadedAt
                ? `Dados carregados em ${formatDateTimeShort(rain.lastLoadedAt)}. `
                : ''}
              Atualização automática a cada 5 minutos enquanto a página estiver
              visível.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Em emergência, siga a Defesa Civil e ligue 199. Este mapa é
              informativo e não substitui os canais oficiais.
            </p>
            <Link
              to="/demo"
              className="mt-1.5 inline-flex text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              Comparar com o laboratório de demonstração
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
