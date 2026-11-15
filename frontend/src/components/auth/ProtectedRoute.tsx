import type { ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { SupabaseSetupNotice } from '@/components/auth/SupabaseSetupNotice'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, isConfigured, session } = useAuth()
  const location = useLocation()

  if (!isConfigured) {
    return <SupabaseSetupNotice />
  }

  if (isLoading) {
    return (
      <Card className="mx-auto flex max-w-2xl items-center gap-3 p-5">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-brand-700"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-600" role="status" aria-live="polite">
          Verificando sua sessão…
        </p>
      </Card>
    )
  }

  if (!session) {
    const redirect = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={`/entrar?redirect=${encodeURIComponent(redirect)}`}
        replace
      />
    )
  }

  return <>{children}</>
}
