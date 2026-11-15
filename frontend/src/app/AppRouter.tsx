import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'

const DemoPage = lazy(() =>
  import('@/pages/DemoPage').then((mod) => ({ default: mod.DemoPage })),
)
const MapPage = lazy(() =>
  import('@/pages/MapPage').then((mod) => ({ default: mod.MapPage })),
)
const MyAddressPage = lazy(() =>
  import('@/pages/MyAddressPage').then((mod) => ({ default: mod.MyAddressPage })),
)
const NewOccurrencePage = lazy(() =>
  import('@/pages/NewOccurrencePage').then((mod) => ({
    default: mod.NewOccurrencePage,
  })),
)
const AvaliacaoPreventivaPage = lazy(() =>
  import('@/pages/AvaliacaoPreventivaPage').then((mod) => ({
    default: mod.AvaliacaoPreventivaPage,
  })),
)
const AdminPage = lazy(() =>
  import('@/pages/AdminPage').then((mod) => ({ default: mod.AdminPage })),
)
const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((mod) => ({ default: mod.LoginPage })),
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((mod) => ({
    default: mod.ResetPasswordPage,
  })),
)
const ContatosPage = lazy(() =>
  import('@/pages/ContatosPage').then((mod) => ({ default: mod.ContatosPage })),
)

function RouteSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="h-4 w-1/3 bg-slate-200/70 rounded animate-pulse" />
      <div className="h-4 w-2/3 bg-slate-200/70 rounded animate-pulse" />
      <div className="h-24 w-full bg-slate-200/70 rounded animate-pulse" />
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteSkeleton />}>
        <Routes>
          <Route path="/" element={<AppShell />} errorElement={<RouteErrorPage />}>
            <Route index element={<HomePage />} />
            <Route path="meu-endereco" element={<MyAddressPage />} />
            <Route path="contatos" element={<ContatosPage />} />
            <Route path="demo" element={<DemoPage />} />
            <Route path="mapa" element={<MapPage />} />
            <Route path="ocorrencias/nova" element={<NewOccurrencePage />} />
            <Route
              path="analise-preventiva"
              element={<AvaliacaoPreventivaPage />}
            />
            <Route path="painel" element={<AdminPage />} />
            <Route path="entrar" element={<LoginPage />} />
            <Route path="redefinir-senha" element={<ResetPasswordPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
