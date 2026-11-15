// =====================================================================
// Edge Function: geocode-address
//
// Proxy autenticado entre o frontend e a OpenGeocoding API. A chave
// OPENGEOCODING_API_KEY fica apenas no secret do Supabase e nunca chega ao
// navegador. Também aplica cache em memória e limite de requisições.
//
// Autenticação oficial: npm:@supabase/supabase-js@2 com validação
// da sessão do usuário via supabase.auth.getUser(token).
//
// Deploy:
//   npx supabase secrets set OPENGEOCODING_API_KEY=og_...
//   npx supabase functions deploy geocode-address --no-verify-jwt --project-ref csobfhhvvqqhqinfllri
//
// Docs: https://opengeocoding.com/docs/search
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const OPENGEOCODING_ENDPOINT = 'https://api.opengeocoding.com/v1/search'
const SEARCH_TIMEOUT_MS = 9_500
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 200
const RATE_WINDOW_MS = 1_000
const RATE_MAX_REQUESTS = 2

const ATTRIBUTION =
  'Data © OpenStreetMap contributors (ODbL), Overture Maps Foundation, OpenAddresses contributors, GeoNames (CC BY 4.0, modified).'

const DEFAULT_MUNICIPALITY = 'Cajamar'
const DEFAULT_STATE = 'SP'

// Caixa envolvente de segurança para Cajamar/SP
const CAJAMAR_BOUNDS = {
  minLat: -23.4906,
  maxLat: -23.2179,
  minLon: -47.002,
  maxLon: -46.7597,
}

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

interface CacheEntry {
  expiresAt: number
  payload: Record<string, unknown>
}

interface RateBucket {
  windowStart: number
  count: number
}

const cache = new Map<string, CacheEntry>()
const rateBuckets = new Map<string, RateBucket>()

function env(name: string, fallback = ''): string {
  return (Deno.env.get(name) ?? fallback).trim()
}

function municipalityName(): string {
  return env('MUNICIPIO_NOME', DEFAULT_MUNICIPALITY).trim()
}

function municipalityState(): string {
  return env('MUNICIPIO_UF', DEFAULT_STATE).trim().toUpperCase()
}

function allowedOrigins(): string[] {
  const configured = env('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  // Sempre inclui as portas locais padrão de desenvolvimento para evitar bloqueios
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]

  if (configured.includes('*')) {
    return ['*']
  }

  return Array.from(new Set([...configured, ...defaults]))
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true
  const allowed = allowedOrigins()
  if (allowed.includes('*')) return true
  if (allowed.includes(origin)) return true
  return false
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin')
  const allowed = allowedOrigins()
  const wildcard = allowed.includes('*')
  const allowOrigin =
    wildcard
      ? '*'
      : origin && isAllowedOrigin(origin)
        ? origin
        : allowed[0] ?? '*'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(
  request: Request,
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function readDetails(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const source = value as Record<string, unknown>
  const details: Record<string, string> = {}

  for (const key of DETAIL_KEYS) {
    const component = source[key]
    if (typeof component === 'string' && component.trim()) {
      details[key] = component.trim()
    }
  }

  return details
}

function readRegionCodes(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const regionCodes = (value as Record<string, unknown>).regionCodes
  if (!Array.isArray(regionCodes)) return []

  return regionCodes
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const code = (item as Record<string, unknown>).code
      return typeof code === 'string' && code.trim() ? code.trim() : null
    })
    .filter((code): code is string => Boolean(code))
}

function stateMatches(
  state: string | undefined,
  regionCodes: string[],
): boolean {
  const uf = municipalityState()
  const expectedName = uf === 'SP' ? 'sao paulo' : ''
  const stateName = normalizeText(state ?? '')
  const nameMatches =
    stateName === normalizeText(uf) ||
    stateName === expectedName ||
    false

  const regionCodeMatches =
    regionCodes.length > 0 &&
    regionCodes.some(
      (code) =>
        normalizeText(code) === normalizeText(`BR-${uf}`) ||
        normalizeText(code) === normalizeText(uf),
    )

  return (!stateName || nameMatches) && (regionCodes.length === 0 || regionCodeMatches)
}

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(key)

  if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
    // Expired identities must not accumulate for the lifetime of a warm isolate.
    for (const [bucketKey, value] of rateBuckets) {
      if (now - value.windowStart >= RATE_WINDOW_MS) rateBuckets.delete(bucketKey)
    }
    if (rateBuckets.size >= 2000) return true
    rateBuckets.set(key, { windowStart: now, count: 1 })
    return false
  }

  if (bucket.count >= RATE_MAX_REQUESTS) return true

  bucket.count += 1
  return false
}

function readCached(key: string): Record<string, unknown> | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.payload
}

function writeCache(key: string, payload: Record<string, unknown>): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload })
}

function upstreamError(
  request: Request,
  status: number,
  code: string,
  message: string,
  retryAfter?: string | null,
): Response {
  const headers: Record<string, string> = {}
  if (retryAfter) headers['Retry-After'] = retryAfter
  return json(request, status, { code, message, error: message }, headers)
}

/**
 * Consulta a API da OpenGeocoding com timeout seguro
 */
async function callOpenGeocoding(
  query: string,
  apiKey: string,
): Promise<{ status: number; ok: boolean; data: Record<string, unknown> | null; raw: string }> {
  const resp = await fetch(OPENGEOCODING_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ addressString: query }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })

  const raw = await resp.text()
  let data: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, unknown>
    }
  } catch {
    data = null
  }

  return { status: resp.status, ok: resp.ok, data, raw }
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }

  if (request.method !== 'POST') {
    return upstreamError(
      request,
      405,
      'method_not_allowed',
      'Use POST para consultar a geocodificação.',
    )
  }

  const origin = request.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) {
    return upstreamError(
      request,
      403,
      'origin_not_allowed',
      'Esta origem não está autorizada a usar a geocodificação.',
    )
  }

  const supabaseUrl = env('SUPABASE_URL')
  const anonKey =
    env('SUPABASE_ANON_KEY') ||
    env('SUPABASE_PUBLISHABLE_KEY')

  if (!supabaseUrl || !anonKey) {
    return upstreamError(
      request,
      503,
      'supabase_not_configured',
      'A função de geocodificação não está configurada no Supabase (SUPABASE_URL ausente).',
    )
  }

  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return upstreamError(
      request,
      401,
      'unauthenticated',
      'Entre na sua conta para localizar o endereço.',
    )
  }

  // Validação segura da identidade do usuário utilizando o cliente oficial Supabase
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    return upstreamError(
      request,
      401,
      'unauthenticated',
      'Sua sessão expirou. Entre novamente para localizar o endereço.',
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return upstreamError(
      request,
      400,
      'invalid_argument',
      'Envie um JSON válido com o campo addressString.',
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return upstreamError(request, 400, 'invalid_argument', 'Envie um objeto JSON com addressString.')
  }

  const addressString =
    typeof body.addressString === 'string' ? body.addressString.trim() : ''
  if (!addressString) {
    return upstreamError(
      request,
      400,
      'invalid_argument',
      'Informe o endereço completo para localizar.',
    )
  }
  if (addressString.length > 500) {
    return upstreamError(
      request,
      400,
      'invalid_argument',
      'O endereço é longo demais para a consulta.',
    )
  }

  const { data: quotaAllowed, error: quotaError } = await supabase.rpc('consumir_cota_geocodificacao')
  if (quotaError) return upstreamError(request, 503, 'quota_unavailable', 'Consulta temporariamente indisponível. Use o mapa para confirmar o ponto.')
  if (quotaAllowed !== true) return upstreamError(request, 429, 'rate_limited', 'Limite de consultas atingido. Tente mais tarde ou use o mapa.', '60')

  const cacheKey = normalizeText(addressString)
  const cached = readCached(cacheKey)
  if (cached) {
    return json(request, 200, { ...cached, cached: true })
  }

  // Limite por usuário (2 req/s) e global aproximado por instância
  if (isRateLimited(`user:${userData.user.id}`)) {
    return upstreamError(
      request,
      429,
      'rate_limited',
      'Aguarde um instante antes de consultar a localização novamente.',
      '1',
    )
  }
  if (isRateLimited('global')) {
    return upstreamError(
      request,
      429,
      'rate_limited',
      'O serviço está recebendo muitas consultas. Tente novamente em instantes.',
      '1',
    )
  }

  const apiKey = env('OPENGEOCODING_API_KEY')
  if (!apiKey) {
    console.error('[geocode-address] OPENGEOCODING_API_KEY ausente')
    return upstreamError(
      request,
      503,
      'geocoding_not_configured',
      'A geocodificação ainda não foi configurada no servidor (secret OPENGEOCODING_API_KEY ausente).',
    )
  }

  let upstreamResult: {
    status: number
    ok: boolean
    data: Record<string, unknown> | null
    raw: string
  }

  try {
    upstreamResult = await callOpenGeocoding(addressString, apiKey)
  } catch (error) {
    console.error(
      '[geocode-address] falha de conexão com a OpenGeocoding:',
      error instanceof Error ? error.message : 'erro desconhecido',
    )
    return upstreamError(
      request,
      502,
      'upstream_unavailable',
      'Não foi possível conectar ao serviço de localização. Tente novamente ou marque o ponto no mapa.',
    )
  }

  if (!upstreamResult.ok) {
    if (upstreamResult.status === 401 || upstreamResult.status === 403) {
      console.error(
        `[geocode-address] OpenGeocoding recusou a chave (HTTP ${upstreamResult.status})`,
      )
      return upstreamError(
        request,
        503,
        'geocoding_auth_failed',
        'O serviço de localização está indisponível por configuração de credenciais.',
      )
    }

    if (upstreamResult.status === 429) {
      return upstreamError(
        request,
        429,
        'rate_limited',
        'O limite de consultas da OpenGeocoding foi atingido temporariamente.',
        '1',
      )
    }

    console.error(
      `[geocode-address] OpenGeocoding respondeu HTTP ${upstreamResult.status}`,
    )
    return upstreamError(
      request,
      502,
      'upstream_error',
      'O serviço de localização retornou erro no momento. Tente novamente ou marque o ponto no mapa.',
    )
  }

  let payload = upstreamResult.data
  if (!payload) {
    return upstreamError(
      request,
      502,
      'invalid_upstream_response',
      'O serviço de localização retornou uma resposta inválida.',
    )
  }

  let coordinates =
    payload.geoCoordinates && typeof payload.geoCoordinates === 'object'
      ? (payload.geoCoordinates as Record<string, unknown>)
      : {}
  let latitude = Number(coordinates.lat)
  let longitude = Number(coordinates.lon)

  // Estratégia de Fallback: Se a busca com número/CEP exato não retornar coordenadas
  // (comum no Brasil onde números prediais não estão indexados em bases livres),
  // realiza uma consulta simplificada por logradouro e município para obter o ponto aproximado.
  const hasValidCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)

  if (!hasValidCoordinates) {
    // Tenta consulta simplificada: remove CEP e número para localizar a via
    const simplifiedQuery = addressString
      .replace(/\b\d{5}-?\d{3}\b/g, '') // Remove CEP
      .replace(/,\s*\d+([a-zA-Z]|\b)/g, '') // Remove número predial
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (simplifiedQuery && simplifiedQuery !== addressString) {
      try {
        const fallbackResult = await callOpenGeocoding(simplifiedQuery, apiKey)
        if (fallbackResult.ok && fallbackResult.data) {
          const fbCoords =
            fallbackResult.data.geoCoordinates &&
            typeof fallbackResult.data.geoCoordinates === 'object'
              ? (fallbackResult.data.geoCoordinates as Record<string, unknown>)
              : {}
          const fbLat = Number(fbCoords.lat)
          const fbLon = Number(fbCoords.lon)
          if (
            Number.isFinite(fbLat) &&
            Number.isFinite(fbLon) &&
            !(fbLat === 0 && fbLon === 0)
          ) {
            latitude = fbLat
            longitude = fbLon
            payload = fallbackResult.data
            payload.goodMatch = false
          }
        }
      } catch (fbErr) {
        console.warn('[geocode-address] falha no fallback simplificado:', fbErr)
      }
    }
  }

  // Se mesmo com fallback não encontrou coordenadas válidas
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    const notFound = {
      found: false,
      reason: 'not_found',
      message:
        'Nenhum ponto foi encontrado para este endereço. Ajuste os dados ou marque o local no mapa.',
    }
    writeCache(cacheKey, notFound)
    return json(request, 200, notFound)
  }

  const details = readDetails(payload.addressDetails)
  const regionCodes = readRegionCodes(payload.addressDetails)
  const countryCode = (details.countryCode ?? '').toLowerCase()
  const country = normalizeText(details.country ?? '')
  const city = details.city || details.town || details.municipality || details.village

  // Validação de país
  if (countryCode && countryCode !== 'br') {
    return json(request, 200, {
      found: false,
      reason: 'outside_country',
      message:
        'O endereço encontrado está fora do Brasil. Confira o CEP e o município.',
      addressDetails: details,
    })
  }
  if (
    !countryCode &&
    country &&
    country !== 'brasil' &&
    country !== 'brazil'
  ) {
    return json(request, 200, {
      found: false,
      reason: 'outside_country',
      message:
        'O endereço encontrado está fora do Brasil. Confira o CEP e o município.',
      addressDetails: details,
    })
  }

  // Validação de limites espaciais de Cajamar
  const isWithinCajamarBox =
    latitude >= CAJAMAR_BOUNDS.minLat &&
    latitude <= CAJAMAR_BOUNDS.maxLat &&
    longitude >= CAJAMAR_BOUNDS.minLon &&
    longitude <= CAJAMAR_BOUNDS.maxLon

  const normCity = normalizeText(city ?? '')
  const normExpectedCity = normalizeText(municipalityName())
  const cityConfirmed =
    !normCity ||
    normCity === normExpectedCity ||
    false

  if (!isWithinCajamarBox || (normCity && !cityConfirmed)) {
    return json(request, 200, {
      found: false,
      reason: 'outside_area',
      message: `O endereço encontrado pertence a ${city}, não a ${municipalityName()}/${municipalityState()}. Confira o CEP e o município.`,
      addressDetails: details,
    })
  }

  if (!stateMatches(details.state, regionCodes)) {
    return json(request, 200, {
      found: false,
      reason: 'outside_area',
      message: `O endereço encontrado não está em ${municipalityState()}. Confira o CEP e a UF.`,
      addressDetails: details,
    })
  }

  const result = {
    found: true,
    latitude,
    longitude,
    displayName:
      typeof payload.displayName === 'string' && payload.displayName.trim()
        ? payload.displayName.trim()
        : addressString,
    goodMatch: payload.goodMatch === true,
    addressDetails: details,
    provider: 'opengeocoding.com',
    attribution: ATTRIBUTION,
    cached: false,
  }

  writeCache(cacheKey, result)
  return json(request, 200, result)
  } catch {
    return upstreamError(request, 503, 'service_unavailable', 'Consulta temporariamente indisponível. Use o mapa para confirmar o ponto.')
  }
})
