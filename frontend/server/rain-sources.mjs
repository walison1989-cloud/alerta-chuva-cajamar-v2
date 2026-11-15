// Server-only catalogue access. No address, account, secret or arbitrary URL input.
export const INMET_CATALOG_URL = 'https://apitempo.inmet.gov.br/estacoes/T'
export const SOURCE_LINKS = Object.freeze({
  INMET: 'https://portal.inmet.gov.br/servicos/mapa-de-esta%C3%A7%C3%B5es-meteorol%C3%B3gicas',
  'SP Águas': 'https://ph.spaguas.sp.gov.br/Pluviometricos',
  ANA: 'https://www.snirh.gov.br/hidroweb/',
})
const CENTER = { latitude: -23.3561111, longitude: -46.8769444 }
const MAX_BYTES = 3_000_000
const TTL_MS = 30 * 60 * 1000

function number(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
function text(value) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : ''
}
export function distanceKm(latitude, longitude) {
  const rad = Math.PI / 180
  const a = Math.sin((latitude - CENTER.latitude) * rad / 2) ** 2 +
    Math.cos(CENTER.latitude * rad) * Math.cos(latitude * rad) *
    Math.sin((longitude - CENTER.longitude) * rad / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))))
}
export function catalogStation({ source, code, name, latitude, longitude, municipality, quality }) {
  return {
    key: `${source}:${code}`, id: null, source, sourceId: code, code, name,
    latitude, longitude, municipality, state: 'SP', stationType: 'Pluviométrica',
    network: source, sourceStatus: null, lastCollectedAt: null, lastReadingAt: null,
    accumulatedMm: null, measurementType: null, windowHours: null, unit: 'mm',
    quality, distanceKm: null, catalogueOnly: true,
    sourceUrl: SOURCE_LINKS[source],
  }
}
export function parseInmetCatalog(payload) {
  if (!Array.isArray(payload) || payload.length > 10000) throw new Error('catalog_schema')
  const seen = new Set()
  const result = []
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue
    const code = text(row.CD_ESTACAO)
    const name = text(row.DC_NOME)
    const latitude = number(row.VL_LATITUDE)
    const longitude = number(row.VL_LONGITUDE)
    if (!/^[A-Z][A-Z0-9]{2,9}$/.test(code) || !name || latitude === null || longitude === null) continue
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue
    // This is the INMET network, not every partner repeated by the same portal.
    if (row.SG_ENTIDADE !== 'INMET' || row.SG_ESTADO !== 'SP' || row.CD_SITUACAO !== 'Operante' || row.DT_FIM_OPERACAO) continue
    if (distanceKm(latitude, longitude) > 30 || seen.has(code)) continue
    seen.add(code)
    result.push(catalogStation({ source: 'INMET', code, name, latitude, longitude,
      municipality: null, quality: 'catalogo_sem_medicao' }))
  }
  return result.sort((a, b) => a.code.localeCompare(b.code)).slice(0, 100)
}

// Curated metadata, NOT telemetry. Values transcribed from the official portal
// on 2026-11-08: PONUNDUVA, E3-233, Cajamar, 23°21'00" S, 46°56'00" W.
// Operation status, time series and current readings were not verified.
export function spAguasCatalog() {
  return [catalogStation({ source: 'SP Águas', code: 'E3-233', name: 'Ponunduva',
    latitude: -(23 + 21 / 60), longitude: -(46 + 56 / 60), municipality: 'Cajamar',
    quality: 'catalogo_historico_coordenadas_aproximadas' })]
}

async function readBoundedJson(response) {
  if (!response.ok) throw new Error('upstream_http')
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('upstream_size')
  if (!response.body) throw new Error('upstream_body')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('upstream_size')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const data = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(data))
}

export function createCatalogService({ fetchImpl = fetch, now = Date.now } = {}) {
  let cache = null
  let pending = null
  return async function load() {
    if (cache && now() < cache.expiresAt) return cache.payload
    if (pending) return pending
    pending = (async () => {
      const stations = spAguasCatalog()
      const sources = [
        { source: 'SP Águas', status: 'catalogue', count: stations.length, url: SOURCE_LINKS['SP Águas'],
          message: 'Posto Ponunduva no catálogo histórico. Posição aproximada; operação e leitura atual não confirmadas. Metadados conferidos em 08/11/2026.' },
        { source: 'ANA', status: 'authorization_required', count: 0, url: SOURCE_LINKS.ANA,
          message: 'A integração automática com a API depende de autorização da ANA. Nenhuma leitura ANA está sendo exibida.' },
      ]
      let success = false
      try {
        const response = await fetchImpl(INMET_CATALOG_URL, {
          signal: AbortSignal.timeout(8000), redirect: 'error',
          headers: { Accept: 'application/json', 'User-Agent': 'AlertaChuvaCajamar/0.3 (public-station-catalog)' },
        })
        const inmet = parseInmetCatalog(await readBoundedJson(response))
        stations.push(...inmet)
        sources.unshift({ source: 'INMET', status: 'catalogue', count: inmet.length,
          url: SOURCE_LINKS.INMET, checkedAt: new Date(now()).toISOString(),
          message: inmet.length ? 'Catálogo de estações operantes até 30 km do centro de Cajamar. Sem leituras de chuva integradas.' : 'O catálogo não retornou estação INMET operante até 30 km do centro de Cajamar. Isso não significa ausência de chuva.' })
        success = true
      } catch {
        sources.unshift({ source: 'INMET', status: 'unavailable', count: 0, url: SOURCE_LINKS.INMET,
          message: 'Não foi possível consultar o catálogo INMET. Nenhuma leitura foi estimada.' })
      }
      const payload = { schema: 1, radiusKm: 30, centerReference: 'centro de Cajamar, não o imóvel', stations, sources }
      cache = { payload, expiresAt: now() + (success ? TTL_MS : 60_000) }
      return payload
    })()
    try { return await pending } finally { pending = null }
  }
}
