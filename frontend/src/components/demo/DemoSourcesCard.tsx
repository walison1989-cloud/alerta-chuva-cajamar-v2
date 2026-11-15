import { ExternalLink, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { OFFICIAL_LINKS, SOURCE_OPEN_METEO } from '@/config/app'

type SourceStatus = 'Real' | 'Simulado' | 'Sem escrita' | 'Externo'

const STATUS_TONE: Record<SourceStatus, 'safe' | 'attention' | 'neutral'> = {
  Real: 'safe',
  Simulado: 'attention',
  'Sem escrita': 'neutral',
  Externo: 'neutral',
}

interface SourceRow {
  label: string
  role: string
  status: SourceStatus
  href?: string
}

const ROWS: readonly SourceRow[] = [
  {
    label: 'Open-Meteo',
    role: 'Condição atual e previsão exibidas nesta página',
    status: 'Real',
    href: SOURCE_OPEN_METEO.href,
  },
  {
    label: 'OpenStreetMap',
    role: 'Mapa base interativo de Cajamar',
    status: 'Real',
    href: 'https://www.openstreetmap.org/copyright',
  },
  {
    label: 'Simulador local',
    role: 'Cenários, controles e indicadores desta página',
    status: 'Simulado',
  },
  {
    label: 'Supabase',
    role: 'Não é acessado pela demonstração',
    status: 'Sem escrita',
  },
  {
    label: 'CEMADEN / Defesa Civil',
    role: 'Não integrados; nenhum alerta é emitido aqui',
    status: 'Externo',
    href: OFFICIAL_LINKS.find((link) => link.label === 'CEMADEN')?.href,
  },
]

export function DemoSourcesCard() {
  return (
    <Card className="p-5" aria-labelledby="fontes-demonstracao">
      <header className="flex items-start gap-3">
        <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="fontes-demonstracao"
            className="text-base font-bold tracking-tight text-slate-900"
          >
            Fontes desta página
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Separação explícita entre dado real e simulação
          </p>
        </div>
      </header>

      <ul className="mt-4 space-y-2">
        {ROWS.map((row) => {
          const content = (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">
                  {row.label}
                </p>
                <p className="text-xs leading-snug text-slate-500">
                  {row.role}
                </p>
              </div>
              <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
              {row.href ? (
                <ExternalLink
                  className="h-3 w-3 text-slate-300"
                  aria-hidden="true"
                />
              ) : null}
            </>
          )

          return (
            <li key={row.label}>
              {row.href ? (
                <a
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 transition hover:border-brand-200 hover:bg-brand-50/60"
                >
                  {content}
                </a>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        A página de demonstração faz apenas leitura da Open-Meteo e dos tiles do
        OpenStreetMap. Não grava no banco, não envia e-mail, não usa Supabase e
        não dispara notificações.
      </p>
    </Card>
  )
}
