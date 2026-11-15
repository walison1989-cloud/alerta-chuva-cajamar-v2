import { useCallback, useEffect, useRef, useState } from 'react'
import { env } from '@/config/env'
import { useAuth } from '@/hooks/useAuth'
import { subscribeAddressUpdated } from '@/lib/addressEvents'
import { getMyAddress } from '@/lib/addresses'
import {
  livePayloadToCollectionStatus,
  livePayloadToRainStations,
  loadCemadenLiveSnapshot,
} from '@/lib/cemaden'
import {
  fetchNearbyStations,
  fetchRainSnapshot,
  sortStations,
} from '@/lib/rain'
import {
  fetchSuscetibilidadeDoMorador,
  fetchSuscetibilidadePublica,
} from '@/lib/suscetibilidade'
import { getSupabaseClient } from '@/lib/supabase'
import type { AddressRecord } from '@/types/address'
import type {
  PublicOccurrence,
  RainCollectionStatus,
  RainDataSourceMode,
  RainSnapshot,
  RainStation,
} from '@/types/rain'
import type {
  AreaSuscetibilidadeProxima,
  CartografiaSuscetibilidade,
  SuscetibilidadeFeature,
  SuscetibilidadeSnapshot,
} from '@/types/suscetibilidade'

const POLL_INTERVAL_MS = 5 * 60 * 1000

export const RAIN_MODE_LABELS: Record<RainDataSourceMode, string> = {
  supabase: 'Supabase + PostGIS',
  'cemaden-live': 'CEMADEN (leitura direta)',
  none: 'Sem fonte disponível',
}

export interface SuscetibilidadeMapState {
  cartografia: CartografiaSuscetibilidade | null
  features: SuscetibilidadeFeature[]
  /** Áreas oficiais que contêm ou estão próximas do imóvel autenticado. */
  areasImovel: AreaSuscetibilidadeProxima[]
  error: string | null
}

export interface RainMapQuery {
  mode: RainDataSourceMode
  modeLabel: string
  stations: RainStation[]
  /** Estações retornadas pelo PostGIS a partir do imóvel, em ordem de distância. */
  nearbyStations: RainStation[]
  collection: RainCollectionStatus | null
  occurrences: PublicOccurrence[]
  address: AddressRecord | null
  addressError: string | null
  suscetibilidade: SuscetibilidadeMapState
  error: string | null
  notice: string | null
  isLoading: boolean
  isRefreshing: boolean
  lastLoadedAt: number | null
  isAuthenticated: boolean
  isAuthLoading: boolean
  refresh: () => void
}

interface RainMapState {
  mode: RainDataSourceMode
  stations: RainStation[]
  nearbyStations: RainStation[]
  collection: RainCollectionStatus | null
  occurrences: PublicOccurrence[]
  address: AddressRecord | null
  addressError: string | null
  suscetibilidade: SuscetibilidadeMapState
  error: string | null
  notice: string | null
  isLoading: boolean
  isRefreshing: boolean
  lastLoadedAt: number | null
}

const INITIAL_STATE: RainMapState = {
  mode: 'none',
  stations: [],
  nearbyStations: [],
  collection: null,
  occurrences: [],
  address: null,
  addressError: null,
  suscetibilidade: {
    cartografia: null,
    features: [],
    areasImovel: [],
    error: null,
  },
  error: null,
  notice: null,
  isLoading: true,
  isRefreshing: false,
  lastLoadedAt: null,
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Não foi possível concluir a consulta agora.'
}

/**
 * Mescla as distâncias calculadas no PostGIS às estações da camada pública.
 * A RPC parte do endereço privado do usuário autenticado, nunca de
 * coordenadas enviadas pelo navegador.
 */
function mergeDistances(
  stations: RainStation[],
  nearby: RainStation[],
): RainStation[] {
  if (nearby.length === 0) return stations
  const distanceByCode = new Map<string, number | null>()
  for (const station of nearby) {
    distanceByCode.set(station.code, station.distanceKm)
  }
  return stations.map((station) =>
    distanceByCode.has(station.code)
      ? { ...station, distanceKm: distanceByCode.get(station.code) ?? null }
      : station,
  )
}

/**
 * Carrega a camada pública do mapa.
 *
 * Ordem de preferência:
 * 1. views/RPCs do Supabase, com estações sincronizadas e distâncias PostGIS;
 * 2. leitura direta do JSONP do CEMADEN, sem persistência, quando a
 *    sincronização ainda não estiver publicada e o fallback estiver ligado;
 * 3. estado explícito de indisponibilidade — nunca dados inventados.
 */
export function useRainMap(): RainMapQuery {
  const client = getSupabaseClient()
  const { user, isLoading: isAuthLoading } = useAuth()
  const [state, setState] = useState<RainMapState>(INITIAL_STATE)
  const [refreshToken, setRefreshToken] = useState(0)
  const hasLoadedRef = useRef(false)
  const userId = user?.id ?? null

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1)
  }, [])

  // Salvar o endereço em /meu-endereco (na mesma aba ou em outra) recarrega o
  // ponto privado e as distâncias sem exigir F5.
  useEffect(() => subscribeAddressUpdated(refresh), [refresh])

  useEffect(() => {
    if (isAuthLoading) return

    let active = true
    let inFlight = false
    const controller = new AbortController()

    async function load(): Promise<void> {
      if (inFlight) return
      inFlight = true

      const firstLoad = !hasLoadedRef.current
      if (active) {
        setState((previous) => ({
          ...previous,
          isLoading: firstLoad,
          isRefreshing: !firstLoad,
          error: null,
        }))
      }

      try {
        // Objeto mutável: as atribuições acontecem dentro de callbacks de
        // Promise e o TypeScript não estreita propriedades como faria com
        // variáveis locais simples.
        const loaded: {
          snapshot: RainSnapshot | null
          snapshotError: string | null
          address: AddressRecord | null
          addressError: string | null
          suscetibilidade: SuscetibilidadeSnapshot | null
          suscetibilidadeError: string | null
        } = {
          snapshot: null,
          snapshotError: null,
          address: null,
          addressError: null,
          suscetibilidade: null,
          suscetibilidadeError: null,
        }

        const initialTasks: Promise<void>[] = []

        if (client) {
          initialTasks.push(
            fetchRainSnapshot(client, controller.signal)
              .then((result) => {
                loaded.snapshot = result
              })
              .catch((error: unknown) => {
                loaded.snapshotError = describeError(error)
              }),
          )

          initialTasks.push(
            fetchSuscetibilidadePublica(client, controller.signal)
              .then((result) => {
                loaded.suscetibilidade = result
              })
              .catch((error: unknown) => {
                loaded.suscetibilidadeError = describeError(error)
              }),
          )

          if (userId) {
            initialTasks.push(
              getMyAddress(client, userId)
                .then((result) => {
                  loaded.address = result
                })
                .catch((error: unknown) => {
                  loaded.addressError = describeError(error)
                }),
            )
          }
        }

        await Promise.all(initialTasks)
        if (!active) return

        let stations: RainStation[] = []
        let nearbyStations: RainStation[] = []
        let collection: RainCollectionStatus | null = null
        let occurrences: PublicOccurrence[] =
          loaded.snapshot?.occurrences ?? []
        let mode: RainDataSourceMode = 'none'
        let notice: string | null = null
        let error: string | null = null

        if (loaded.snapshot && loaded.snapshot.stations.length > 0) {
          stations = loaded.snapshot.stations
          collection = loaded.snapshot.collection
          mode = 'supabase'
          if (loaded.snapshotError) {
            notice =
              'A consulta pública retornou estações, mas parte dos dados auxiliares falhou. Confira o status da coleta abaixo.'
          }
        } else {
          const reason =
            loaded.snapshotError ??
            (client
              ? 'A camada pública ainda não tem estações sincronizadas. Execute a sincronização do CEMADEN no Supabase.'
              : 'O Supabase não está configurado neste ambiente.')

          if (env.cemadenLiveFallbackEnabled) {
            try {
              const live = await loadCemadenLiveSnapshot(controller.signal)
              if (!active) return
              stations = livePayloadToRainStations(live)
              collection = livePayloadToCollectionStatus(live)
              mode = 'cemaden-live'
              notice = `${reason} Exibindo leitura direta do CEMADEN, sem persistência no Supabase e sem cálculo PostGIS de distância do imóvel.`
            } catch (caught) {
              if (!active) return
              error = `${reason} ${describeError(caught)}`.trim()
            }
          } else {
            error = reason
          }
        }

        const hasPrivatePoint =
          loaded.address?.latitude !== null &&
          loaded.address?.longitude !== null &&
          loaded.address?.latitude !== undefined &&
          loaded.address?.longitude !== undefined

        let areasImovel: AreaSuscetibilidadeProxima[] = []
        let suscetibilidadeError = loaded.suscetibilidadeError

        // Distâncias do imóvel (PostGIS) exigem estações no mapa; suscetibilidade
        // do imóvel exige apenas endereço. São consultas independentes e podem
        // ser executadas em paralelo, cada uma com sua própria condição de guarda.
        const parallelCalls: Promise<void>[] = []

        if (
          client &&
          userId &&
          mode === 'supabase' &&
          stations.length > 0 &&
          hasPrivatePoint
        ) {
          parallelCalls.push(
            fetchNearbyStations(client, undefined, undefined, controller.signal)
              .then((result) => {
                nearbyStations = result
                stations = mergeDistances(stations, result)
              })
              .catch((caught) => {
                if (!active) return
                const distanceMessage = `As distâncias do imóvel não puderam ser calculadas agora. ${describeError(caught)}`
                notice = notice ? `${notice} ${distanceMessage}` : distanceMessage
              }),
          )
        }

        if (client && userId && hasPrivatePoint) {
          parallelCalls.push(
            fetchSuscetibilidadeDoMorador(
              client,
              undefined,
              undefined,
              controller.signal,
            )
              .then((result) => {
                areasImovel = result
              })
              .catch((caught) => {
                if (!active) return
                const message = `A suscetibilidade do imóvel não pôde ser consultada agora. ${describeError(caught)}`
                suscetibilidadeError = suscetibilidadeError
                  ? `${suscetibilidadeError} ${message}`
                  : message
              }),
          )
        }

        if (parallelCalls.length > 0) {
          await Promise.all(parallelCalls)
        }

        if (!active) return

        stations = sortStations(stations)
        hasLoadedRef.current = true

        setState({
          mode,
          stations,
          nearbyStations,
          collection,
          occurrences,
          address: loaded.address,
          addressError: loaded.addressError,
          suscetibilidade: {
            cartografia: loaded.suscetibilidade?.cartografia ?? null,
            features: loaded.suscetibilidade?.features ?? [],
            areasImovel,
            error: suscetibilidadeError,
          },
          error,
          notice,
          isLoading: false,
          isRefreshing: false,
          lastLoadedAt: Date.now(),
        })
      } catch (caught) {
        if (!active) return
        hasLoadedRef.current = true
        setState((previous) => ({
          ...previous,
          mode: 'none',
          stations: [],
          nearbyStations: [],
          error: describeError(caught),
          isLoading: false,
          isRefreshing: false,
          lastLoadedAt: Date.now(),
        }))
      } finally {
        inFlight = false
      }
    }

    void load()

    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void load()
    }, POLL_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
      controller.abort()
    }
  }, [client, isAuthLoading, refreshToken, userId])

  return {
    ...state,
    modeLabel: RAIN_MODE_LABELS[state.mode],
    isAuthenticated: Boolean(user),
    isAuthLoading,
    refresh,
  }
}
