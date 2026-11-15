function readText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function readCoordinate(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function readHttpsUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim()
  if (!candidate) return fallback
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.toString() : fallback
  } catch {
    return fallback
  }
}

function readBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

const supabaseUrl = readText(import.meta.env.VITE_SUPABASE_URL, '').replace(
  /\/+$/,
  '',
)
const supabaseAnonKey = readText(import.meta.env.VITE_SUPABASE_ANON_KEY, '')

export const env = Object.freeze({
  appName: readText(import.meta.env.VITE_APP_NAME, 'Alerta de Chuva Cajamar'),
  appVersion: '0.3.0',
  municipality: Object.freeze({
    name: readText(import.meta.env.VITE_MUNICIPIO_NOME, 'Cajamar'),
    state: readText(import.meta.env.VITE_MUNICIPIO_UF, 'SP'),
    latitude: readCoordinate(import.meta.env.VITE_MUNICIPIO_LAT, -23.3561111, -90, 90),
    longitude: readCoordinate(import.meta.env.VITE_MUNICIPIO_LON, -46.8769444, -180, 180),
  }),
  timezone: readText(import.meta.env.VITE_TIMEZONE, 'America/Sao_Paulo'),
  openMeteoBaseUrl: readHttpsUrl(
    import.meta.env.VITE_OPEN_METEO_BASE_URL,
    'https://api.open-meteo.com/v1/forecast',
  ),
  viaCepBaseUrl: readHttpsUrl(
    import.meta.env.VITE_VIACEP_BASE_URL,
    'https://viacep.com.br/ws/',
  ),
  geocodingFunction: readText(
    import.meta.env.VITE_GEOCODING_FUNCTION,
    'geocode-address',
  ),
  supabaseUrl,
  supabaseAnonKey,
  // A análise permanece explicitamente rotulada como experimental. Ela fica
  // acessível no MVP, mas pode ser ocultada em qualquer ambiente com false.
  experimentalAnalysisEnabled:
    import.meta.env.VITE_ENABLE_EXPERIMENTAL_ANALYSIS === undefined
      ? true
      : readBoolean(import.meta.env.VITE_ENABLE_EXPERIMENTAL_ANALYSIS),
  cemadenLiveFallbackEnabled: import.meta.env.DEV && readBoolean(
    import.meta.env.VITE_ENABLE_CEMADEN_LIVE_FALLBACK,
  ),
})

/**
 * O Supabase é opcional. Sem configuração, a tela inicial de clima e mapa
 * continua funcionando e as telas de conta explicam o que falta configurar.
 *
 * Aceita HTTPS em produção e HTTP apenas para localhost/127.0.0.1, usado pelo
 * Supabase CLI local. Nunca aceite HTTP para um host remoto.
 */
const supabaseUrlIsLocal =
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(supabaseUrl)

export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true
  if (key.startsWith('sb_secret_')) return false
  try {
    const segment = key.split('.')[1]
    if (!segment) return false
    const value = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return value.role === 'anon'
  } catch { return false }
}

export const isSupabaseConfigured =
  (supabaseUrl.startsWith('https://') || supabaseUrlIsLocal) &&
  supabaseAnonKey.length > 20 && isPublicSupabaseKey(supabaseAnonKey)
