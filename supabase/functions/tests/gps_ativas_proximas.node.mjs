// node --experimental-strip-types supabase/functions/tests/gps_ativas_proximas.node.mjs
import assert from 'node:assert/strict'
import { triangularChuvaServidor } from '../_shared/motor-alertas-push.ts'
const now = Date.parse('2026-11-16T12:00:00Z')
const point = {latitude:-23.35,longitude:-46.93}
const st = (id,lat,lon,mm,extra={}) => ({
  codigo_estacao:id,latitude:lat,longitude:lon,chuva_acumulada_mm:mm,
  ativa:true,validada:true,fonte:'CEMADEN',qualidade_dado:'oficial',
  tipo_medicao:'acumulado_24h',janela_horas:24,unidade:'mm',
  ultima_leitura_em:new Date(now-5*60000).toISOString(),...extra,
})
const near=[st('N-PERTO',-23.346,-46.93,10),st('SW-PERTO',-23.353,-46.934,20),st('SE-PERTO',-23.353,-46.926,30)]
const far=[st('N-LONGE',-23.33,-46.93,90),st('SW-LONGE',-23.37,-46.95,90),st('SE-LONGE',-23.37,-46.91,90)]
const actual=triangularChuvaServidor(point,[...far,...near],now)
assert.equal(actual.quantidadeEstacoes,3)
assert.deepEqual(actual.estacoes.slice().sort(),near.map(s=>s.codigo_estacao).sort(),'GPS deve escolher o triangulo envolvente mais proximo')
assert.equal(triangularChuvaServidor(point,[st('INATIVA',point.latitude,point.longitude,999,{ativa:false}),...near],now).quantidadeEstacoes,3)
assert.equal(triangularChuvaServidor(point,[st('SEM_VALIDACAO',point.latitude,point.longitude,999,{validada:false}),...near],now).quantidadeEstacoes,3)
assert.equal(triangularChuvaServidor(point,[st('SEM_STATUS',point.latitude,point.longitude,999,{ativa:undefined}),...near],now).quantidadeEstacoes,3)
assert.equal(triangularChuvaServidor(point,near.map(s=>({...s,ativa:false})),now).chuvaMm24h,null)
assert.equal(triangularChuvaServidor(point,near.map(s=>({...s,ultima_leitura_em:new Date(now-7*3600000).toISOString()})),now).chuvaMm24h,null)
assert.equal(triangularChuvaServidor(point,near.slice(0,2),now).chuvaMm24h,null)
const east=[st('E1',-23.349,-46.929,5),st('E2',-23.35,-46.928,5),st('E3',-23.351,-46.929,5)]
const enclosing=[st('N',-23.345,-46.929,10),st('S',-23.355,-46.929,20),st('W',-23.35,-46.94,30)]
const expanded=triangularChuvaServidor(point,[...east,...enclosing],now)
assert.equal(expanded.quantidadeEstacoes,3)
assert.ok(expanded.estacoes.includes('W'), 'deve expandir a busca se as 3 proximas nao envolverem o GPS')
console.log('Triangulacao GPS: estacoes ativas, leituras validas, proximidade e seguranca OK')
