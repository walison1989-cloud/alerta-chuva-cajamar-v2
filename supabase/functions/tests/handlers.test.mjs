import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const base = new URL('../', import.meta.url)
const sharedCode = stripTypeScriptTypes(await readFile(new URL('_shared/cemaden.ts', base), 'utf8'))
const shared = await import(`data:text/javascript,${encodeURIComponent(sharedCode)}`)

async function handler(name, options = {}) {
  const source = (await readFile(new URL(`${name}/index.ts`, base), 'utf8'))
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]/g, '')
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test-only',
    OPENGEOCODING_API_KEY: 'test-only', CEMADEN_SYNC_SECRET: 'sync-test-only', ...options.env }
  let serve
  const context = vm.createContext({
    ...shared, Request, Response, Headers, URL, AbortSignal, setTimeout, clearTimeout, console,
    fetch: options.fetch ?? (async () => { throw new Error('No upstream fixture') }),
    createClient: () => ({
      auth: { getUser: options.getUser ?? (async () => ({ data: { user: { id: 'fixture-user' } }, error: null })) },
      rpc: options.rpc ?? (async () => ({ data: true, error: null })),
    }),
    Deno: { env: { get: key => env[key] }, serve: value => { serve = value } },
  })
  vm.runInContext(stripTypeScriptTypes(source), context)
  return serve
}

function post(body, headers = {}) {
  return new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(body),
    headers: { Authorization: 'Bearer fixture-token', ...headers } })
}

test('geocode rejects unauthenticated users', async () => {
  const serve = await handler('geocode-address')
  const response = await serve(post({}, { Authorization: '' }))
  assert.equal(response.status, 401)
})
test('geocode rejects invalid or expired session', async () => {
  const serve = await handler('geocode-address', { getUser: async () => ({data:{user:null},error:{message:'expired'}}) })
  assert.equal((await serve(post({addressString:'fixture'}))).status,401)
})
test('null and arrays return controlled validation errors', async () => {
  const serve = await handler('geocode-address')
  assert.equal((await serve(post(null))).status,400)
  assert.equal((await serve(post([]))).status,400)
})
test('unknown origins are rejected', async () => {
  const serve = await handler('geocode-address')
  assert.equal((await serve(post({}, {Origin:'https://untrusted.invalid'}))).status,403)
})
test('quota failure is closed and quota exhaustion returns 429', async () => {
  const down = await handler('geocode-address', {rpc:async()=>({data:null,error:{message:'unavailable'}})})
  assert.equal((await down(post({addressString:'fixture'}))).status,503)
  const full = await handler('geocode-address', {rpc:async()=>({data:false,error:null})})
  assert.equal((await full(post({addressString:'fixture'}))).status,429)
})
test('upstream or authentication outage does not leak a stack or secret', async () => {
  const serve = await handler('geocode-address', {getUser:async()=>{throw new Error('private-internal-detail')}})
  const response=await serve(post({addressString:'fixture'}))
  assert.equal(response.status,503)
  assert.ok(!(await response.text()).includes('private-internal-detail'))
})
test('point outside the box is rejected even if city metadata says Cajamar', async () => {
  const serve = await handler('geocode-address', {fetch:async()=>Response.json({geoCoordinates:{lat:-22,lon:-46},addressDetails:{countryCode:'br',city:'Cajamar',state:'SP'}})})
  const response=await serve(post({addressString:'fixture'}))
  assert.equal((await response.json()).found,false)
})
test('conflicting state metadata cannot pass on missing region codes', async () => {
  const serve = await handler('geocode-address', {fetch:async()=>Response.json({geoCoordinates:{lat:-23.35,lon:-46.87},addressDetails:{countryCode:'br',city:'Cajamar',state:'RJ'}})})
  assert.equal((await (await serve(post({addressString:'fixture'}))).json()).found,false)
})
test('valid approximate result requires a valid geographic area', async () => {
  const serve = await handler('geocode-address', {fetch:async()=>Response.json({geoCoordinates:{lat:-23.35,lon:-46.87},goodMatch:false,addressDetails:{countryCode:'br',city:'Cajamar',state:'SP'}})})
  const result=await (await serve(post({addressString:'fixture'}))).json()
  assert.equal(result.found,true)
  assert.equal(result.goodMatch,false)
})
test('sync endpoint enforces method and server secret before any database work', async () => {
  const serve=await handler('sync-cemaden')
  assert.equal((await serve(new Request('https://example.invalid'))).status,405)
  assert.equal((await serve(post({}))).status,401)
  const disabled=await handler('sync-cemaden',{env:{CEMADEN_SYNC_SECRET:''}})
  assert.equal((await disabled(post({}))).status,503)
})
test('JSONP server parser never evaluates code', () => {
  assert.throws(()=>shared.parseCemadenJsonp('estacoes([{}]); globalThis.injected=true;'))
  assert.equal(globalThis.injected,undefined)
})
