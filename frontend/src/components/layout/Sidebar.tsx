import { useState } from 'react'
import { LoaderCircle, LogOut, ShieldCheck, Phone, UserRound, LockKeyhole } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { BrandLockup } from '@/components/brand/Brand'
import { MAIN_NAV } from '@/config/navigation'
import { EMERGENCY_NUMBERS } from '@/config/app'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'

export function Sidebar() {
  const { user, session, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function leave() {
    setBusy(true); setError(null)
    try { await signOut() } catch { setError('Não foi possível sair. Tente novamente.') } finally { setBusy(false) }
  }
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <Link to="/" className="mx-5 mb-8 mt-7 rounded-xl" aria-label="Ir para a tela inicial"><BrandLockup /></Link>
      <nav className="flex-1 overflow-y-auto px-3" aria-label="Navegação principal">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Acompanhe Cajamar</p>
        <ul className="space-y-1.5">{MAIN_NAV.map(item => (
          <li key={item.to}><NavLink to={item.to} end={item.end} className={({isActive}) => cn('flex min-h-14 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',isActive?'bg-brand-50 text-brand-900 ring-1 ring-brand-100':'text-slate-600 hover:bg-slate-50 hover:text-slate-950')}>
            <item.icon className="h-5 w-5" aria-hidden="true" /><span>{item.label}</span>
          </NavLink></li>
        ))}</ul>
        <div className="mx-1 mt-8 rounded-2xl bg-slate-50 p-4">
          <ShieldCheck className="mb-2 h-5 w-5 text-brand-700" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-900">Informação para se preparar</p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">Previsão e chuva medida são informações diferentes. Os avisos oficiais vêm da Defesa Civil.</p>
        </div>
      </nav>
      <div className="m-4 rounded-2xl border border-alert-100 bg-alert-50 p-3">
        <p className="mb-2 px-1 text-xs font-semibold text-alert-900">Em uma emergência</p>
        {EMERGENCY_NUMBERS.map(item=><a key={item.number} href={item.href} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-alert-900 hover:bg-white"><Phone className="h-4 w-4" aria-hidden="true" />{item.label}<strong className="ml-auto">{item.number}</strong></a>)}
      </div>
      <div className="border-t border-slate-200 p-4">
        <Link to={session?'/meu-endereco':'/entrar'} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          {session?<UserRound className="h-5 w-5" aria-hidden="true" />:<LockKeyhole className="h-5 w-5" aria-hidden="true" />}<span className="min-w-0 truncate">{session?user?.email??'Minha conta':'Entrar na minha conta'}</span>
        </Link>
        {session?<button type="button" disabled={busy} onClick={()=>void leave()} className="mt-1 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60">{busy?<LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />:<LogOut className="h-4 w-4" aria-hidden="true" />}Sair da conta</button>:null}
        {error?<p role="alert" className="mt-2 text-sm text-alert-800">{error}</p>:null}
      </div>
    </aside>
  )
}
