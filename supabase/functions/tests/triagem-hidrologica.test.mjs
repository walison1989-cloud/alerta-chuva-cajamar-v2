import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificarTriagem } from '../_shared/triagem-hidrologica.ts'
const base = { chuvaObservada24hMm:0.8, previsao24hMm:3.3,picoPrevisto3hMm:0.5,chuvaAtualModeloMm:0,codigoTempoAtual:3,areasContidas:[] }
test('chuva atual informada, mesmo com acumulado baixo',()=>{
  const r=classificarTriagem({...base,chuvaAtualModeloMm:0.3})
  assert.equal(r.chuvaAgora,true)
  assert.equal(r.nivel,'sem_sinal_meteorologico')
})
test('baixa chuva e poligono não geram alagamento confirmado',()=>{
  const r=classificarTriagem({...base,areasContidas:[{tipo:'inundacao',classe:'Alta'}]})
  assert.equal(r.riscoConfirmado,false)
  assert.equal(r.podeEnviarAlertaAlagamento,false)
})
test('enxurrada forte tem acompanhamento, sem afirmar inundação',()=>{
  const r=classificarTriagem({...base,previsao24hMm:45,picoPrevisto3hMm:22,areasContidas:[{tipo:'enxurrada',classe:'Enxurrada'}]})
  assert.deepEqual(r.processos,['enxurrada'])
  assert.equal(r.nivel,'atencao_experimental')
  assert.equal(r.sinalForte,true)
  assert.equal(r.riscoConfirmado,false)
})
test('sinal forte sem poligono é só acompanhamento meteorológico',()=>{
  const r=classificarTriagem({...base,chuvaObservada24hMm:40})
  assert.equal(r.nivel,'atencao_meteorologica')
})
test('previsao ausente não vira segurança',()=>{
  const r=classificarTriagem({...base,previsao24hMm:null,chuvaObservada24hMm:null})
  assert.equal(r.nivel,'dados_insuficientes')
})
test('proximidade não é usada: só polígonos que contêm o ponto',()=>{
  const r=classificarTriagem({...base,previsao24hMm:20,areasContidas:[]})
  assert.equal(r.processos.length,0)
  assert.equal(r.nivel,'atencao_meteorologica')
})
test('código de chuva detecta chuva atual do modelo',()=>{
  const r=classificarTriagem({...base,chuvaAtualModeloMm:0,codigoTempoAtual:61})
  assert.equal(r.chuvaAgora,true)
})
test('nenhum valor negativo é usado para classificação',()=>{
  const r=classificarTriagem({...base,previsao24hMm:-1,chuvaObservada24hMm:-1})
  assert.equal(r.nivel,'dados_insuficientes')
})
