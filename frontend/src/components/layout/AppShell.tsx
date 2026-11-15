import { Outlet } from 'react-router-dom'
import { APP_NAME, LEGAL_DISCLAIMER, SOURCE_OPEN_METEO } from '@/config/app'
import { BottomNav } from '@/components/layout/BottomNav'
import { ConnectionBanner } from '@/components/layout/ConnectionBanner'
import { MobileMenuProvider } from '@/components/layout/MobileMenu'
import { PwaUpdatePrompt } from '@/components/layout/PwaUpdatePrompt'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

function AppFooter() {
  return (
    <footer className="border-t border-slate-200/70 px-4 pb-24 pt-6 text-center sm:px-6 lg:px-8 lg:pb-8">
      <p className="mx-auto max-w-3xl text-[13px] leading-relaxed text-slate-500">
        {LEGAL_DISCLAIMER}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">
        {APP_NAME} ·{' '}
        <a
          href={SOURCE_OPEN_METEO.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-slate-500 transition hover:text-brand-700"
        >
          Open-Meteo
        </a>{' '}
        ·{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-slate-500 transition hover:text-brand-700"
        >
          OpenStreetMap
        </a>
      </p>
    </footer>
  )
}

export function AppShell() {
  return (
    <MobileMenuProvider>
      <div className="min-h-dvh bg-[#eaf1f8]">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[130] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-brand-800 focus:shadow-app"
        >
          Pular para o conteúdo
        </a>

        <Sidebar />

        <div className="lg:pl-64">
          <TopBar />
          <ConnectionBanner />
          <main
            id="conteudo"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-8"
          >
            <Outlet />
          </main>
          <AppFooter />
        </div>

        <BottomNav />
        <PwaUpdatePrompt />
      </div>
    </MobileMenuProvider>
  )
}
