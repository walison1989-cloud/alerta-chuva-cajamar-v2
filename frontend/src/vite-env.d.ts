/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_MUNICIPIO_NOME?: string
  readonly VITE_MUNICIPIO_UF?: string
  readonly VITE_MUNICIPIO_LAT?: string
  readonly VITE_MUNICIPIO_LON?: string
  readonly VITE_TIMEZONE?: string
  readonly VITE_OPEN_METEO_BASE_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_VIACEP_BASE_URL?: string
  readonly VITE_GEOCODING_FUNCTION?: string
  readonly VITE_ENABLE_EXPERIMENTAL_ANALYSIS?: string
  readonly VITE_ENABLE_CEMADEN_LIVE_FALLBACK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
