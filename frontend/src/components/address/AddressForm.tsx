import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { AddressHistory } from '@/components/address/AddressHistory'
import { AddressMapPicker } from '@/components/address/AddressMapPicker'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { env } from '@/config/env'
import { useAuth } from '@/hooks/useAuth'
import { notifyAddressUpdated } from '@/lib/addressEvents'
import {
  formatCep,
  isWithinCajamarArea,
  isValidCep,
  normalizeAddressValues,
  normalizeCep,
  validateAddress,
} from '@/lib/addressValidation'
import type {
  AddressErrors,
  AddressField,
} from '@/lib/addressValidation'
import {
  AddressRepositoryError,
  getMyAddress,
  listMyAddressVersions,
  saveMyAddress,
} from '@/lib/addresses'
import { CepLookupError, lookupCep } from '@/lib/cep'
import {
  formatAccuracy,
  getSecureContextInfo,
  GeolocationError,
  requestCurrentPosition,
} from '@/lib/geolocation'
import { GeocodingError, geocodeAddress, OPENGEOCODING_ATTRIBUTION } from '@/lib/geocoding'
import { getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { focusFirstInvalid } from '@/lib/formFocus'
import type {
  AddressFormValues,
  AddressPrecision,
  AddressVersionSummary,
  Coordinates,
} from '@/types/address'

const FIELD_CLASS =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

/**
 * Campos que participam da consulta ao geocodificador. Alterar qualquer um
 * deles torna o ponto anterior obsoleto: ele pode ter sido calculado para
 * outro logradouro, número, bairro ou município.
 *
 * Complemento fica de fora de propósito: ele não muda a consulta e o ponto
 * continua válido quando o morador apenas informa apartamento/bloco.
 */
const GEOCODE_AFFECTING_FIELDS: ReadonlySet<keyof AddressFormValues> = new Set([
  'cep',
  'logradouro',
  'numero',
  'bairro',
  'municipio',
  'uf',
])

const COORDINATE_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
})

/**
 * Como o ponto atual foi definido. A precisão persistida continua sendo
 * `geocodificado` ou `ajustado_manual` (contrato do banco); este estado apenas
 * distingue GPS e seleção manual para a interface e para o rótulo salvo.
 */
type LocationMethod = 'geocodificado' | 'gps' | 'manual' | null

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

/**
 * Tempo de espera após a última alteração antes de consultar a OpenGeocoding
 * automaticamente. Evita uma requisição por tecla digitada.
 */
const AUTO_GEOCODE_DELAY_MS = 800

function addressSignature(values: AddressFormValues): string {
  const normalized = normalizeAddressValues(values)
  return [
    normalized.cep,
    normalized.logradouro,
    normalized.numero,
    normalized.bairro,
    normalized.municipio,
    normalized.uf,
  ]
    .join('|')
    .toLowerCase()
}

/**
 * Só dispara a geocodificação automática quando há dados suficientes e o
 * município é Cajamar. O número é obrigatório porque o CEP sozinho não
 * determina a posição do imóvel.
 */
function isReadyForAutomaticGeocode(values: AddressFormValues): boolean {
  const normalized = normalizeAddressValues(values)
  return (
    isValidCep(normalized.cep) &&
    normalized.logradouro.length >= 3 &&
    Boolean(normalized.numero) &&
    normalized.bairro.length >= 2 &&
    isMunicipalityOfCajamar(normalized.municipio, normalized.uf)
  )
}

function formatCoordinate(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : COORDINATE_FORMATTER.format(value)
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isMunicipalityOfCajamar(municipio: string, uf: string): boolean {
  return (
    normalizeText(municipio) === normalizeText(env.municipality.name) &&
    normalizeText(uf) === normalizeText(env.municipality.state)
  )
}

function emptyValues(): AddressFormValues {
  return {
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    complemento: '',
    municipio: env.municipality.name,
    uf: env.municipality.state,
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-[13px] leading-relaxed text-alert-700">
      {message}
    </p>
  )
}

export function AddressForm() {
  const client = getSupabaseClient()
  const { user } = useAuth()
  const userId = user?.id

  const [values, setValues] = useState<AddressFormValues>(emptyValues)
  const [coordinates, setCoordinates] = useState<Coordinates>({
    latitude: null,
    longitude: null,
  })
  const [precision, setPrecision] =
    useState<AddressPrecision>('ajustado_manual')
  const [locationMethod, setLocationMethod] = useState<LocationMethod>(null)
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null)
  const [geocodingFonte, setGeocodingFonte] = useState<string | null>(null)
  const [geocodingLabel, setGeocodingLabel] = useState<string | null>(null)
  const [consentimento, setConsentimento] = useState(false)
  // O salvamento só acontece depois que o morador confirma explicitamente que
  // o marcador representa o imóvel. Qualquer novo ponto volta a exigir a
  // confirmação.
  const [pontoConfirmado, setPontoConfirmado] = useState(false)

  const [errors, setErrors] = useState<AddressErrors>({})
  const [warnings, setWarnings] = useState<string[]>([])

  const [isLoadingAddress, setIsLoadingAddress] = useState(
    Boolean(client && userId),
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hasSavedAddress, setHasSavedAddress] = useState(false)

  const [isLookingUpCep, setIsLookingUpCep] = useState(false)
  const [cepMessage, setCepMessage] = useState<string | null>(null)
  const [cepError, setCepError] = useState<string | null>(null)

  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geoMessage, setGeoMessage] = useState<string | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  const [isLocating, setIsLocating] = useState(false)
  const secureContext = useMemo(() => getSecureContextInfo(), [])

  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [versions, setVersions] = useState<AddressVersionSummary[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState<string | null>(null)

  // Cada consulta ao geocodificador recebe um número de sequência. Respostas
  // antigas (inclusive as que ignoram o AbortSignal) são descartadas para não
  // sobrescrever um endereço editado depois do início da requisição.
  const geocodeRequestRef = useRef(0)
  const geocodeAbortRef = useRef<AbortController | null>(null)

  // Cada pedido de GPS recebe um token. Se o morador clicar novamente ou
  // alterar o endereço enquanto o navegador responde, a posição antiga não
  // pode sobrescrever a escolha mais recente.
  const gpsRequestRef = useRef(0)

  // Geocodificação automática: só é habilitada depois que o morador edita o
  // endereço (nunca ao simplesmente abrir um endereço já salvo). A assinatura
  // evita repetir a mesma consulta enquanto os campos não mudam.
  const autoGeocodeEnabledRef = useRef(false)
  const lastGeocodeSignatureRef = useRef<string | null>(null)
  const handleGeocodeRef = useRef<(automatic?: boolean) => Promise<void>>(
    async () => {},
  )

  // O ViaCEP também pode responder depois de o morador editar o formulário.
  // O mesmo esquema de token + abort impede que um resultado antigo
  // sobrescreva campos já corrigidos à mão.
  const cepRequestRef = useRef(0)
  const cepAbortRef = useRef<AbortController | null>(null)

  const hasCoordinates =
    coordinates.latitude !== null && coordinates.longitude !== null

  const autoGeocodeSignature = useMemo(
    () => addressSignature(values),
    [values],
  )

  const precisionLabel = useMemo(() => {
    if (!hasCoordinates) return 'Sem ponto definido'
    if (locationMethod === 'gps') {
      const accuracy = formatAccuracy(accuracyMeters)
      return accuracy ? `GPS (${accuracy})` : 'GPS do dispositivo'
    }
    if (precision !== 'geocodificado') return 'Ajustado manualmente'
    return geocodingFonte?.includes('(exato)')
      ? 'Geocodificado (exato)'
      : 'Geocodificado (aproximado)'
  }, [accuracyMeters, geocodingFonte, hasCoordinates, locationMethod, precision])

  /**
   * Cancela a consulta em andamento e invalida o número da requisição. A
   * resposta cancelada pode até chegar, mas será descartada pelo token.
   */
  function abortGeocode() {
    geocodeAbortRef.current?.abort()
    geocodeAbortRef.current = null
    geocodeRequestRef.current += 1
    setIsGeocoding(false)
  }

  function abortCepLookup() {
    cepAbortRef.current?.abort()
    cepAbortRef.current = null
    cepRequestRef.current += 1
    setIsLookingUpCep(false)
  }

  function cancelGpsRequest() {
    gpsRequestRef.current += 1
    setIsLocating(false)
  }

  function invalidateLocation(message: string) {
    setCoordinates({ latitude: null, longitude: null })
    setPrecision('ajustado_manual')
    setLocationMethod(null)
    setAccuracyMeters(null)
    setGeocodingFonte(null)
    setGeocodingLabel(null)
    setPontoConfirmado(false)
    setWarnings([])
    setGeoError(null)
    setGeoMessage(message)
    setErrors((previous) => {
      if (!('coordenadas' in previous) && !('pontoConfirmado' in previous)) {
        return previous
      }
      const next = { ...previous }
      delete next.coordenadas
      delete next.pontoConfirmado
      return next
    })
  }

  function clearError(field: AddressField) {
    setErrors((previous) => {
      if (!(field in previous)) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }

  function updateField(field: keyof AddressFormValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    clearError(field)
    setSaveMessage(null)
    setSaveError(null)

    if (!GEOCODE_AFFECTING_FIELDS.has(field)) return

    // A próxima alteração habilita a consulta automática após o debounce.
    autoGeocodeEnabledRef.current = true

    // O ponto antigo não representa mais o endereço digitado. Abortar também
    // evita que uma resposta atrasada recoloque o marcador no lugar errado.
    abortGeocode()
    // Uma resposta do GPS em voo também não pode sobrescrever o novo endereço.
    cancelGpsRequest()
    // Uma resposta do ViaCEP em voo também não pode sobrescrever o que o
    // morador está digitando agora.
    abortCepLookup()
    if (coordinates.latitude !== null || coordinates.longitude !== null) {
      invalidateLocation(
        'Endereço alterado. Aguarde a localização automática ou clique em “Localizar no mapa”.',
      )
    } else {
      // Sem ponto confirmado não há marcador a invalidar. O aviso de
      // invalidação (se existir) continua visível durante a edição.
      setGeoError(null)
    }
  }

  useEffect(() => {
    if (!client || !userId) {
      return
    }

    let active = true

    async function load() {
      setIsLoadingAddress(true)
      setLoadError(null)
      setVersionsLoading(true)
      setVersionsError(null)

      const [addressResult, versionsResult] = await Promise.allSettled([
        getMyAddress(client!, userId!),
        listMyAddressVersions(client!, userId!),
      ])

      if (!active) return

      if (addressResult.status === 'fulfilled') {
        const address = addressResult.value
        if (address) {
          const loadedValues: AddressFormValues = {
            cep: formatCep(address.cep),
            logradouro: address.logradouro,
            numero: address.numero,
            bairro: address.bairro,
            complemento: address.complemento ?? '',
            municipio: address.municipio,
            uf: address.uf,
          }
          setValues(loadedValues)
          setCoordinates({
            latitude: address.latitude,
            longitude: address.longitude,
          })
          setPrecision(address.precisao)
          setLocationMethod(
            address.precisao === 'geocodificado'
              ? 'geocodificado'
              : address.geocoding_fonte?.startsWith('gps')
                ? 'gps'
                : 'manual',
          )
          setAccuracyMeters(null)
          setGeocodingFonte(address.geocoding_fonte)
          setGeocodingLabel(address.geocoding_label)
          setConsentimento(address.consentimento_lgpd)
          setPontoConfirmado(true)
          setHasSavedAddress(true)
          // Abrir um endereço já salvo não deve disparar nova consulta nem
          // substituir o ponto confirmado anteriormente.
          autoGeocodeEnabledRef.current = false
          lastGeocodeSignatureRef.current = addressSignature(loadedValues)
        }
      } else {
        setLoadError(
          errorMessage(
            addressResult.reason,
            'Não foi possível carregar seu endereço.',
          ),
        )
      }

      if (versionsResult.status === 'fulfilled') {
        setVersions(versionsResult.value)
      } else {
        setVersionsError(
          errorMessage(
            versionsResult.reason,
            'Não foi possível carregar o histórico.',
          ),
        )
      }

      setVersionsLoading(false)
      setIsLoadingAddress(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [client, userId])

  useEffect(() => {
    return () => {
      geocodeAbortRef.current?.abort()
      cepAbortRef.current?.abort()
      gpsRequestRef.current += 1
    }
  }, [])

  // Mantém a referência mais recente sem obrigar o efeito de debounce a
  // reiniciar a cada render.
  useEffect(() => {
    handleGeocodeRef.current = (automatic = false) =>
      handleGeocode(automatic)
  })

  /**
   * Debounce de 800 ms após a última alteração. A consulta só acontece
   * quando CEP, logradouro, número, bairro e município estão completos, e
   * nunca repete a mesma assinatura de endereço já tentada.
   */
  useEffect(() => {
    if (!autoGeocodeEnabledRef.current) return
    if (isLoadingAddress || isGeocoding) return
    if (!isReadyForAutomaticGeocode(values)) return
    if (autoGeocodeSignature === lastGeocodeSignatureRef.current) return

    const timer = window.setTimeout(() => {
      if (lastGeocodeSignatureRef.current === autoGeocodeSignature) return
      void handleGeocodeRef.current(true)
    }, AUTO_GEOCODE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [autoGeocodeSignature, values, isLoadingAddress, isGeocoding])

  async function handleCepLookup() {
    setCepError(null)
    setCepMessage(null)
    setSaveMessage(null)
    setSaveError(null)

    const digits = normalizeCep(values.cep)
    if (!isValidCep(digits)) {
      setErrors((previous) => ({
        ...previous,
        cep: 'Informe um CEP com 8 dígitos.',
      }))
      return
    }

    abortGeocode()
    abortCepLookup()

    const snapshot = values
    const requestId = cepRequestRef.current + 1
    cepRequestRef.current = requestId
    const controller = new AbortController()
    cepAbortRef.current = controller

    setIsLookingUpCep(true)
    try {
      const result = await lookupCep(digits, controller.signal)

      if (cepRequestRef.current !== requestId || controller.signal.aborted) {
        return
      }

      const nextValues: AddressFormValues = {
        ...snapshot,
        cep: formatCep(result.cep || digits),
        logradouro: result.logradouro || snapshot.logradouro,
        bairro: result.bairro || snapshot.bairro,
        complemento: snapshot.complemento || result.complemento,
        municipio: result.localidade || snapshot.municipio,
        uf: result.uf || snapshot.uf,
      }

      const currentNormalized = normalizeAddressValues(snapshot)
      const nextNormalized = normalizeAddressValues(nextValues)
      const addressChanged = [...GEOCODE_AFFECTING_FIELDS].some(
        (field) => currentNormalized[field] !== nextNormalized[field],
      )

      setValues(nextValues)
      setErrors((previous) => {
        const next = { ...previous }
        delete next.cep
        delete next.logradouro
        delete next.bairro
        delete next.municipio
        delete next.uf
        return next
      })

      if (!isMunicipalityOfCajamar(result.localidade, result.uf)) {
        setCepError(
          `O CEP pertence a ${result.localidade}/${result.uf}. Este aplicativo cobre ${env.municipality.name}/${env.municipality.state}. Confira o endereço antes de localizar.`,
        )
      } else {
        setCepMessage(
          'Campos preenchidos pelo ViaCEP. Informe o número; a localização será buscada automaticamente.',
        )
      }

      if (addressChanged && isMunicipalityOfCajamar(result.localidade, result.uf)) {
        autoGeocodeEnabledRef.current = true
        invalidateLocation(
          'Endereço atualizado pelo ViaCEP. Informe o número para localizar automaticamente ou clique em “Localizar no mapa”.',
        )
      }
    } catch (caught) {
      if (cepRequestRef.current !== requestId || controller.signal.aborted) {
        return
      }
      setCepError(
        caught instanceof CepLookupError
          ? caught.message
          : 'Não foi possível consultar o CEP.',
      )
    } finally {
      if (cepRequestRef.current === requestId) {
        cepAbortRef.current = null
        setIsLookingUpCep(false)
      }
    }
  }

  async function handleGeocode(automatic = false) {
    setGeoError(null)
    setGeoMessage(null)
    setSaveMessage(null)
    setSaveError(null)
    abortGeocode()

    const normalized = normalizeAddressValues(values)
    const fieldValidation = validateAddress(
      normalized,
      { latitude: null, longitude: null },
      true,
    )
    const fieldErrors: AddressErrors = { ...fieldValidation.errors }
    delete fieldErrors.coordenadas
    delete fieldErrors.consentimento

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      setGeoError(
        automatic
          ? 'Complete o endereço para localizar automaticamente.'
          : 'Preencha os campos do endereço antes de localizar.',
      )
      return
    }

    // Registra a assinatura mesmo em caso de falha: evita repetir a mesma
    // consulta automática em loop. Uma alteração de campo ou o botão manual
    // forçam uma nova tentativa.
    lastGeocodeSignatureRef.current = addressSignature(normalized)

    const requestId = geocodeRequestRef.current + 1
    geocodeRequestRef.current = requestId
    const controller = new AbortController()
    geocodeAbortRef.current = controller

    setIsGeocoding(true)
    cancelGpsRequest()
    // O ponto antigo deixa de ser confiável assim que uma nova consulta
    // começa. Se a consulta falhar, o morador precisa marcar o mapa; não
    // reaproveitamos coordenadas de um endereço anterior.
    setCoordinates({ latitude: null, longitude: null })
    setPrecision('ajustado_manual')
    setLocationMethod(null)
    setAccuracyMeters(null)
    setGeocodingFonte(null)
    setGeocodingLabel(null)
    setPontoConfirmado(false)
    setWarnings([])
    clearError('coordenadas')

    try {
      const result = await geocodeAddress(normalized, controller.signal)

      // Resposta atrasada de uma consulta antiga: não sobrescreve o estado
      // atual, mesmo que o provedor ignore o AbortSignal.
      if (
        geocodeRequestRef.current !== requestId ||
        controller.signal.aborted
      ) {
        return
      }

      setCoordinates({
        latitude: result.latitude,
        longitude: result.longitude,
      })
      setPrecision('geocodificado')
      setLocationMethod('geocodificado')
      setAccuracyMeters(null)
      setGeocodingFonte(
        `${result.provider} (${result.approximate ? 'aproximado' : 'exato'})`,
      )
      setGeocodingLabel(result.label)
      clearError('coordenadas')
      setGeoMessage(
        result.approximate
          ? 'Localização aproximada. Ajuste o marcador para indicar seu imóvel.'
          : 'Localização encontrada. Confirme o marcador antes de salvar.',
      )
    } catch (caught) {
      if (
        geocodeRequestRef.current !== requestId ||
        controller.signal.aborted
      ) {
        return
      }

      setCoordinates({ latitude: null, longitude: null })
      setPrecision('ajustado_manual')
      setLocationMethod(null)
      setAccuracyMeters(null)
      setGeocodingFonte(null)
      setGeocodingLabel(null)
      setGeoError(
        caught instanceof GeocodingError
          ? caught.message
          : 'Não foi possível localizar este endereço. Marque o ponto no mapa.',
      )
    } finally {
      if (geocodeRequestRef.current === requestId) {
        geocodeAbortRef.current = null
        setIsGeocoding(false)
      }
    }
  }

  async function handleUseCurrentLocation() {
    setGeoError(null)
    setGeoMessage(null)
    setSaveMessage(null)
    setSaveError(null)

    // O GPS substitui qualquer consulta de endereço em andamento, mas só é
    // acionado por clique explícito do morador.
    abortGeocode()
    abortCepLookup()
    // Impede que um debounce pendente do endereço sobrescreva o ponto do GPS.
    lastGeocodeSignatureRef.current = autoGeocodeSignature

    const requestId = gpsRequestRef.current + 1
    gpsRequestRef.current = requestId
    setIsLocating(true)

    try {
      const position = await requestCurrentPosition()
      if (gpsRequestRef.current !== requestId) return

      const latitude = roundCoordinate(position.latitude)
      const longitude = roundCoordinate(position.longitude)
      const accuracy =
        position.accuracyMeters > 0
          ? formatAccuracy(position.accuracyMeters)
          : null

      setCoordinates({ latitude, longitude })
      setPrecision('ajustado_manual')
      setLocationMethod('gps')
      setAccuracyMeters(
        position.accuracyMeters > 0 ? position.accuracyMeters : null,
      )
      setGeocodingFonte('gps-dispositivo')
      setGeocodingLabel(
        accuracy
          ? `Posição do dispositivo (${accuracy})`
          : 'Posição do dispositivo',
      )
      setPontoConfirmado(false)
      setWarnings(
        isWithinCajamarArea(latitude, longitude)
          ? []
          : [
              'Sua localização está fora da área estimada de Cajamar. Confirme no mapa antes de salvar.',
            ],
      )
      setGeoMessage(
        accuracy
          ? `Localização do dispositivo obtida (${accuracy}). Ajuste o marcador se necessário e confirme.`
          : 'Localização do dispositivo obtida. Ajuste o marcador se necessário e confirme.',
      )
      clearError('coordenadas')
      clearError('pontoConfirmado')
    } catch (caught) {
      if (gpsRequestRef.current !== requestId) return
      setGeoError(
        caught instanceof GeolocationError
          ? caught.message
          : 'Não foi possível obter sua localização. Selecione o ponto no mapa.',
      )
    } finally {
      if (gpsRequestRef.current === requestId) setIsLocating(false)
    }
  }

  function handleMapChange(latitude: number, longitude: number) {
    abortGeocode()
    cancelGpsRequest()
    // Um ajuste manual vence a consulta automática pendente: o ponto
    // escolhido pelo morador não deve ser apagado pelo debounce.
    lastGeocodeSignatureRef.current = autoGeocodeSignature
    setCoordinates({
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude),
    })
    setPrecision('ajustado_manual')
    setLocationMethod('manual')
    setAccuracyMeters(null)
    setGeocodingFonte(null)
    setGeocodingLabel(null)
    setPontoConfirmado(false)
    setWarnings([])
    setGeoMessage('Ponto ajustado manualmente. Confirme se ele corresponde ao imóvel.')
    setGeoError(null)
    clearError('coordenadas')
    clearError('pontoConfirmado')
  }

  function handleCoordinateInput(
    axis: 'latitude' | 'longitude',
    raw: string,
  ) {
    abortGeocode()
    cancelGpsRequest()
    lastGeocodeSignatureRef.current = autoGeocodeSignature
    const parsed = raw.trim() === '' ? null : Number(raw)
    setCoordinates((previous) => ({
      ...previous,
      [axis]: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    }))
    setPrecision('ajustado_manual')
    setLocationMethod('manual')
    setAccuracyMeters(null)
    setGeocodingFonte(null)
    setGeocodingLabel(null)
    setPontoConfirmado(false)
    setWarnings([])
    setGeoMessage(null)
    setGeoError(null)
    clearError('coordenadas')
    clearError('pontoConfirmado')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveMessage(null)
    setSaveError(null)

    // Enquanto o geocodificador ou o GPS responde, as coordenadas foram
    // zeradas/atualizadas de propósito. Salvar aqui persistiria um ponto
    // incompleto ou desatualizado.
    if (isGeocoding || isLocating) {
      setSaveError(
        'Aguarde a localização terminar antes de salvar o endereço.',
      )
      return
    }

    const normalized = normalizeAddressValues(values)
    const validation = validateAddress(normalized, coordinates, consentimento)
    setErrors(validation.errors)
    setWarnings(validation.warnings)

    if (Object.keys(validation.errors).length > 0) {
      setSaveError('Revise os campos destacados antes de salvar.')
      focusFirstInvalid(event.currentTarget)
      return
    }

    if (
      coordinates.latitude !== null &&
      coordinates.longitude !== null &&
      !pontoConfirmado
    ) {
      setErrors((previous) => ({
        ...previous,
        pontoConfirmado:
          'Confirme que o marcador no mapa corresponde ao seu imóvel.',
      }))
      setSaveError(
        'Confirme o ponto no mapa antes de salvar o endereço.',
      )
      return
    }

    if (
      !client ||
      !userId ||
      coordinates.latitude === null ||
      coordinates.longitude === null
    ) {
      setSaveError('Sessão ou localização indisponível. Entre novamente.')
      return
    }

    setIsSaving(true)
    try {
      const saved = await saveMyAddress(client, userId, {
        ...normalized,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        precisao: precision,
        geocodingFonte,
        geocodingLabel,
      })

      const savedValues: AddressFormValues = {
        cep: formatCep(saved.cep),
        logradouro: saved.logradouro,
        numero: saved.numero,
        bairro: saved.bairro,
        complemento: saved.complemento ?? '',
        municipio: saved.municipio,
        uf: saved.uf,
      }
      setValues(savedValues)
      lastGeocodeSignatureRef.current = addressSignature(savedValues)
      setCoordinates({
        latitude: saved.latitude,
        longitude: saved.longitude,
      })
      setPrecision(saved.precisao)
      setLocationMethod(
        saved.precisao === 'geocodificado'
          ? 'geocodificado'
          : saved.geocoding_fonte?.startsWith('gps')
            ? 'gps'
            : 'manual',
      )
      if (!saved.geocoding_fonte?.startsWith('gps')) setAccuracyMeters(null)
      setGeocodingFonte(saved.geocoding_fonte)
      setGeocodingLabel(saved.geocoding_label)
      setPontoConfirmado(true)
      setHasSavedAddress(true)
      setConsentimento(true)
      setSaveMessage(
        hasSavedAddress
          ? 'Endereço atualizado. Uma nova versão foi registrada no histórico.'
          : 'Endereço salvo. A primeira versão já aparece no histórico.',
      )

      // O /mapa e outras abas recarregam o ponto privado sem exigir F5.
      notifyAddressUpdated()

      try {
        const history = await listMyAddressVersions(client, userId)
        setVersions(history)
        setVersionsError(null)
      } catch (caught) {
        setVersionsError(
          errorMessage(
            caught,
            'O endereço foi salvo, mas o histórico não pôde ser atualizado agora.',
          ),
        )
      }
    } catch (caught) {
      setSaveError(
        caught instanceof AddressRepositoryError
          ? caught.message
          : 'Não foi possível salvar o endereço.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (!userId) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-600" role="alert">
          Sessão não encontrada. Entre novamente para cadastrar seu endereço.
        </p>
      </Card>
    )
  }

  if (isLoadingAddress) {
    return (
      <Card className="flex items-center gap-3 p-5" aria-live="polite">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-brand-700"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-600">Carregando seu endereço…</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <ol aria-label="Etapas para salvar o endereço" className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-[13px] sm:p-4">
        {['Preencha o endereço','Confirme no mapa','Salve o endereço'].map((step,index)=><li key={step} className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-800">{index+1}</span><span className="font-medium text-slate-700">{step}</span></li>)}
      </ol>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">Privado</Badge>
          <Badge tone={hasCoordinates ? 'safe' : 'neutral'}>
            {precisionLabel}
          </Badge>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Meu endereço
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Cadastre o imóvel, confirme a localização no mapa e mantenha o
          histórico das alterações. O endereço é privado e visível apenas para
          sua conta.
        </p>
      </div>

      {loadError ? (
        <div
          className="flex items-start gap-2 rounded-2xl border border-attention-200 bg-attention-50 p-3 text-xs leading-relaxed text-attention-900"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {loadError} Você ainda pode preencher o formulário abaixo.
        </div>
      ) : null}

      <form noValidate onSubmit={(event) => void handleSave(event)}>
        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                Dados do endereço
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                O CEP preenche os campos, mas não define a posição exata
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label htmlFor="cep" className="text-xs font-bold text-slate-700">
                CEP
              </label>
              <div className="flex gap-2">
                <input
                  id="cep"
                  name="cep"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={9}
                  value={values.cep}
                  onChange={(event) =>
                    updateField('cep', formatCep(event.target.value))
                  }
                  className={cn(
                    FIELD_CLASS,
                    errors.cep && 'border-alert-300 focus:border-alert-400',
                  )}
                  placeholder="00000-000"
                  aria-invalid={Boolean(errors.cep)}
                  aria-describedby={errors.cep ? 'cep-error' : undefined}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={isLookingUpCep}
                  onClick={() => void handleCepLookup()}
                  aria-label="Consultar CEP no ViaCEP"
                  className="mt-1 shrink-0"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  CEP
                </Button>
              </div>
              <FieldError id="cep-error" message={errors.cep} />
              {cepError ? (
                <p className="mt-1 text-[13px] text-alert-700" role="alert">
                  {cepError}
                </p>
              ) : null}
              {cepMessage ? (
                <p className="mt-1 text-[13px] text-emerald-700" role="status">
                  {cepMessage}
                </p>
              ) : null}
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="logradouro"
                className="text-xs font-bold text-slate-700"
              >
                Logradouro
              </label>
              <input
                id="logradouro"
                name="logradouro"
                type="text"
                autoComplete="address-line1"
                required
                maxLength={255}
                value={values.logradouro}
                onChange={(event) =>
                  updateField('logradouro', event.target.value)
                }
                className={cn(
                  FIELD_CLASS,
                  errors.logradouro && 'border-alert-300',
                )}
                placeholder="Rua, avenida, travessa…"
                aria-invalid={Boolean(errors.logradouro)}
                aria-describedby={
                  errors.logradouro ? 'logradouro-error' : undefined
                }
              />
              <FieldError
                id="logradouro-error"
                message={errors.logradouro}
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="numero"
                className="text-xs font-bold text-slate-700"
              >
                Número
              </label>
              <input
                id="numero"
                name="numero"
                type="text"
                autoComplete="address-line2"
                required
                maxLength={30}
                value={values.numero}
                onChange={(event) => updateField('numero', event.target.value)}
                className={cn(FIELD_CLASS, errors.numero && 'border-alert-300')}
                placeholder="123 ou S/N"
                aria-invalid={Boolean(errors.numero)}
                aria-describedby={errors.numero ? 'numero-error' : undefined}
              />
              <FieldError id="numero-error" message={errors.numero} />
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="complemento"
                className="text-xs font-bold text-slate-700"
              >
                Complemento <span className="font-normal text-slate-500">(opcional)</span>
              </label>
              <input
                id="complemento"
                name="complemento"
                type="text"
                autoComplete="address-line3"
                maxLength={120}
                value={values.complemento}
                onChange={(event) =>
                  updateField('complemento', event.target.value)
                }
                className={FIELD_CLASS}
                placeholder="Casa, bloco, apartamento…"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="bairro"
                className="text-xs font-bold text-slate-700"
              >
                Bairro
              </label>
              <input
                id="bairro"
                name="bairro"
                type="text"
                autoComplete="address-level3"
                required
                maxLength={120}
                value={values.bairro}
                onChange={(event) => updateField('bairro', event.target.value)}
                className={cn(FIELD_CLASS, errors.bairro && 'border-alert-300')}
                placeholder="Bairro"
                aria-invalid={Boolean(errors.bairro)}
                aria-describedby={errors.bairro ? 'bairro-error' : undefined}
              />
              <FieldError id="bairro-error" message={errors.bairro} />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="municipio"
                className="text-xs font-bold text-slate-700"
              >
                Município
              </label>
              <input
                id="municipio"
                name="municipio"
                type="text"
                autoComplete="address-level2"
                required
                maxLength={120}
                value={values.municipio}
                onChange={(event) =>
                  updateField('municipio', event.target.value)
                }
                className={cn(
                  FIELD_CLASS,
                  errors.municipio && 'border-alert-300',
                )}
                aria-invalid={Boolean(errors.municipio)}
                aria-describedby={
                  errors.municipio ? 'municipio-error' : undefined
                }
              />
              <FieldError id="municipio-error" message={errors.municipio} />
            </div>

            <div className="sm:col-span-1">
              <label htmlFor="uf" className="text-xs font-bold text-slate-700">
                UF
              </label>
              <input
                id="uf"
                name="uf"
                type="text"
                autoComplete="address-level1"
                required
                maxLength={2}
                value={values.uf}
                onChange={(event) =>
                  updateField('uf', event.target.value.toUpperCase())
                }
                className={cn(FIELD_CLASS, errors.uf && 'border-alert-300')}
                aria-invalid={Boolean(errors.uf)}
                aria-describedby={errors.uf ? 'uf-error' : undefined}
              />
              <FieldError id="uf-error" message={errors.uf} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              isLoading={isGeocoding}
              onClick={() => void handleGeocode()}
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              Localizar no mapa
            </Button>
            <Button
              type="button"
              variant="secondary"
              isLoading={isLocating}
              onClick={() => void handleUseCurrentLocation()}
            >
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
              Usar minha localização atual
            </Button>
            <span className="self-center text-[13px] leading-relaxed text-slate-500">
              A localização é buscada automaticamente 800 ms após o preenchimento.
              Você poderá corrigir o ponto.
            </span>
          </div>

          {secureContext.warning ? (
            <p
              className="mt-3 rounded-2xl border border-attention-200 bg-attention-50 p-3 text-[13px] leading-relaxed text-attention-900"
              role="status"
            >
              {secureContext.warning}
            </p>
          ) : null}

          {isLocating ? (
            <p
              className="mt-2 flex items-center gap-1.5 text-[13px] text-brand-700"
              role="status"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Solicitando sua localização ao dispositivo…
            </p>
          ) : null}
          {isGeocoding ? (
            <p
              className="mt-2 flex items-center gap-1.5 text-[13px] text-brand-700"
              role="status"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Consultando a OpenGeocoding…
            </p>
          ) : null}
        </Card>

        <Card className="mt-4 p-5 sm:p-6" aria-labelledby="confirmar-localizacao">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="confirmar-localizacao"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Confirmar localização
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Selecionar no mapa: toque no mapa ou arraste o marcador para
                ajustar
              </p>
            </div>
            <Badge
              tone={
                !hasCoordinates
                  ? 'neutral'
                  : precision === 'geocodificado'
                    ? 'attention'
                    : 'brand'
              }
            >
              {precisionLabel}
            </Badge>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <AddressMapPicker
              latitude={coordinates.latitude}
              longitude={coordinates.longitude}
              onChange={handleMapChange}
            />
          </div>

          <dl
            className="mt-3 grid gap-2 rounded-2xl bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-600 sm:grid-cols-4"
            aria-live="polite"
          >
            <div>
              <dt className="font-bold text-slate-700">Latitude</dt>
              <dd className="font-mono tabular-nums">
                {formatCoordinate(coordinates.latitude)}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">Longitude</dt>
              <dd className="font-mono tabular-nums">
                {formatCoordinate(coordinates.longitude)}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">Precisão</dt>
              <dd>{precisionLabel}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">Precisão do GPS</dt>
              <dd>{formatAccuracy(accuracyMeters) ?? '—'}</dd>
            </div>
          </dl>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="latitude"
                className="text-xs font-bold text-slate-700"
              >
                Latitude
              </label>
              <input
                id="latitude"
                name="latitude"
                type="number"
                inputMode="decimal"
                step="0.000001"
                min={-90}
                max={90}
                value={coordinates.latitude ?? ''}
                onChange={(event) =>
                  handleCoordinateInput('latitude', event.target.value)
                }
                className={FIELD_CLASS}
                placeholder="-23.356111"
              />
            </div>
            <div>
              <label
                htmlFor="longitude"
                className="text-xs font-bold text-slate-700"
              >
                Longitude
              </label>
              <input
                id="longitude"
                name="longitude"
                type="number"
                inputMode="decimal"
                step="0.000001"
                min={-180}
                max={180}
                value={coordinates.longitude ?? ''}
                onChange={(event) =>
                  handleCoordinateInput('longitude', event.target.value)
                }
                className={FIELD_CLASS}
                placeholder="-46.876944"
              />
            </div>
          </div>

          <FieldError id="coordenadas-error" message={errors.coordenadas} />

          {warnings.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-attention-200 bg-attention-50 p-3 text-[13px] leading-relaxed text-attention-900">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          {geoError ? (
            <p
              className="mt-3 rounded-2xl border border-alert-200 bg-alert-50 p-3 text-[13px] leading-relaxed text-alert-800"
              role="alert"
            >
              {geoError}
            </p>
          ) : null}

          {geoMessage ? (
            <p
              className="mt-3 rounded-2xl border border-brand-100 bg-brand-50 p-3 text-[13px] leading-relaxed text-brand-900"
              role="status"
            >
              {geoMessage}
            </p>
          ) : null}

          {geocodingLabel || geocodingFonte ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {geocodingLabel ? (
                <>
                  {locationMethod === 'gps'
                    ? 'Localização do dispositivo: '
                    : 'Resultado do geocodificador: '}
                  {geocodingLabel}
                </>
              ) : null}
              {geocodingFonte ? (
                <>
                  {geocodingLabel ? ' — ' : null}
                  Fonte: {geocodingFonte}
                </>
              ) : null}
            </p>
          ) : null}

          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {OPENGEOCODING_ATTRIBUTION}
          </p>

          <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-relaxed text-slate-500">
            <ShieldCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            O centro do CEP não é tratado como posição da residência. O ponto
            salvo é o que aparece no mapa, com a precisão indicada acima.
          </p>
        </Card>

        <Card className="mt-4 p-5 sm:p-6">
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
            <input
              type="checkbox"
              checked={consentimento}
              onChange={(event) => {
                setConsentimento(event.target.checked)
                clearError('consentimento')
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-200"
              aria-invalid={Boolean(errors.consentimento)}
              aria-describedby={
                errors.consentimento ? 'consentimento-error' : undefined
              }
            />
            <span>
              Autorizo o armazenamento deste endereço e das coordenadas para
              funcionamento do aplicativo. Sei que o endereço não será exibido
              publicamente e que posso solicitar correção ou exclusão pelos
              canais do projeto.
            </span>
          </label>
          <FieldError
            id="consentimento-error"
            message={errors.consentimento}
          />

          <label className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
            <input
              type="checkbox"
              checked={pontoConfirmado}
              disabled={!hasCoordinates}
              onChange={(event) => {
                setPontoConfirmado(event.target.checked)
                clearError('pontoConfirmado')
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-200 disabled:opacity-50"
              aria-invalid={Boolean(errors.pontoConfirmado)}
              aria-describedby={
                errors.pontoConfirmado ? 'ponto-confirmado-error' : undefined
              }
            />
            <span>
              Confirmo que o marcador no mapa corresponde ao meu imóvel. O
              endereço só será salvo depois desta confirmação.
            </span>
          </label>
          <FieldError
            id="ponto-confirmado-error"
            message={errors.pontoConfirmado}
          />

          {saveError ? (
            <div
              className="mt-4 flex items-start gap-2 rounded-2xl border border-alert-200 bg-alert-50 p-3 text-xs leading-relaxed text-alert-800"
              role="alert"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {saveError}
            </div>
          ) : null}

          {saveMessage ? (
            <div
              className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800"
              role="status"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {saveMessage}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" isLoading={isSaving}>
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {hasSavedAddress ? 'Atualizar endereço' : 'Salvar endereço'}
            </Button>
            <span className="text-[13px] leading-relaxed text-slate-500">
              {hasSavedAddress
                ? 'A atualização cria uma nova versão; as anteriores são preservadas.'
                : 'O primeiro salvamento cria a versão inicial do histórico.'}
            </span>
          </div>
        </Card>
      </form>

      <AddressHistory
        versions={versions}
        isLoading={versionsLoading}
        error={versionsError}
      />
    </div>
  )
}
