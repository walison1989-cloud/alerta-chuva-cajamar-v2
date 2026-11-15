import { ChevronRight, ExternalLink, Landmark, Phone, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import {
  EMERGENCY_NUMBERS,
  LEGAL_DISCLAIMER,
  OFFICIAL_LINKS,
} from '@/config/app'

export function OfficialAlertsCard() {
  return (
    <Card className="p-5" aria-labelledby="avisos-oficiais">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
            <Landmark className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="avisos-oficiais"
              className="text-base font-bold tracking-tight text-slate-900"
            >
              Avisos oficiais
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Canais verificados fora do aplicativo
            </p>
          </div>
        </div>
        <Badge tone="neutral">Sem canal integrado</Badge>
      </header>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-alert-50 p-3 ring-1 ring-alert-100">
        <ShieldAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-alert-700"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-alert-900">
          Este aplicativo não emite alertas oficiais nesta etapa. Não trate as
          informações exibidas aqui como substituição a um aviso da Defesa
          Civil.
        </p>
      </div>

      <ul className="mt-3 divide-y divide-slate-100">
        {OFFICIAL_LINKS.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center gap-3 rounded-xl px-1 py-2 transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {link.label}
                </p>
                <p className="truncate text-[13px] text-slate-500">
                  {link.description}
                </p>
              </div>
              <ChevronRight
                className="h-4 w-4 text-slate-300"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {EMERGENCY_NUMBERS.map((emergency) => (
          <a
            key={emergency.number}
            href={emergency.href}
            aria-label={`${emergency.label}: ${emergency.number}`}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-alert-600 px-3 text-white transition hover:bg-alert-700"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold">{emergency.label}</span>
            <span className="ml-auto text-base font-bold">
              {emergency.number}
            </span>
          </a>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {LEGAL_DISCLAIMER}
      </p>
    </Card>
  )
}
