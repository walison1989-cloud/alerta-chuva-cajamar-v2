/**
 * Entrega e-mail/SMS SOMENTE a partir de evento de risco previamente
 * confirmado por processo confiável no servidor. Nunca aceita do navegador
 * um nível de risco ou destino como fonte de verdade.
 * Deploy desativado por padrão (ALERT_DELIVERY_ENABLED != true).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const env = (name: string) => Deno.env.get(name) ?? ''

async function enviarEmail(destino: string, id: string): Promise<void> {
  if (!env('RESEND_API_KEY') || !env('ALERT_FROM_EMAIL')) throw new Error('email_nao_configurado')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': id,
    },
    body: JSON.stringify({
      from: env('ALERT_FROM_EMAIL'), to: [destino],
      subject: 'Aviso preventivo: condições de alagamento',
      text: 'Foram detectadas condições que podem favorecer alagamento no endereço cadastrado. Verifique a situação local e os comunicados da Defesa Civil. Este aviso é experimental, não oficial e não confirma que o imóvel será inundado. Emergências: 199.',
    }),
  })
  if (!response.ok) throw new Error(`email_http_${response.status}`)
}

async function enviarSms(destino: string): Promise<void> {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_FROM_NUMBER')
  if (!sid || !token || !from) throw new Error('sms_nao_configurado')
  const digits = destino.replace(/\D/g, '')
  if (!/^\d{10,11}$/.test(digits)) throw new Error('sms_destino_invalido')
  const params = new URLSearchParams({
    To: `+55${digits}`, From: from,
    Body: 'Alerta Chuva Cajamar: condições podem favorecer alagamento no seu endereço. Verifique os alertas oficiais da Defesa Civil. Aviso experimental. Emergência: 199.',
  })
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  if (!response.ok) throw new Error(`sms_http_${response.status}`)
}

Deno.serve(async (request: Request) => {
  const token = env('RISK_ALERT_JOB_SECRET')
  if (!token || request.headers.get('x-job-secret') !== token) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  // Fail-closed: credenciais presentes não ativam o envio automaticamente.
  if (env('ALERT_DELIVERY_ENABLED') !== 'true') {
    return Response.json({ enabled: false, sent: 0 })
  }
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response('Server configuration missing', { status: 503 })
  }
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('reservar_entregas_risco', { p_limite: 20 })
  if (error) return Response.json({ error: 'reservation_failed' }, { status: 503 })
  let sent = 0
  let failed = 0
  for (const entrega of data ?? []) {
    try {
      if (entrega.canal === 'email') await enviarEmail(entrega.destino, entrega.entrega_id)
      else if (entrega.canal === 'sms') await enviarSms(entrega.destino)
      else throw new Error('canal_invalido')
      const { error: updateError } = await supabase.from('entregas_alerta_risco')
        .update({ status: 'enviado', enviado_em: new Date().toISOString(), ultimo_erro: null })
        .eq('id', entrega.entrega_id).eq('status', 'processando')
      if (updateError) throw new Error('registro_envio_falhou')
      sent += 1
    } catch (caught) {
      failed += 1
      const reason = caught instanceof Error ? caught.message.slice(0, 100) : 'falha_provedor'
      // Não reenvia automaticamente resultados de SMS com confirmação incerta.
      await supabase.from('entregas_alerta_risco')
        .update({ status: 'erro', ultimo_erro: reason })
        .eq('id', entrega.entrega_id).eq('status', 'processando')
    }
  }
  return Response.json({ enabled: true, processed: (data ?? []).length, sent, failed })
})
