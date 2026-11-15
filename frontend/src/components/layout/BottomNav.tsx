import { MoreHorizontal } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { MAIN_NAV } from '@/config/navigation'
import { cn } from '@/lib/cn'
import { useMobileMenu } from './mobileMenuContext'
const VISIBLE_ITEMS = MAIN_NAV.slice(0, 4)
const HAS_MORE = MAIN_NAV.length > VISIBLE_ITEMS.length
export function BottomNav() {
  const { isOpen, open } = useMobileMenu()
  return <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-xl lg:hidden" aria-label="Navegação principal">
    <ul className="mx-auto grid max-w-2xl gap-1 px-2 pt-1.5" style={{gridTemplateColumns:`repeat(${VISIBLE_ITEMS.length+(HAS_MORE?1:0)},minmax(0,1fr))`}}>
      {VISIBLE_ITEMS.map(item=><li key={item.to}><NavLink to={item.to} end={item.end} className={({isActive})=>cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold',isActive?'bg-brand-50 text-brand-800':'text-slate-600 hover:bg-slate-50')}><item.icon className="h-5 w-5" aria-hidden="true" /><span>{item.shortLabel}</span></NavLink></li>)}
      {HAS_MORE?<li><button type="button" onClick={open} aria-haspopup="dialog" aria-expanded={isOpen} aria-label="Abrir mais opções de navegação" className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-slate-600"><MoreHorizontal className="h-5 w-5" aria-hidden="true" />Mais</button></li>:null}
    </ul>
  </nav>
}
