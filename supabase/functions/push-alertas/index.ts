/**
 * Web Push periódico para dispositivos que deram consentimento. O servidor
 * consulta Open-Meteo no endereço (e, se disponível, triangula CEMADEN).
 * Alagamento só é notificado com evento CONFIRMADO NO SERVIDOR, que deve
 * ser produzido por motor hidrológico validado — nunca pelo React.
 * Desativado por padrão: PUSH_ALERTS_ENABLED !== 'true'.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { classificarAvisoChuva, triangularChuvaServidor, type RegistroEstacao } from '../_shared/motor-alertas-push.ts'

const env = (name: string) => Deno.env.get(name)?.trim() ?? ''
const resposta = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

type Sub = {
  id: string; usuario_id: string; endereco_id: string; endpoint: string; p256dh: string; auth: string;
  chuva_fraca: boolean; chuva_forte: boolean; alagamento: boolean
}
type Endereco = { id: string; usuario_id: string; latitude: number; longitude: number; bairro: string|null; municipio: string|null }
type Evento = { id: string; usuario_id: string; endereco_id: string; confirmado_servidor: boolean; expira_em: string }
type Previsao = { total24h: number; pico3h: number }

async function preverNoEndereco(e: Endereco): Promise<Previsao> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(e.latitude))
  url.searchParams.set('longitude', String(e.longitude))
  url.searchParams.set('hourly', 'precipitation')
  url.searchParams.set('forecast_hours', '24')
  url.searchParams.set('timezone', 'America/Sao_Paulo')
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`previsao_http_${response.status}`)
  const payload = await response.json() as { hourly?: { precipitation?: unknown } }
  const values = payload.hourly?.precipitation
  if (!Array.isArray(values) || values.length < 20 || values.slice(0,24).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)) {
    throw new Error('previsao_horaria_invalida')
  }
  const chuva = (values as number[]).slice(0,24)
  const total24h = chuva.reduce((a,b)=>a+b,0)
  let pico3h=0
  for(let i=0;i<=chuva.length-3;i++)pico3h=Math.max(pico3h,chuva[i]+chuva[i+1]+chuva[i+2])
  return { total24h: Math.round(total24h*10)/10, pico3h: Math.round(pico3h*10)/10 }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return resposta({ error: 'method_not_allowed' }, 405)
  const token = env('PUSH_JOB_SECRET')
  if (!token || request.headers.get('x-job-secret') !== token) return resposta({ error: 'unauthorized' }, 401)
  if (env('PUSH_ALERTS_ENABLED') !== 'true') return resposta({ enabled: false, sent: 0 })
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY') ||
      !env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY') || !env('VAPID_SUBJECT')) {
    return resposta({ error: 'server_configuration_incomplete' }, 503)
  }
  try { webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY')) }
  catch { return resposta({ error: 'vapid_invalid' }, 503) }

  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: subs, error: subscriptionsError } = await client.from('push_morador_assinaturas')
    .select('id,usuario_id,endereco_id,endpoint,p256dh,auth,chuva_fraca,chuva_forte,alagamento')
    .eq('ativo', true).eq('consentimento', true).order('id').limit(101)
  if (subscriptionsError) return resposta({ error: 'subscriptions_unavailable' }, 503)
  // MVP: limite consciente; com >100, migrar para fila e paginação no servidor.
  if ((subs ?? []).length > 100) return resposta({ error: 'subscription_limit_requires_queue', count: (subs ?? []).length }, 503)
  const subscriptions = (subs ?? []) as Sub[]
  if (!subscriptions.length) return resposta({ enabled: true, processed: 0, sent: 0 })

  const ids = [...new Set(subscriptions.map(s=>s.endereco_id))]
  const { data: addressRows, error: addressError } = await client.from('enderecos')
    .select('id,usuario_id,latitude,longitude,bairro,municipio').in('id', ids)
  if (addressError) return resposta({ error: 'addresses_unavailable' }, 503)
  const addressMap = new Map(((addressRows ?? []) as Endereco[]).map(a=>[a.id,a]))

  const { data: stationRows } = await client.from('vw_estacoes_publicas')
    .select('codigo_estacao,latitude,longitude,fonte,chuva_acumulada_mm,ultima_leitura_em,tipo_medicao,janela_horas,unidade,qualidade_dado').limit(500)
  const stations = (stationRows ?? []) as RegistroEstacao[]
  const now = Date.now()
  const cache = new Map<string, Previsao|null>()
  const chuvaCache = new Map<string, ReturnType<typeof triangularChuvaServidor>>()
  const eventosMap = new Map<string,Evento[]>()
  if (env('PUSH_FLOOD_ALERTS_ENABLED') === 'true') {
    const { data: eventos, error } = await client.from('eventos_risco_servidor')
      .select('id,usuario_id,endereco_id,confirmado_servidor,expira_em')
      .in('endereco_id', ids).eq('confirmado_servidor', true)
      .gt('expira_em', new Date(now).toISOString())
      .gte('criado_em', new Date(now-2*3_600_000).toISOString())
    // Se não houver migration de eventos, NÃO tentar fabricar eventos por previsão.
    if (!error) for(const e of (eventos ?? []) as Evento[]){
      const items=eventosMap.get(e.endereco_id)??[];items.push(e);eventosMap.set(e.endereco_id,items)
    }
  }
  let sent=0, failed=0, skipped=0
  const reservar = async (s: Sub, categoria: string, chave: string) => {
    const { data, error } = await client.from('push_morador_entregas')
      .insert({ assinatura_id:s.id, categoria, chave_evento:chave, status:'reservado' })
      .select('id').single()
    if (error?.code==='23505') return null
    if (error) throw new Error('reserva_push_falhou')
    return data.id as string
  }
  const enviar = async (s: Sub, categoria: 'chuva_fraca'|'chuva_forte'|'alagamento', chave: string, title: string, body: string) => {
    let id: string|null=null
    try {
      id=await reservar(s,categoria,chave)
      if(!id){skipped++;return}
      await webpush.sendNotification({ endpoint:s.endpoint, keys:{p256dh:s.p256dh,auth:s.auth} },
        JSON.stringify({title,body,tag:`alerta-${categoria}`}), { TTL: 3600, urgency:categoria==='alagamento'?'high':'normal' })
      await client.from('push_morador_entregas').update({status:'enviado',enviado_em:new Date().toISOString()}).eq('id',id)
      sent++
    } catch (caught) {
      failed++
      const status=typeof caught==='object'&&caught!==null&&'statusCode' in caught?Number(caught.statusCode):null
      if(id)await client.from('push_morador_entregas').update({status:'erro',http_status:status}).eq('id',id)
      if(status===404||status===410)await client.from('push_morador_assinaturas').update({ativo:false,consentimento:false}).eq('id',s.id)
    }
  }

  for(const s of subscriptions){
    const e=addressMap.get(s.endereco_id)
    if (!e || e.usuario_id!==s.usuario_id || !Number.isFinite(e.latitude)||!Number.isFinite(e.longitude)) {skipped++;continue}
    const bairro=(e.bairro??e.municipio??'sua região').slice(0,80)
    const eventos=(eventosMap.get(e.id)??[]).filter(item=>item.usuario_id===s.usuario_id)
    if(s.alagamento&&eventos.length>0){
      for(const evento of eventos){
        await enviar(s,'alagamento',`alagamento:${evento.id}`,
          'Atenção: indícios de alagamento no endereço',
          `Evento verificado pelo servidor para seu endereço em ${bairro}. Confira as condições e alertas oficiais. Emergência: 199.`)
      }
    }
    if(!cache.has(e.id)){
      try {cache.set(e.id,await preverNoEndereco(e))}catch {cache.set(e.id,null)}
      chuvaCache.set(e.id,triangularChuvaServidor(e,stations,now))
    }
    const forecast=cache.get(e.id)
    if(!forecast){failed++;continue}
    const chuva=chuvaCache.get(e.id)?.chuvaMm24h??null
    const categoria=classificarAvisoChuva(forecast.total24h,forecast.pico3h,chuva)
    if(categoria==='nenhuma'||(categoria==='chuva_fraca'&&!s.chuva_fraca)||(categoria==='chuva_forte'&&!s.chuva_forte))continue
    const msJanela=categoria==='chuva_forte'?2*3_600_000:6*3_600_000
    const janela=Math.floor(now/msJanela)
    if(categoria==='chuva_forte'){
      const textoChuvaForte = forecast.total24h >= 30 || forecast.pico3h >= 20
        ? `Previsão ${forecast.total24h.toFixed(1).replace('.',',')} mm/24 h em ${bairro}.`
        : `Chuva observada estimada ${chuva?.toFixed(1).replace('.',',')} mm/24 h em ${bairro}; previsão ${forecast.total24h.toFixed(1).replace('.',',')} mm/24 h.`
      await enviar(s,'chuva_forte',`chuva_forte:${janela}`,
        'Chuva forte: atenção perto do seu endereço',
        `${textoChuvaForte} Acompanhe as condições locais; risco de alagamento do imóvel não confirmado. Defesa Civil: 199.`)
    }else{
      await enviar(s,'chuva_fraca',`chuva_fraca:${janela}`,
        'Chuva prevista perto do seu endereço',
        `Previsão ${forecast.total24h.toFixed(1).replace('.',',')} mm/24 h em ${bairro}. Acompanhe as atualizações. Não é alerta de alagamento.`)
    }
  }
  return resposta({ enabled:true, processed:subscriptions.length, sent, failed, skipped,
    floodEnabled:env('PUSH_FLOOD_ALERTS_ENABLED')==='true',
    source:'open-meteo + cemaden (triangulação quando válida)' })
})
