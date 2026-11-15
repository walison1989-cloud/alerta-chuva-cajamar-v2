import { useState } from 'react'
import { Download, LoaderCircle, LockKeyhole, LogOut, UserRound, Wifi, WifiOff } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { BrandMark } from '@/components/brand/Brand'
import { MobileMenuButton } from './MobileMenu'
import { MAIN_NAV } from '@/config/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export function TopBar() {
  const { pathname }=useLocation()
  const {canInstall,install}=useInstallPrompt()
  const online=useOnlineStatus()
  const {session,signOut,isLoading}=useAuth()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const title=MAIN_NAV.find(item=>item.to===pathname)?.label ?? (pathname==='/entrar'?'Minha conta':pathname==='/redefinir-senha'?'Redefinir senha':'Alerta de Chuva Cajamar')
  async function leave(){setBusy(true);setError(null);try{await signOut()}catch{setError('Não foi possível sair da conta. Tente novamente.')}finally{setBusy(false)}}
  return <header className="safe-top sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
    <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
      <MobileMenuButton className="shrink-0" />
      <Link to="/" className="flex min-w-0 items-center gap-2 rounded-xl lg:hidden" aria-label="Ir para a tela inicial"><BrandMark className="h-9 w-9" /><span className="text-sm font-bold leading-tight text-brand-950">Alerta de Chuva<span className="block text-xs font-medium text-slate-600">Cajamar</span></span></Link>
      <div className="hidden min-w-0 lg:block"><p className="text-sm font-semibold text-slate-900">{title}</p><p className="text-[13px] text-slate-600">Cajamar, São Paulo</p></div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span role="status" aria-live="polite" aria-label={online?'Conexão com a internet disponível':'Sem conexão com a internet'} className="hidden items-center gap-1.5 px-2 text-[13px] text-slate-600 md:inline-flex">{online?<Wifi className="h-4 w-4" aria-hidden="true" />:<WifiOff className="h-4 w-4" aria-hidden="true" />}{online?'Com conexão':'Sem conexão'}</span>
        {canInstall?<button type="button" onClick={()=>void install()} aria-label="Instalar o aplicativo neste aparelho" className="hidden min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"><Download className="h-4 w-4" aria-hidden="true" /><span className="hidden xl:inline">Instalar</span></button>:null}
        {isLoading?<span role="status" aria-label="Verificando sua conta" className="flex h-11 w-11 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-brand-700" aria-hidden="true" /></span>:<Link to="/entrar" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50" aria-label={session?'Abrir minha conta':'Entrar na conta'}>{session?<UserRound className="h-5 w-5" aria-hidden="true" />:<LockKeyhole className="h-4 w-4" aria-hidden="true" />}{session?<span className="hidden sm:inline">Minha conta</span>:'Entrar'}</Link>}
        {session?<button type="button" onClick={()=>void leave()} disabled={busy} aria-label="Sair da conta" className="hidden h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-60 lg:inline-flex">{busy?<LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />:<LogOut className="h-5 w-5" aria-hidden="true" />}</button>:null}
      </div>
    </div>
    {error?<p role="alert" className="mx-4 mb-3 rounded-xl border border-alert-200 bg-alert-50 px-3 py-2 text-sm text-alert-800">{error}</p>:null}
  </header>
}
