import { useCallback, useEffect, useState } from 'react'
import { subscribeAddressUpdated } from '@/lib/addressEvents'
import { getMyAddress } from '@/lib/addresses'
import { fetchNearbyStations } from '@/lib/rain'
import { getSupabaseClient } from '@/lib/supabase'
import type { AddressRecord } from '@/types/address'
import type { RainStation } from '@/types/rain'

const NEARBY_RADIUS_KM = 30
const NEARBY_LIMIT = 20

export interface PropertyOverviewQuery {
  address: AddressRecord | null
  addressError: string | null
  /** Estações do PostGIS ancoradas no imóvel, já ordenadas por distância. */
  nearbyStations: RainStation[]
  nearbyError: string | null
  isLoading: boolean
  refresh: () => void
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/**
 * Reúne o endereço privado e as estações próximas para o painel da página
 * inicial. Nenhuma coordenada residencial sai do navegador: a RPC
 * `estacoes_proximas_do_morador` usa auth.uid() no servidor.
 */
export function usePropertyOverview(
  userId: string | null,
): PropertyOverviewQuery {
  const [address, setAddress] = useState<AddressRecord | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [nearbyStations, setNearbyStations] = useState<RainStation[]>([])
  const [nearbyError, setNearbyError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(userId))
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1)
  }, [])

  // Salvar o endereço em /meu-endereco atualiza o painel sem F5.
  useEffect(() => subscribeAddressUpdated(refresh), [refresh])

  useEffect(() => {
    const client = getSupabaseClient()

    if (!client || !userId) return

    let active = true
    const controller = new AbortController()

    async function load(): Promise<void> {
      setIsLoading(true)
      setAddressError(null)
      setNearbyError(null)

      try {
        const loadedAddress = await getMyAddress(client!, userId!)
        if (!active) return

        setAddress(loadedAddress)

        if (
          loadedAddress?.latitude === null ||
          loadedAddress?.longitude === null ||
          loadedAddress?.latitude === undefined ||
          loadedAddress?.longitude === undefined
        ) {
          setNearbyStations([])
          return
        }

        try {
          const nearby = await fetchNearbyStations(
            client!,
            NEARBY_RADIUS_KM,
            NEARBY_LIMIT,
            controller.signal,
          )
          if (!active) return
          setNearbyStations(nearby)
        } catch (caught) {
          if (!active) return
          setNearbyStations([])
          setNearbyError(
            describeError(
              caught,
              'As estações próximas não puderam ser calculadas agora.',
            ),
          )
        }
      } catch (caught) {
        if (!active) return
        setAddress(null)
        setNearbyStations([])
        setAddressError(
          describeError(caught, 'Não foi possível carregar seu endereço.'),
        )
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [refreshToken, userId])

  // Sem sessão, nada de dados privados: o painel convidado não deve herdar o
  // estado de uma conta anterior que ainda esteja em memória.
  if (!userId) {
    return {
      address: null,
      addressError: null,
      nearbyStations: [],
      nearbyError: null,
      isLoading: false,
      refresh,
    }
  }

  return {
    address,
    addressError,
    nearbyStations,
    nearbyError,
    isLoading,
    refresh,
  }
}
