import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { MAIN_NAV } from '@/config/navigation'

const ACTIONS = MAIN_NAV.filter((item) => item.to !== '/')

export function QuickActionsCard() {
  return (
    <Card className="p-5" aria-labelledby="acesso-rapido">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="acesso-rapido"
          className="text-base font-bold tracking-tight text-slate-900"
        >
          Acesso rápido
        </h2>
        <Badge tone="brand">Acesso</Badge>
      </div>

      <div className="mt-4 grid gap-2">
        {ACTIONS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex min-h-14 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/70"
          >
            <span className="rounded-xl bg-white p-2 text-brand-700 ring-1 ring-slate-200/70 transition group-hover:ring-brand-200">
              <item.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="truncate text-[13px] text-slate-500">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">
                Etapa {item.stage}
              </span>
              <ArrowUpRight
                className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-brand-600"
                aria-hidden="true"
              />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  )
}
