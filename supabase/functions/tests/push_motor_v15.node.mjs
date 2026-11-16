// Node >=22 --experimental-strip-types; teste sem rede nem banco.
import assert from 'node:assert/strict'
import { classificarAvisoChuva, triangularChuvaServidor } from '../_shared/motor-alertas-push.ts'
import { resumirRiscoEndereco } from '../../../frontend/src/lib/statusRiscoEndereco.ts'

const now=Date.parse('2026-11-15T22:00:00Z')
const point={latitude:-23.35,longitude:-46.93}
const r=(codigo,latitude,longitude,mm,extra={})=>({
  codigo_estacao:codigo, latitude, longitude, chuva_acumulada_mm:mm,
  fonte:'CEMADEN',ativa:true,validada:true,ultima_leitura_em:new Date(now-600_000).toISOString(),
  tipo_medicao:'acumulado_24h',janela_horas:24,unidade:'mm',qualidade_dado:'oficial',...extra
})
const gauges=[r('N',-23.34,-46.93,20),r('S',-23.36,-46.93,40),r('E',-23.35,-46.91,30),r('W',-23.35,-46.95,10)]
const tri=triangularChuvaServidor(point,gauges,now)
assert.equal(tri.quantidadeEstacoes,3)
assert.ok(tri.chuvaMm24h>=10&&tri.chuvaMm24h<=40)
assert.equal(triangularChuvaServidor(point,gauges.slice(0,2),now).chuvaMm24h,null)
assert.equal(triangularChuvaServidor(point,gauges.map(g=>({...g,ultima_leitura_em:new Date(now-7*3600000).toISOString()})),now).chuvaMm24h,null)
assert.equal(classificarAvisoChuva(18.5,5.5,0.8),'chuva_fraca')
assert.equal(classificarAvisoChuva(1,0.5,0.8),'nenhuma')
assert.equal(classificarAvisoChuva(35,21,0.8),'chuva_forte')
assert.equal(classificarAvisoChuva(null,null,null),'nenhuma')

const base={origem:'imovel',evidencias:{localizacaoValida:true},resultado:{nivel:'dados_insuficientes',dadosAusentes:[{codigo:'exposicao_imovel_indeterminada'}],diagnostico:{exposicao:'indeterminada',sinalMeteorologico:'previsto'}}}
const opts=(observada,prevista,pico=3)=>({
  chuvaTriangulada:{suporteEspacial:observada!==null,chuvaObservadaMm:observada},
  previsao:prevista===null?null:{precipMm24h:prevista,pico3hMm:pico,fetchedAt:now-10*60_000},agora:now,
})
const situacao=resumirRiscoEndereco(base,opts(0.8,18.5))
assert.equal(situacao.status,'acompanhamento')
assert.equal(situacao.podeAcionarAlerta,false)
assert.equal(resumirRiscoEndereco(base,opts(0.1,1)).status,'sem_indicios')
assert.equal(resumirRiscoEndereco(base,opts(0.1,35,22)).status,'acompanhamento')
assert.equal(resumirRiscoEndereco(base,opts(null,18.5)).status,'indeterminado')
assert.equal(resumirRiscoEndereco(base,opts(1,null)).status,'indeterminado')
const confirmed={...base,resultado:{...base.resultado,nivel:'atencao_forte_experimental',dadosAusentes:[],diagnostico:{exposicao:'confirmada',sinalMeteorologico:'ambos'}}}
assert.equal(resumirRiscoEndereco(confirmed,opts(35,40,23)).status,'risco')
console.log('10 grupos de validação essenciais da versão v1.5 aprovados (núcleo puro).')
