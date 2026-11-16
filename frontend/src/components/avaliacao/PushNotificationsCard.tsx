import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { env } from '@/config/env'
import { getSupabaseClient } from '@/lib/supabase'

function chavePublicaBuffer(chave: string): ArrayBuffer {
  const base64 = chave.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return bytes.buffer as ArrayBuffer
}

interface Props { userId: string | null; enderecoId: string | null }

export function PushNotificationsCard({ userId, enderecoId }: Props) {
  const [ativo, setAtivo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [fraca, setFraca] = useState(true)
  const [forte, setForte] = useState(true)
  const [alagamento, setAlagamento] = useState(true)
  const chavePublica = env.webPushPublicKey
  const suportado = typeof window !== 'undefined' &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  useEffect(() => {
    let active = true
    async function carregar() {
      const client = getSupabaseClient()
      if (!suportado || !userId || !client) return
      try {
        const registro = await navigator.serviceWorker.getRegistration()
        const assinatura = await registro?.pushManager.getSubscription()
        if (!assinatura || !active) return
        const { data } = await client.from('push_morador_assinaturas')
          .select('ativo,consentimento,chuva_fraca,chuva_forte,alagamento')
          .eq('usuario_id', userId).eq('endpoint', assinatura.endpoint).maybeSingle()
        if (!active || !data) return
        setAtivo(data.ativo === true && data.consentimento === true)
        setFraca(data.chuva_fraca === true)
        setForte(data.chuva_forte === true)
        setAlagamento(data.alagamento === true)
      } catch { /* cadastro ainda não configurado */ }
    }
    void carregar()
    return () => { active = false }
  }, [suportado, userId])

  async function ativar(): Promise<void> {
    if (!userId || !enderecoId || !chavePublica) {
      setMensagem('Confirme o endereço e configure a chave VAPID pública para ativar avisos.')
      return
    }
    const client = getSupabaseClient()
    if (!client || !suportado) { setMensagem('Este navegador não oferece Web Push neste dispositivo.'); return }
    setOcupado(true)
    setMensagem(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Permissão de notificação não concedida no navegador.')
      const registration = await navigator.serviceWorker.register('/sw.js')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chavePublicaBuffer(chavePublica),
      })
      const json = subscription.toJSON()
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error('O navegador não devolveu as chaves do dispositivo.')
      const { error } = await client.from('push_morador_assinaturas').upsert({
        usuario_id: userId, endereco_id: enderecoId,
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh, auth: json.keys.auth,
        ativo: true, consentimento: true,
        chuva_fraca: fraca, chuva_forte: forte, alagamento,
      }, { onConflict: 'endpoint' })
      if (error) throw new Error('Não foi possível cadastrar o dispositivo: ' + error.message)
      setAtivo(true)
      setMensagem('Dispositivo cadastrado. Os avisos automáticos dependem da rotina segura de envio habilitada no Supabase.')
    } catch (caught) {
      setMensagem(caught instanceof Error ? caught.message : 'Falha ao ativar notificações.')
    } finally { setOcupado(false) }
  }

  async function desativar(): Promise<void> {
    const client = getSupabaseClient()
    if (!client || !userId || !suportado) return
    setOcupado(true)
    setMensagem(null)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const { error } = await client.from('push_morador_assinaturas')
          .update({ ativo: false, consentimento: false })
          .eq('usuario_id', userId).eq('endpoint', subscription.endpoint)
        if (error) throw new Error(error.message)
        await subscription.unsubscribe()
      }
      setAtivo(false)
      setMensagem('Notificações desativadas neste dispositivo.')
    } catch (caught) {
      setMensagem(caught instanceof Error ? caught.message : 'Não foi possível desativar o dispositivo.')
    } finally { setOcupado(false) }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        {ativo ? <Bell className="h-5 w-5 text-brand-700" /> : <BellOff className="h-5 w-5 text-slate-500" />}
        <h2 className="text-lg font-bold text-slate-900">Avisos push de chuva no seu endereço</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Ative voluntariamente alertas de chuva fraca/moderada e chuva forte. Avisos de alagamento só serão enviados quando um evento for verificado no servidor. Não substituem a Defesa Civil.
      </p>
      <fieldset className="mt-3 space-y-2 text-sm text-slate-700" disabled={ativo || ocupado}>
        <legend className="mb-2 font-semibold">Quero receber:</legend>
        <label className="flex gap-2"><input type="checkbox" checked={fraca} onChange={e => setFraca(e.target.checked)} /> Chuva fraca ou moderada prevista</label>
        <label className="flex gap-2"><input type="checkbox" checked={forte} onChange={e => setForte(e.target.checked)} /> Chuva forte ou intensa</label>
        <label className="flex gap-2"><input type="checkbox" checked={alagamento} onChange={e => setAlagamento(e.target.checked)} /> Alagamento com evidências verificadas</label>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        {ativo ? (
          <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => void desativar()} disabled={ocupado}>Desativar neste dispositivo</button>
        ) : (
          <button type="button" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void ativar()} disabled={ocupado || !suportado || !userId || !enderecoId || !chavePublica}>Ativar notificações push</button>
        )}
      </div>
      {!suportado && <p className="mt-2 text-xs text-amber-800">Web Push não disponível neste navegador. No iPhone, abra o site instalado pela tela inicial.</p>}
      {!chavePublica && <p className="mt-2 text-xs text-amber-800">A chave VAPID pública ainda não foi configurada na Vercel.</p>}
      {mensagem && <p role="status" className="mt-2 text-sm text-slate-700">{mensagem}</p>}
    </Card>
  )
}
