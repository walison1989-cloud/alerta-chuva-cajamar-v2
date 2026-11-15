import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCatalogService, parseInmetCatalog, spAguasCatalog, INMET_CATALOG_URL } from '../server/rain-sources.mjs'
import handler from '../api/rain-sources.mjs'

// Structural fixtures, not a claim that INMET operates a station at this point.
const STATION = { CD_ESTACAO: 'A001', DC_NOME: 'Estação de teste', VL_LATITUDE: '-23.35', VL_LONGITUDE: '-46.87', SG_ENTIDADE: 'INMET', SG_ESTADO: 'SP', CD_SITUACAO: 'Operante', DT_FIM_OPERACAO: null }

test('parses nearby operating stations without fabricating rain or timestamps', () => {
  const [station] = parseInmetCatalog([STATION])
  assert.equal(station.key, 'INMET:A001')
  assert.equal(station.catalogueOnly, true)
  for (const key of ['accumulatedMm', 'lastReadingAt', 'lastCollectedAt', 'windowHours', 'distanceKm']) assert.equal(station[key], null)
})
test('rejects invalid, remote, inactive and partner entries, deduplicates codes', () => {
  const rows = [STATION, STATION, ...[
    { VL_LATITUDE: '' }, { VL_LATITUDE: null }, { VL_LATITUDE: true },
    { VL_LONGITUDE: 'Infinity' }, { VL_LATITUDE: '-10' }, { CD_ESTACAO: '../x' },
    { CD_SITUACAO: 'Pane' }, { SG_ENTIDADE: 'Parceiro' }, { SG_ESTADO: 'MG' },
    { DT_FIM_OPERACAO: '2026-01-01' },
  ].map(changes => ({ ...STATION, ...changes }))]
  assert.equal(parseInmetCatalog(rows).length, 1)
  assert.throws(() => parseInmetCatalog({ error: 'schema_changed' }))
})
test('SP metadata is historical, approximate and has no reading or active status', () => {
  const [station] = spAguasCatalog()
  assert.equal(station.code, 'E3-233')
  assert.equal(station.municipality, 'Cajamar')
  assert.equal(station.latitude, -23.35)
  assert.equal(station.sourceStatus, null)
  assert.equal(station.lastReadingAt, null)
})
test('isolates upstream failure, exposes ANA pending authorization, no secrets', async () => {
  const load = createCatalogService({ fetchImpl: async () => { throw new Error('private upstream details') } })
  const payload = await load()
  assert.equal(payload.sources.find(s => s.source === 'INMET').status, 'unavailable')
  assert.equal(payload.sources.find(s => s.source === 'ANA').status, 'authorization_required')
  assert.equal(payload.stations.length, 1)
  assert(!JSON.stringify(payload).includes('private upstream'))
})
test('bounds network, caches and coalesces requests, refreshes after expiry', async () => {
  let calls = 0, clock = 100000
  const load = createCatalogService({ now: () => clock, fetchImpl: async (url, options) => {
    calls++
    assert.equal(url, INMET_CATALOG_URL)
    assert.equal(options.redirect, 'error')
    assert(options.signal)
    return new Response(JSON.stringify([STATION]), { headers: { 'Content-Type': 'application/json' } })
  } })
  const [a,b] = await Promise.all([load(), load()])
  assert.deepEqual(a,b)
  await load()
  assert.equal(calls, 1)
  clock += 31 * 60 * 1000
  await load()
  assert.equal(calls, 2)
})
test('rejects oversized payload and invalid JSON, never labels a failure successful', async () => {
  for (const response of [new Response('{}', { headers: { 'content-length': '9999999' } }), new Response('<html>error</html>'), new Response('denied', { status: 403 })]) {
    const payload = await createCatalogService({ fetchImpl: async () => response })()
    assert.equal(payload.sources[0].status, 'unavailable')
  }
})
test('API permits only read-only GET', async () => {
  const output = { headers: {}, setHeader(k,v) { this.headers[k] = v }, status(code) { this.code = code; return this }, json(body) { this.body = body } }
  await handler({ method: 'POST' }, output)
  assert.equal(output.code, 405)
  assert.equal(output.headers.Allow, 'GET')
})
