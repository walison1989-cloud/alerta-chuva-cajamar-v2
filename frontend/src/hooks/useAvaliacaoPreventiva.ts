import { useCallback, useEffect, useMemo, useState } from 'react'
import { env } from '@/config/env'
import {
  MOTOR_VERSAO,
  avaliarPreventivamente,
  montarPayloadRegistro,
} from '@/lib/avaliacaoPreventiva'
import {
  criarPreviaNotificacaoInterna,
  fetchEvidenciasDoMorador,
  fetchEvidenciasNoPonto,
  fetchTerrenoNoPonto,
  fetchHistoricoAvaliacoes,
  fetchRegraAvaliacaoPublica,
  registrarAvaliacaoPreventiva,
} from '@/lib/avaliacaoPreventivaRepository'
import { getMyAddress } from '@/lib/addresses'
import { fetchPublicRainStations } from '@/lib/rain'
import { getSupabaseClient } from '@/lib/supabase'
import { useWeather } from '@/hooks/useWeather'
import type { AddressRecord } from '@/types/address'
import type {
  AvaliacaoOrigem,
  AvaliacaoPreventiva,
  HistoricoAvaliacao,
  PacoteEvidencias,
  PreviaNotificacao,
  PrevisaoResumo,
  RegraAvaliacaoPublica,
} from '@/types/avaliacaoPreventiva'
import type { WeatherData } from '@/types/weather'
import type { RainStation } from '@/types/rain'

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export interface AvaliacaoPreventivaQuery {
  isConfigured: boolean
  address: AddressRecord | null
  addressError: string | null
  addressLoaded: boolean
  origin: AvaliacaoOrigem
  regra: RegraAvaliacaoPublica | null
  regraError: string | null
  evidencias: PacoteEvidencias | null
  estacoesEspaciais: RainStation[]
  estacoesEspaciaisError: string | null
  estacoesEspaciaisLoading: boolean
  avaliadoEm: number
  evidenciasError: string | null
  avaliacao: AvaliacaoPreventiva | null
  weather: WeatherData | null
  weatherError: string | null
  weatherIsLoading: boolean
  weatherIsCached: boolean
  previsao: PrevisaoResumo | null
  isLoading: boolean
  error: string | null
  refresh: () => void
  historico: HistoricoAvaliacao[]
  historicoError: string | null
  historicoLoading: boolean
  registrar: () => Promise<string | null>
  isRegistering: boolean
  registerError: string | null
  lastRegisteredId: string | null
  gerarPrevia: (execucaoId?: string) => Promise<PreviaNotificacao | null>
  isCreatingPrevia: boolean
  previaError: string | null
  previa: PreviaNotificacao | null
}

/**
 * Compõe endereço privado, evidências espaciais/pluviométricas e previsão da
 * Open-Meteo. A avaliação é sempre feita pelo motor puro; o banco só registra
 * o que o usuário decidir persistir. Nenhuma coordenada residencial sai do
 * navegador para as novas tabelas.
 */
export function useAvaliacaoPreventiva(
  userId: string | null,
): AvaliacaoPreventivaQuery {
  const client = getSupabaseClient()
  const [address, setAddress] = useState<AddressRecord | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressLoaded, setAddressLoaded] = useState(false)
  const [regra, setRegra] = useState<RegraAvaliacaoPublica | null>(null)
  const [regraError, setRegraError] = useState<string | null>(null)
  const [evidencias, setEvidencias] = useState<PacoteEvidencias | null>(null)
  const [evidenciasError, setEvidenciasError] = useState<string | null>(null)
  const [estacoesEspaciais, setEstacoesEspaciais] = useState<RainStation[]>([])
  const [estacoesEspaciaisError, setEstacoesEspaciaisError] = useState<string | null>(null)
  const [estacoesEspaciaisLoading, setEstacoesEspaciaisLoading] = useState(Boolean(client))
  const [isLoading, setIsLoading] = useState(Boolean(client))
  const [refreshToken, setRefreshToken] = useState(0)
  const [agora, setAgora] = useState(() => Date.now())
  const [historico, setHistorico] = useState<HistoricoAvaliacao[]>([])
  const [historicoError, setHistoricoError] = useState<string | null>(null)
  const [historicoLoading, setHistoricoLoading] = useState(Boolean(client && userId))
  const [isRegistering, setIsRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [lastRegisteredId, setLastRegisteredId] = useState<string | null>(null)
  const [isCreatingPrevia, setIsCreatingPrevia] = useState(false)
  const [previaError, setPreviaError] = useState<string | null>(null)
  const [previa, setPrevia] = useState<PreviaNotificacao | null>(null)

  const addressLatitude = address?.latitude ?? null
  const addressLongitude = address?.longitude ?? null
  const hasAddressCoordinates =
    typeof addressLatitude === 'number' &&
    Number.isFinite(addressLatitude) &&
    typeof addressLongitude === 'number' &&
    Number.isFinite(addressLongitude)
  const origin: AvaliacaoOrigem =
    userId && hasAddressCoordinates ? 'imovel' : 'regiao'

  const forecastCoordinates = useMemo(
    () =>
      origin === 'imovel' &&
      typeof addressLatitude === 'number' &&
      typeof addressLongitude === 'number'
        ? { latitude: addressLatitude, longitude: addressLongitude }
        : {
            latitude: env.municipality.latitude,
            longitude: env.municipality.longitude,
          },
    [origin, addressLatitude, addressLongitude],
  )

  const weather = useWeather(forecastCoordinates)
  const refreshWeather = weather.refresh

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1)
    setAgora(Date.now())
    refreshWeather()
  }, [refreshWeather])

  // Reavalia enquanto a página está aberta. Não é monitoramento servidor 24/7;
  // a coleta e a entrega de alertas independem deste intervalo do navegador.
  useEffect(() => {
    if (!client || typeof document === 'undefined') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh()
    }, 10 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [client, refresh])

  useEffect(() => {
    if (!client) {
      // Sem cliente Supabase não há consulta a fazer; o estado precisa refletir
      // essa ausência antes de sair do efeito.
      // eslint-disable-next-line react/set-state-in-effect
      setAddress(null)
      setAddressLoaded(true)
      return
    }
    if (!userId) {
      setAddress(null)
      setAddressError(null)
      setAddressLoaded(true)
      return
    }

    let active = true
    setAddressLoaded(false)
    setAddressError(null)

    void getMyAddress(client, userId)
      .then((loaded) => {
        if (!active) return
        setAddress(loaded)
      })
      .catch((caught) => {
        if (!active) return
        setAddress(null)
        setAddressError(
          describeError(caught, 'Não foi possível carregar seu endereço.'),
        )
      })
      .finally(() => {
        if (active) setAddressLoaded(true)
      })

    return () => {
      active = false
    }
  }, [client, userId, refreshToken])

  useEffect(() => {
    if (!client) {
      // O carregamento inicial só existe quando há cliente configurado.
      // eslint-disable-next-line react/set-state-in-effect
      setIsLoading(false)
      setEstacoesEspaciaisLoading(false)
      return
    }
    if (!addressLoaded) return

    let active = true
    const controller = new AbortController()
    const supabase = client

    async function load(): Promise<void> {
      setIsLoading(true)
      setRegraError(null)
      setEvidenciasError(null)
      setEstacoesEspaciaisError(null)

      let loadedRule: RegraAvaliacaoPublica | null = null
      try {
        loadedRule = await fetchRegraAvaliacaoPublica(
          supabase,
          controller.signal,
        )
        if (!active) return
        setRegra(loadedRule)
        if (!loadedRule) {
          setRegraError(
            'Nenhuma regra experimental publicada e vigente foi encontrada. Nenhuma classificação será gerada.',
          )
        }
      } catch (caught) {
        if (!active) return
        setRegra(null)
        setRegraError(
          describeError(
            caught,
            'Não foi possível carregar a regra experimental publicada.',
          ),
        )
      }

      const options = loadedRule
        ? {
            raioSuscetibilidadeM:
              loadedRule.parametros.raioSuscetibilidadeM,
            raioEstacoesKm: loadedRule.parametros.raioEstacoesKm,
            limiteEstacoes: loadedRule.parametros.limiteEstacoes,
          }
        : {}

      try {
        const loadedEvidencias =
          origin === 'imovel'
            ? await fetchEvidenciasDoMorador(
                supabase,
                options,
                controller.signal,
              )
            : await fetchEvidenciasNoPonto(
                supabase,
                env.municipality.latitude,
                env.municipality.longitude,
                options,
                controller.signal,
              )
        if (!active) return
        // O pacote antigo não inclui automaticamente a RPC de terreno.
        // Falha na leitura topográfica não pode derrubar toda a meteorologia.
        let terreno = loadedEvidencias.terreno ?? null
        if (origin === 'imovel' && hasAddressCoordinates &&
            typeof addressLatitude === 'number' && typeof addressLongitude === 'number') {
          try {
            terreno = await fetchTerrenoNoPonto(
              supabase, addressLatitude, addressLongitude, controller.signal,
            )
          } catch {
            terreno = null // Não inventar elevação/conectividade.
          }
        }
        if (!active) return
        setEvidencias({ ...loadedEvidencias, terreno })
        setAgora(Date.now())
      } catch (caught) {
        if (!active) return
        setEvidencias(null)
        setEvidenciasError(
          describeError(
            caught,
            'Não foi possível obter as evidências da análise preventiva.',
          ),
        )
      } finally {
        if (active) setIsLoading(false)
      }

      try {
        setEstacoesEspaciaisLoading(true)
        const stations = await fetchPublicRainStations(supabase, controller.signal)
        if (active) setEstacoesEspaciais(stations)
      } catch (caught) {
        if (!active) return
        setEstacoesEspaciais([])
        setEstacoesEspaciaisError(
          describeError(caught, 'Não foi possível carregar as coordenadas e leituras das estações.'),
        )
      } finally {
        if (active) setEstacoesEspaciaisLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [client, userId, addressLoaded, origin, hasAddressCoordinates, addressLatitude, addressLongitude, refreshToken])

  const loadHistorico = useCallback(async (): Promise<void> => {
    if (!client || !userId) {
      setHistorico([])
      setHistoricoError(null)
      setHistoricoLoading(false)
      return
    }
    setHistoricoLoading(true)
    try {
      const rows = await fetchHistoricoAvaliacoes(client, 12)
      setHistorico(rows)
      setHistoricoError(null)
    } catch (caught) {
      setHistorico([])
      setHistoricoError(
        describeError(caught, 'Não foi possível carregar o histórico.'),
      )
    } finally {
      setHistoricoLoading(false)
    }
  }, [client, userId])

  useEffect(() => {
    // loadHistorico alterna o estado de carregamento antes da consulta.
    // eslint-disable-next-line react/set-state-in-effect
    void loadHistorico()
  }, [loadHistorico, refreshToken])

  const previsao = useMemo<PrevisaoResumo | null>(() => {
    const data = weather.data
    if (!data) return null
    return {
      fonte: 'Open-Meteo',
      precipMm24h: data.next24hPrecipMm,
      pico3hMm: data.next24hMax3hMm ?? null,
      pico6hMm: data.next24hMax6hMm ?? null,
      probabilidadeMaxPct: data.next24hMaxProbabilityPct,
      fetchedAt: weather.lastFetchedAt ?? data.fetchedAt,
      referenciaEm: data.current.time,
      timezone: data.timezone,
    }
  }, [weather.data, weather.lastFetchedAt])

  const avaliacao = useMemo<AvaliacaoPreventiva | null>(() => {
    if (!client || !evidencias) return null
    if (userId && !addressLoaded) return null

    const municipio =
      origin === 'imovel'
        ? address?.municipio ?? env.municipality.name
        : env.municipality.name
    const bairro = origin === 'imovel' ? address?.bairro ?? null : null

    return avaliarPreventivamente({
      agora,
      origem: origin,
      municipio,
      bairro,
      regiao:
        origin === 'regiao'
          ? `${env.municipality.name} — centro de referência`
          : null,
      regra,
      evidencias,
      previsao,
      previsaoErro: weather.error,
      previsaoEmCache: weather.isCached,
      motorVersao: MOTOR_VERSAO,
    })
  }, [
    client,
    evidencias,
    userId,
    addressLoaded,
    origin,
    address,
    regra,
    previsao,
    agora,
    weather.error,
    weather.isCached,
  ])

  const registrar = useCallback(async (): Promise<string | null> => {
    if (!client || !avaliacao || !userId) return null
    setIsRegistering(true)
    setRegisterError(null)
    setPrevia(null)
    setPreviaError(null)
    try {
      const payload = montarPayloadRegistro(avaliacao)
      const id = await registrarAvaliacaoPreventiva(client, payload)
      setLastRegisteredId(id)
      await loadHistorico()
      return id
    } catch (caught) {
      setRegisterError(
        describeError(
          caught,
          'Não foi possível registrar a avaliação. Nada foi gravado.',
        ),
      )
      return null
    } finally {
      setIsRegistering(false)
    }
  }, [client, avaliacao, userId, loadHistorico])

  const gerarPrevia = useCallback(
    async (execucaoId?: string): Promise<PreviaNotificacao | null> => {
      const target = execucaoId ?? lastRegisteredId
      if (!client || !userId || !target) return null
      setIsCreatingPrevia(true)
      setPreviaError(null)
      try {
        const created = await criarPreviaNotificacaoInterna(client, target)
        setPrevia(created)
        return created
      } catch (caught) {
        setPreviaError(
          describeError(
            caught,
            'Não foi possível gerar a prévia interna. Nenhum aviso foi enviado.',
          ),
        )
        return null
      } finally {
        setIsCreatingPrevia(false)
      }
    },
    [client, userId, lastRegisteredId],
  )

  return {
    isConfigured: Boolean(client),
    address,
    addressError,
    addressLoaded,
    origin,
    regra,
    regraError,
    evidencias,
    estacoesEspaciais,
    estacoesEspaciaisError,
    estacoesEspaciaisLoading,
    avaliadoEm: agora,
    evidenciasError,
    avaliacao,
    weather: weather.data,
    weatherError: weather.error,
    weatherIsLoading: weather.isLoading,
    weatherIsCached: weather.isCached,
    previsao,
    isLoading,
    error: regraError ?? evidenciasError,
    refresh,
    historico,
    historicoError,
    historicoLoading,
    registrar,
    isRegistering,
    registerError,
    lastRegisteredId,
    gerarPrevia,
    isCreatingPrevia,
    previaError,
    previa,
  }
}

export interface UltimaAvaliacaoPreventivaQuery {
  avaliacao: HistoricoAvaliacao | null
  isLoading: boolean
  error: string | null
}

/** Leitura leve da última avaliação registrada, usada pelo cartão da home. */
export function useUltimaAvaliacaoPreventiva(
  userId: string | null,
): UltimaAvaliacaoPreventivaQuery {
  const client = getSupabaseClient()
  const [avaliacao, setAvaliacao] = useState<HistoricoAvaliacao | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(client && userId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client || !userId) {
      // Sem sessão não há última avaliação para consultar.
      // eslint-disable-next-line react/set-state-in-effect
      setAvaliacao(null)
      setError(null)
      setIsLoading(false)
      return
    }

    let active = true
    setIsLoading(true)

    void fetchHistoricoAvaliacoes(client, 1)
      .then((rows) => {
        if (!active) return
        setAvaliacao(rows[0] ?? null)
        setError(null)
      })
      .catch((caught) => {
        if (!active) return
        setAvaliacao(null)
        setError(
          describeError(caught, 'Não foi possível ler a última avaliação.'),
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [client, userId])

  return { avaliacao, isLoading, error }
}
