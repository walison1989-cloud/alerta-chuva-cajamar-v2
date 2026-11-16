/**
 * Avaliação periódica de triagem hidrometeorológica POR ENDEREÇO, sem geração
 * de evento confirmado. Só considera endereços com LGPD + assinatura push
 * alagamento ativa e consentida. Controlado por dois killswitches.
 *
 * Deploy: supabase functions deploy monitorar-hidrologia --no-verify-jwt
 * Cron: POST com x-job-secret guardado em Vault (nunca no Git).
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { triangularChuvaServidor, type RegistroEstacao } from '../_shared/motor-alertas-push.ts'
import { classificarTriagem, TRIAGEM_VERSAO, type AreaContida } from '../_shared/triagem-hidrologica.ts'

const env = (n:string) => Deno.env.get(n)?.trim() ?? ''
const json=(code:number,data:Record<string,unknown>) => Response.json(data,{status:code,headers:{'Cache-Control':'no-store'}})
type Endereco={id:string;usuario_id:string;latitude:number|null;longitude:number|null;consentimento_lgpd:boolean}
type Assinatura={usuario_id:string;endereco_id:string}
type Forecast={precipitacaoAtualMm:number;codigoTempo:number;total24hMm:number;pico3hMm:number}
const valid=(v:unknown): v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0
async function previsaoNoPonto(lat:number,lon:number):Promise<Forecast>{
  const url=new URL('https://api.open-meteo.com/v1/forecast')
  for(const [key,value] of Object.entries({
    latitude:String(lat),longitude:String(lon),
    current:'precipitation,weather_code',hourly:'precipitation',forecast_hours:'24',
    timezone:'America/Sao_Paulo',precipitation_unit:'mm',
  }))url.searchParams.set(key,value)
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000),cache:'no-store'})
  if(!response.ok)throw new Error('open_meteo_http_error')
  const data=await response.json() as {current?:{precipitation?:unknown;weather_code?:unknown};hourly?:{precipitation?:unknown}}
  const arr=data.hourly?.precipitation
  if(!Array.isArray(arr)||arr.length<24||arr.slice(0,24).some(x=>!valid(x)))throw new Error('previsao_horaria_invalida')
  const hourly=arr.slice(0,24) as number[]
  let peak=0
  for(let i=0;i<=hourly.length-3;i++)peak=Math.max(peak,hourly[i]+hourly[i+1]+hourly[i+2])
  return {
    precipitacaoAtualMm:valid(data.current?.precipitation)?data.current!.precipitation as number:NaN,
    codigoTempo:typeof data.current?.weather_code==='number'?data.current.weather_code:NaN,
    total24hMm:Math.round(hourly.reduce((sum,val)=>sum+val,0)*10)/10,
    pico3hMm:Math.round(peak*10)/10,
  }
}
Deno.serve(async request=>{
  if(request.method!=='POST')return json(405,{error:'method_not_allowed'})
  const secret=env('PUSH_JOB_SECRET')
  if(!secret||request.headers.get('x-job-secret')!==secret)return json(401,{error:'unauthorized'})
  if(env('MONITOR_HIDRO_ENABLED')!=='true')return json(200,{enabled:false,processed:0,written:0,alertsSent:0})
  if(!env('SUPABASE_URL')||!env('SUPABASE_SERVICE_ROLE_KEY'))return json(503,{error:'server_configuration_incomplete'})
  const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:subs,error:subError}=await client.from('push_morador_assinaturas')
    .select('usuario_id,endereco_id').eq('ativo',true).eq('consentimento',true).eq('alagamento',true).limit(101)
  if(subError)return json(503,{error:'subscriptions_unavailable'})
  if((subs??[]).length>100)return json(503,{error:'subscription_limit_requires_pagination'})
  const set=new Set((subs??[] as Assinatura[]).map(s=>`${s.usuario_id}:${s.endereco_id}`))
  const ids=[...new Set((subs??[] as Assinatura[]).map(s=>s.endereco_id))]
  if(ids.length===0)return json(200,{enabled:true,processed:0,written:0,alertsSent:0})
  const {data:addresses,error:addressError}=await client.from('enderecos')
    .select('id,usuario_id,latitude,longitude,consentimento_lgpd').in('id',ids).eq('consentimento_lgpd',true).limit(101)
  if(addressError)return json(503,{error:'addresses_unavailable'})
  const {data:stations,error:stationError}=await client.from('vw_estacoes_publicas')
    .select('codigo_estacao,latitude,longitude,fonte,chuva_acumulada_mm,ultima_leitura_em,tipo_medicao,janela_horas,unidade,qualidade_dado').limit(500)
  if(stationError)return json(503,{error:'stations_unavailable'})
  const now=Date.now(),start=new Date(Math.floor(now/900000)*900000).toISOString()
  let processed=0,written=0,errors=0,attention=0,rainingNow=0
  const writeEnabled=env('MONITOR_HIDRO_WRITE_ENABLED')==='true'
  for(const e of (addresses??[]) as Endereco[]){
    if(!set.has(`${e.usuario_id}:${e.id}`)||typeof e.latitude!=='number'||typeof e.longitude!=='number'||!Number.isFinite(e.latitude)||!Number.isFinite(e.longitude)||Math.abs(e.latitude)>90||Math.abs(e.longitude)>180)continue
    processed++
    try{
      const forecast=await previsaoNoPonto(e.latitude,e.longitude)
      const rain=triangularChuvaServidor({latitude:e.latitude,longitude:e.longitude},(stations??[]) as RegistroEstacao[],now)
      const {data:polygons,error:polyError}=await client.rpc('triagem_suscetibilidade_no_ponto',{p_latitude:e.latitude,p_longitude:e.longitude})
      if(polyError)throw new Error('suscetibilidade_indisponivel')
      const areas=(polygons??[]) as AreaContida[]
      const result=classificarTriagem({
        chuvaObservada24hMm:rain.chuvaMm24h,
        previsao24hMm:forecast.total24hMm,
        picoPrevisto3hMm:forecast.pico3hMm,
        chuvaAtualModeloMm:Number.isFinite(forecast.precipitacaoAtualMm)?forecast.precipitacaoAtualMm:null,
        codigoTempoAtual:Number.isFinite(forecast.codigoTempo)?forecast.codigoTempo:null,
        areasContidas:areas,
      })
      if(result.nivel==='atencao_experimental'||result.nivel==='atencao_meteorologica')attention++
      if(result.chuvaAgora===true)rainingNow++
      if(writeEnabled){
        const {error}=await client.from('triagens_hidrologicas').upsert({
          usuario_id:e.usuario_id,endereco_id:e.id,janela_inicio:start,versao:TRIAGEM_VERSAO,
          nivel:result.nivel,processos:result.processos,chuva_agora_modelo:result.chuvaAgora,
          risco_confirmado:false,
          evidencias:{
            chuva_observada_24h_mm:rain.chuvaMm24h,quantidade_estacoes:rain.quantidadeEstacoes,
            codigo_estacoes:rain.estacoes,previsao_24h_mm:forecast.total24hMm,
            pico_previsto_3h_mm:forecast.pico3hMm,chuva_atual_modelo_mm:Number.isFinite(forecast.precipitacaoAtualMm)?forecast.precipitacaoAtualMm:null,
            areas_contidas:areas.map(a=>({tipo:a.tipo,classe:a.classe})),
            fonte_previsao:'Open-Meteo',fonte_observacao:'CEMADEN',
            motivos:result.motivos,limitacao:'Sem medição independente de chuva em 1h, vazão ou conectividade hidrológica; não confirma alagamento.',
          },avaliado_em:new Date().toISOString(),
        },{onConflict:'endereco_id,janela_inicio,versao'})
        if(error)throw new Error('triagem_write_failed')
        written++
      }
    }catch(err){errors++;console.error('[monitorar-hidrologia]',err instanceof Error?err.message:'unknown_error')}
  }
  return json(errors?207:200,{enabled:true,writeEnabled,processed,written,errors,attention,rainingNow,alertsSent:0,version:TRIAGEM_VERSAO})
})
