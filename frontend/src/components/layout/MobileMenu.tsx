import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Menu, X, LockKeyhole } from 'lucide-react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { BrandLockup } from '@/components/brand/Brand'
import { MobileMenuContext, useMobileMenu } from './mobileMenuContext'
import { MAIN_NAV } from '@/config/navigation'
import { cn } from '@/lib/cn'

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const { pathname } = useLocation()
  const [lastPathname, setLastPathname] = useState(pathname)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(true)
  if (pathname !== lastPathname) { setLastPathname(pathname); if (isOpen) setIsOpen(false) }
  const open=useCallback(()=> { triggerRef.current=document.activeElement as HTMLElement; restoreFocusRef.current=true; setIsOpen(true) },[])
  const close=useCallback(()=>setIsOpen(false),[])
  const toggle=useCallback(()=>{ if(isOpen) close(); else open() },[isOpen,open,close])
  const navigate=()=>{restoreFocusRef.current=false;close()}
  useEffect(()=>{
    if(!isOpen) return
    const previousOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    const focusTimer=window.setTimeout(()=>panelRef.current?.querySelector<HTMLElement>('button,a[href]')?.focus(),0)
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){ event.preventDefault();close();return }
      if(event.key!=='Tab') return
      const focusable=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')??[])
      const first=focusable[0],last=focusable.at(-1)
      if(!first){event.preventDefault();panelRef.current?.focus();return}
      if(event.shiftKey && (document.activeElement===first || !panelRef.current?.contains(document.activeElement))){event.preventDefault();last?.focus()}
      else if(!event.shiftKey && (document.activeElement===last || !panelRef.current?.contains(document.activeElement))){event.preventDefault();first.focus()}
    }
    const query=typeof window.matchMedia==='function'?window.matchMedia('(min-width: 1024px)'):null
    const onDesktop=()=>{if(query?.matches)close()}
    document.addEventListener('keydown',onKey)
    query?.addEventListener('change',onDesktop)
    return ()=>{
      document.removeEventListener('keydown',onKey);query?.removeEventListener('change',onDesktop)
      document.body.style.overflow=previousOverflow;window.clearTimeout(focusTimer)
      if(restoreFocusRef.current)queueMicrotask(()=>triggerRef.current?.focus())
    }
  },[isOpen,close])
  const value=useMemo(()=>({isOpen,open,close,toggle}),[isOpen,open,close,toggle])
  return <MobileMenuContext.Provider value={value}>
    <div inert={isOpen}>{children}</div>
    {isOpen?<div className="fixed inset-0 z-[120] lg:hidden">
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-slate-950/45" aria-label="Fechar menu de navegação" onClick={close}/>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" tabIndex={-1} className="safe-top absolute inset-y-0 left-0 flex w-[min(22rem,90vw)] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4"><BrandLockup /><button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100" aria-label="Fechar menu"><X className="h-5 w-5" aria-hidden="true" /></button></div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Menu do aplicativo"><h2 id="mobile-menu-title" className="px-3 pb-3 pt-2 text-sm font-semibold text-slate-600">Menu de navegação</h2><ul className="space-y-1">
          {MAIN_NAV.map(item=><li key={item.to}><NavLink to={item.to} end={item.end} onClick={navigate} className={({isActive})=>cn('flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold',isActive?'bg-brand-50 text-brand-900':'text-slate-700 hover:bg-slate-50')}><item.icon className="h-5 w-5" aria-hidden="true" /><span>{item.label}<span className="mt-0.5 block text-[13px] font-normal text-slate-600">{item.description}</span></span></NavLink></li>)}
          <li className="mt-4 border-t border-slate-200 pt-3"><Link to="/entrar" onClick={navigate} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-brand-800"><LockKeyhole className="h-5 w-5" aria-hidden="true" />Minha conta</Link></li>
        </ul></nav>
        <div className="border-t border-slate-200 p-4 text-sm leading-relaxed text-slate-600">Em emergência, procure a Defesa Civil. <a href="tel:199" className="inline-flex min-h-11 items-center font-bold text-alert-800">Ligar 199</a></div>
      </div>
    </div>:null}
  </MobileMenuContext.Provider>
}

export function MobileMenuButton({className}:{className?:string}) {
  const {isOpen,toggle}=useMobileMenu()
  return <button type="button" onClick={toggle} className={cn('inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden',className)} aria-label={isOpen?'Fechar menu de navegação':'Abrir menu de navegação'} aria-expanded={isOpen} aria-haspopup="dialog"><Menu className="h-5 w-5" aria-hidden="true" /></button>
}
