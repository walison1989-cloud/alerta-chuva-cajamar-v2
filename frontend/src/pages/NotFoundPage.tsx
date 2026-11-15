import { ArrowLeft, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/brand/Brand'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada')

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center sm:py-16">
      <BrandMark className="h-16 w-16" />
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-brand-700">
        Erro 404
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        Página não encontrada
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        O endereço acessado não existe ou foi movido. Volte ao início para
        consultar as condições de Cajamar.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/" className={buttonStyles('primary')}>
          <Home className="h-4 w-4" aria-hidden="true" />
          Ir para o início
        </Link>
        <Link to="/mapa" className={buttonStyles('secondary')}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Ver mapa
        </Link>
      </div>
    </div>
  )
}
