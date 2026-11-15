import { FlaskConical, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { env } from '@/config/env'

export function ExperimentalAnalysisCard() {
  const habilitado = env.experimentalAnalysisEnabled

  return (
    <Card
      className="border-attention-200/80 bg-attention-50/50 p-5"
      aria-labelledby="analise-experimental"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-attention-100 p-2.5 text-attention-700">
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="analise-experimental"
              className="text-base font-bold tracking-tight text-slate-900"
            >
              Análise preventiva
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Módulo separado dos alertas oficiais
            </p>
          </div>
        </div>
        <Badge tone={habilitado ? 'attention' : 'neutral'}>
          {habilitado ? 'Experimental' : 'Desativada'}
        </Badge>
      </header>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-white/75 p-3 ring-1 ring-attention-200/60">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-attention-700"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-slate-600">
          Cruza suscetibilidade oficial do terreno, chuva observada nas estações
          e previsão para as próximas 24 h. O resultado é uma leitura
          experimental explicável: não é alerta oficial e não estima
          probabilidade de alagamento.
        </p>
      </div>

      <Link
        to="/analise-preventiva"
        className={buttonStyles('secondary', 'sm', 'mt-3 w-full')}
      >
        {habilitado ? 'Abrir análise preventiva' : 'Ver detalhes do módulo'}
      </Link>

      <p className="mt-2 text-[13px] font-medium text-attention-900/70">
        Em emergência, siga sempre as orientações da Defesa Civil (199).
      </p>
    </Card>
  )
}
