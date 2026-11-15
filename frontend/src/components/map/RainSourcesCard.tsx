import { ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { RainSourceStatus } from '@/types/rainSources'
import type { RainStation } from '@/types/rain'
import { RAIN_SOURCE_URLS } from '@/lib/rainSources'

export function RainSourcesCard({ sources, stations, isLoading }: { sources: RainSourceStatus[]; stations: RainStation[]; isLoading: boolean }) {
  const cemaden = stations.filter(station => station.source === 'CEMADEN')
  return <Card className="p-4" aria-labelledby="fontes-pluviometricas">
    <h2 id="fontes-pluviometricas" className="text-base font-bold text-slate-900">Redes de medição de chuva</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Catálogo localiza postos; não comprova leitura atual. Ausência de medição não significa chuva zero.</p>
    <ul className="mt-4 space-y-4">
      <li><a href={RAIN_SOURCE_URLS.CEMADEN} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-800">CEMADEN <ExternalLink className="h-4 w-4" aria-hidden="true" /></a><p className="text-sm text-slate-600">{cemaden.length} estações na camada principal. Confira o horário e a disponibilidade de cada leitura.</p></li>
      {sources.map(source => <li key={source.source}>
        <div className="flex flex-wrap items-center justify-between gap-2"><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-800">{source.source}<ExternalLink className="h-4 w-4" aria-hidden="true" /></a><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{isLoading ? 'Consultando' : source.status === 'catalogue' ? `${source.count} no catálogo` : source.status === 'authorization_required' ? 'Acesso pendente' : 'Indisponível'}</span></div>
        <p className="text-sm leading-relaxed text-slate-600">{isLoading ? 'Verificando catálogo complementar…' : source.message}</p>
      </li>)}
    </ul>
  </Card>
}
