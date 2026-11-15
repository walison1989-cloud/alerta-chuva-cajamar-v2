import { ArrowRight, CloudRain, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
export function ObservedRainCard() {
  return <Card className="p-5 sm:p-6" aria-labelledby="chuva-observada">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-800"><CloudRain className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="chuva-observada" className="text-lg font-bold text-slate-950">Chuva observada</h2><p className="mt-1 text-sm text-slate-600">Pluviômetros oficiais do CEMADEN</p></div></div><Badge tone="safe">Medição</Badge></div>
    <h3 className="mt-5 text-base font-semibold text-slate-900">Estações no mapa interativo</h3>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Consulte o acumulado de 24 horas, o horário da leitura e a localização de cada estação. O mapa informa quando os dados estão indisponíveis ou desatualizados.</p>
    <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-slate-600"><Info className="mt-0.5 h-4 w-4 text-emerald-800" aria-hidden="true" /><span>Sem leitura não significa sem chuva. A medição de uma estação não confirma o risco de alagamento no seu imóvel. O mapa também identifica catálogos complementares sem medição atual integrada.</span></p>
    <Link to="/mapa" className={buttonStyles('secondary','md','mt-5 w-full sm:w-auto')}>Abrir mapa de estações<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
  </Card>
}
