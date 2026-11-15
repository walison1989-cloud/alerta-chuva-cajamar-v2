import { useEffect } from 'react'
import { AlertTriangle, Home, RotateCw } from 'lucide-react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { BrandMark } from '@/components/brand/Brand'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function RouteErrorPage() {
  useDocumentTitle('Erro inesperado')
  const error = useRouteError()

  useEffect(() => {
    console.error('Erro de rota não tratado:', error)
  }, [error])

  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-app sm:p-8">
        <BrandMark className="mx-auto h-14 w-14" />
        <span className="mt-5 inline-flex rounded-2xl bg-alert-50 p-3 text-alert-700">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-950">
          {isNotFound ? 'Página não encontrada' : 'Algo deu errado'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {isNotFound
            ? 'O endereço acessado não existe.'
            : 'Não foi possível carregar esta tela. Tente recarregar a página. Se o problema continuar, volte mais tarde.'}
        </p>

        {import.meta.env.DEV && error instanceof Error ? (
          <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-slate-950 p-3 text-left text-[13px] text-slate-100">
            {error.message}
          </pre>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={buttonStyles('primary')}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Recarregar
          </button>
          <Link to="/" className={buttonStyles('secondary')}>
            <Home className="h-4 w-4" aria-hidden="true" />
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  )
}
