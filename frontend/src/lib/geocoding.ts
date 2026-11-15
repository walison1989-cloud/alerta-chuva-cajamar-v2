import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { env } from '@/config/env'
import {
  formatCep,
  isWithinCajamarArea,
  normalizeAddressValues,
} from '@/lib/addressValidation'
import { getSupabaseClient } from '@/lib/supabase'
import type {
  AddressFormValues,
  GeocodeAddressDetails,
  GeocodeResult,
} from '@/types/address'

/**
 * Atribuição exigida pela OpenGeocoding e pelos provedores de dados
 * associados. Deve permanecer visível onde o resultado é apresentado.
 */
export const OPENGEOCODING_ATTRIBUTION =
  'Data © OpenStreetMap contributors (ODbL), Overture Maps Foundation, OpenAddresses contributors, GeoNames (CC BY 4.0, modified).'

const GEOCODING_CACHE_TTL_MS = 5 * 60 * 1000
const GEOCODING_CACHE_MAX_ENTRIES = 50

const DETAIL_KEYS = [
  'country',
  'countryCode',
  'state',
  'city',
  'town',
  'municipality',
  'village',
  'suburb',
  'neighbourhood',
  'road',
  'houseNumber',
  'postcode',
] as const

export class GeocodingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeocodingError'
  }
}

/** Contrato devolvido pela Edge Function `geocode-address`. */
export interface OpenGeocodingEdgeResponse {
  found?: boolean
  latitude?: unknown
  longitude?: unknown
  displayName?: unknown
  goodMatch?: unknown
  approximate?: unknown
  addressDetails?: unknown
  provider?: unknown
  attribution?: unknown
  cached?: unknown
  message?: unknown
  reason?: unknown
}

interface CacheEntry {
  expiresAt: number
  result: GeocodeResult
}

const resultCache = new Map<string, CacheEntry>()

/** Usado pelos testes e por um eventual botão de “consultar novamente”. */
export function clearGeocodeCache(): void {
  resultCache.clear()
}

function readCached(key: string): GeocodeResult | null {
  const entry = resultCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    resultCache.delete(key)
    return null
  }
  return entry.result
}

function writeCache(key: string, result: GeocodeResult): void {
  if (resultCache.size >= GEOCODING_CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value
    if (oldest !== undefined) resultCache.delete(oldest)
  }
  resultCache.set(key, {
    expiresAt: Date.now() + GEOCODING_CACHE_TTL_MS,
    result,
  })
}

/**
 * Consulta enviada à OpenGeocoding. Inclui o CEP porque ele ajuda a
 * desambiguar o logradouro e permite validar a resposta.
 */
export function buildGeocodeQuery(values: AddressFormValues): string {
  const normalized = normalizeAddressValues(values)
  return [
    normalized.logradouro,
    normalized.numero,
    normalized.bairro,
    normalized.municipio,
    normalized.uf,
    formatCep(normalized.cep),
    'Brasil',
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
}

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function readComponent(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readAddressDetails(value: unknown): GeocodeAddressDetails {
  if (!value || typeof value !== 'object') return {}
  const source = value as Record<string, unknown>
  const details: GeocodeAddressDetails = {}

  for (const key of DETAIL_KEYS) {
    const component = readComponent(source, key)
    if (component) details[key] = component
  }

  if (Array.isArray(source.regionCodes)) {
    const codes = source.regionCodes
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const code = (item as Record<string, unknown>).code
        return typeof code === 'string' && code.trim() ? code.trim() : null
      })
      .filter((code): code is string => Boolean(code))
    if (codes.length > 0) details.regionCodes = codes
  }

  return details
}

function matchesValue(
  component: string | undefined,
  expected: string[],
): boolean {
  if (!component) return false
  const normalized = normalizeText(component)
  return expected.some((candidate) => normalizeText(candidate) === normalized)
}

function municipalityMatches(component: string | undefined): boolean {
  if (!component) return false
  const norm = normalizeText(component)
  const munNorm = normalizeText(env.municipality.name)
  return norm === munNorm || norm.includes(munNorm) || munNorm.includes(norm)
}

function stateMatches(details: GeocodeAddressDetails): boolean {
  const state = details.state
  if (
    matchesValue(state, [
      env.municipality.state,
      'São Paulo',
      'Sao Paulo',
      'Estado de São Paulo',
    ])
  ) {
    return true
  }
  const norm = normalizeText(state ?? '')
  if (norm.includes('sao paulo') || norm === 'sp') return true

  return (details.regionCodes ?? []).some(
    (code) =>
      normalizeText(code) === normalizeText(`BR-${env.municipality.state}`) ||
      normalizeText(code).includes(normalizeText(env.municipality.state)),
  )
}

function countryMatches(details: GeocodeAddressDetails): boolean {
  if (matchesValue(details.countryCode, ['br'])) return true
  return matchesValue(details.country, ['Brasil', 'Brazil'])
}

function roadMatches(
  component: string | undefined,
  expected: string,
): boolean {
  if (!component) return false
  const actual = normalizeText(component)
  const wanted = normalizeText(expected)
  if (!actual || !wanted) return false
  return actual === wanted || actual.includes(wanted) || wanted.includes(actual)
}

function numberMatches(
  component: string | undefined,
  expected: string,
): boolean {
  if (!component) return false
  const actual = normalizeText(component)
  const wanted = normalizeText(expected)
  if (!actual || !wanted) return false
  return actual === wanted
}

function postcodeMatches(
  component: string | undefined,
  expected: string,
): boolean {
  if (!component) return false
  return component.replace(/\D/g, '') === expected.replace(/\D/g, '')
}

/**
 * Interpreta a resposta da Edge Function/OpenGeocoding sem presumir que todos
 * os campos existem. Só considera a posição exata quando `goodMatch` e os
 * componentes essenciais confirmam o endereço; caso contrário, marca como
 * aproximada para o morador ajustar o marcador.
 */
export function parseGeocodeResponse(
  payload: OpenGeocodingEdgeResponse,
  values: AddressFormValues,
): GeocodeResult {
  const normalized = normalizeAddressValues(values)

  if (payload.found === false) {
    throw new GeocodingError(
      typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : 'Nenhum ponto foi encontrado para este endereço. Ajuste os dados ou marque o local no mapa.',
    )
  }

  const latitude = Number(payload.latitude)
  const longitude = Number(payload.longitude)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new GeocodingError(
      'O serviço de localização não retornou coordenadas válidas. Marque o ponto no mapa.',
    )
  }

  if (!isWithinCajamarArea(latitude, longitude)) {
    throw new GeocodingError(
      'O ponto encontrado está fora da área de Cajamar. Confira o endereço ou marque o local no mapa.',
    )
  }

  const details = readAddressDetails(payload.addressDetails)

  const countryPresent = Boolean(details.country || details.countryCode)
  if (countryPresent && !countryMatches(details)) {
    throw new GeocodingError(
      'O endereço encontrado está fora do Brasil. Confira o CEP e o município.',
    )
  }

  const municipalityCandidates = [
    details.city,
    details.town,
    details.municipality,
    details.village,
  ].filter((candidate): candidate is string => Boolean(candidate))
  const municipalityPresent = municipalityCandidates.length > 0
  const municipalityConfirmed =
    municipalityPresent &&
    municipalityCandidates.some((candidate) => municipalityMatches(candidate))

  if (municipalityPresent && !municipalityConfirmed) {
    throw new GeocodingError(
      `O endereço encontrado pertence a ${municipalityCandidates[0]}, não a ${env.municipality.name}/${env.municipality.state}. Confira o CEP e o município.`,
    )
  }

  if (details.state && !stateMatches(details)) {
    throw new GeocodingError(
      `O endereço encontrado está em ${details.state}, não em ${env.municipality.state}. Confira o CEP e a UF.`,
    )
  }

  const goodMatch = payload.goodMatch === true
  const roadConfirmed = roadMatches(details.road, normalized.logradouro)
  const numberConfirmed = numberMatches(details.houseNumber, normalized.numero)
  const postcodeConfirmed = postcodeMatches(details.postcode, normalized.cep)

  const approximate =
    !goodMatch ||
    !countryMatches(details) ||
    !municipalityConfirmed ||
    !stateMatches(details) ||
    !roadConfirmed ||
    !numberConfirmed ||
    !postcodeConfirmed

  return {
    latitude: Math.round(latitude * 1_000_000) / 1_000_000,
    longitude: Math.round(longitude * 1_000_000) / 1_000_000,
    label:
      typeof payload.displayName === 'string' && payload.displayName.trim()
        ? payload.displayName.trim()
        : buildGeocodeQuery(normalized),
    provider:
      typeof payload.provider === 'string' && payload.provider.trim()
        ? payload.provider.trim()
        : 'opengeocoding.com',
    goodMatch,
    approximate,
    addressDetails: details,
    attribution:
      typeof payload.attribution === 'string' && payload.attribution.trim()
        ? payload.attribution.trim()
        : OPENGEOCODING_ATTRIBUTION,
    cached: payload.cached === true,
  }
}

async function translateFunctionError(error: unknown): Promise<GeocodingError> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status
    let message: string | null = null
    try {
      const cloned = error.context.clone()
      const body = (await cloned.json()) as unknown
      if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>
        if (typeof record.message === 'string' && record.message.trim()) {
          message = record.message.trim()
        } else if (typeof record.error === 'string' && record.error.trim()) {
          message = record.error.trim()
        } else if (typeof record.msg === 'string' && record.msg.trim()) {
          message = record.msg.trim()
        } else if (
          typeof record.error_description === 'string' &&
          record.error_description.trim()
        ) {
          message = record.error_description.trim()
        }
      }
    } catch {
      try {
        const text = await error.context.clone().text()
        if (text && text.trim() && text.length < 200 && !text.startsWith('<')) {
          message = text.trim()
        }
      } catch {
        message = null
      }
    }

    if (status === 401) {
      return new GeocodingError(
        'Sua sessão expirou ou a geocodificação exige autenticação. Entre novamente para localizar o endereço.',
      )
    }
    if (status === 403) {
      return new GeocodingError(
        message ||
          'A geocodificação não autorizou esta origem. Verifique a configuração da chave e dos domínios autorizados.',
      )
    }
    if (status === 404) {
      return new GeocodingError(
        message ||
          'A função de geocodificação não foi encontrada no servidor (HTTP 404). Verifique se a Edge Function foi publicada.',
      )
    }
    if (status === 429) {
      const retryAfter = Number(
        error.context.headers.get('retry-after') ?? '',
      )
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? ` Aguarde ${Math.ceil(retryAfter)} s antes de tentar novamente.`
          : ' Aguarde alguns segundos antes de tentar novamente.'
      return new GeocodingError(
        `${message ?? 'Muitas consultas de localização em pouco tempo.'}${wait}`,
      )
    }
    if (status === 502) {
      return new GeocodingError(
        message ||
          'Falha de comunicação com o serviço OpenGeocoding (HTTP 502). Tente novamente ou marque o ponto no mapa.',
      )
    }
    if (status === 503) {
      return new GeocodingError(
        message ||
          'O serviço de geocodificação está temporariamente indisponível (HTTP 503).',
      )
    }
    if (status >= 500) {
      return new GeocodingError(
        message
          ? `Erro no servidor de geocodificação: ${message}`
          : 'Erro interno no servidor de geocodificação (HTTP 500). Marque o ponto manualmente no mapa.',
      )
    }
    return new GeocodingError(
      message ??
        'O serviço de localização está indisponível. Marque o ponto manualmente no mapa.',
    )
  }

  if (error instanceof FunctionsFetchError) {
    return new GeocodingError(
      'Não foi possível conectar ao serviço de localização. Verifique a conexão e marque o ponto manualmente se necessário.',
    )
  }

  if (error instanceof FunctionsRelayError) {
    return new GeocodingError(
      'O serviço de localização está temporariamente indisponível. Tente novamente em instantes ou marque o ponto no mapa.',
    )
  }

  return new GeocodingError(
    'Não foi possível localizar este endereço. Marque o ponto no mapa.',
  )
}

/**
 * Geocodifica o endereço pela Edge Function `geocode-address`, que guarda a
 * chave da OpenGeocoding como secret no servidor. O resultado é aproximado e
 * precisa ser confirmado/ajustado no mapa antes de salvar.
 */
export async function geocodeAddress(
  values: AddressFormValues,
  signal?: AbortSignal,
): Promise<GeocodeResult> {
  const normalized = normalizeAddressValues(values)

  if (
    normalized.logradouro.length < 3 ||
    !normalized.numero ||
    !normalized.bairro ||
    normalized.municipio.length < 2
  ) {
    throw new GeocodingError(
      'Preencha logradouro, número, bairro e município antes de localizar.',
    )
  }

  if (!/^\d{8}$/.test(normalized.cep)) {
    throw new GeocodingError(
      'Informe um CEP válido com 8 dígitos antes de localizar.',
    )
  }

  const client = getSupabaseClient()
  if (!client) {
    throw new GeocodingError(
      'A geocodificação não está configurada neste ambiente. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    )
  }

  const addressString = buildGeocodeQuery(normalized)
  const cacheKey = addressString.toLowerCase()
  const cached = readCached(cacheKey)
  if (cached) {
    if (signal?.aborted) {
      throw new GeocodingError('A consulta de localização foi cancelada.')
    }
    return cached
  }

  // Garante que o token de sessão do usuário logado é enviado explicitamente se disponível
  const sessionResult = await client.auth?.getSession?.()
  const token = sessionResult?.data?.session?.access_token
  const invokeHeaders: Record<string, string> = {}
  if (token) {
    invokeHeaders.Authorization = `Bearer ${token}`
  }

  const { data, error } = await client.functions.invoke<OpenGeocodingEdgeResponse>(
    env.geocodingFunction,
    {
      body: { addressString },
      headers: invokeHeaders,
      signal,
      timeout: 15_000,
    },
  )

  if (error) {
    throw await translateFunctionError(error)
  }

  if (!data) {
    throw new GeocodingError(
      'O serviço de localização retornou uma resposta vazia. Marque o ponto no mapa.',
    )
  }

  const result = parseGeocodeResponse(data, normalized)
  writeCache(cacheKey, result)
  return result
}
