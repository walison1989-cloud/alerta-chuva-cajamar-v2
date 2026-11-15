import { LockKeyhole, Map, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
export function SupabaseSetupNotice() {
  return <Card className="mx-auto max-w-2xl p-6" aria-labelledby="conta-indisponivel">
    <LockKeyhole className="mb-4 h-7 w-7 text-brand-700" aria-hidden="true" />
    <h2 id="conta-indisponivel" className="text-xl font-bold text-slate-950">Acesso à conta indisponível</h2>
    <p className="mt-3 text-base leading-relaxed text-slate-600">O cadastro e os endereços privados ainda não estão disponíveis nesta versão. Nenhum dado de conta será enviado por esta tela.</p>
    <p className="mt-3 text-sm leading-relaxed text-slate-600">Você pode continuar consultando a previsão e o mapa público, sem criar uma conta.</p>
    <div className="mt-5 flex flex-col gap-2 sm:flex-row"><Link to="/" className={buttonStyles('primary')}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Consultar o clima</Link><Link to="/mapa" className={buttonStyles('secondary')}><Map className="h-4 w-4" aria-hidden="true" />Abrir mapa</Link></div>
  </Card>
}
