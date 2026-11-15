import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

export function PrivacyCard() {
  return (
    <Card className="p-5" aria-labelledby="privacidade">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="privacidade"
              className="text-base font-bold tracking-tight text-slate-900"
            >
              Privacidade e LGPD
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Dados pessoais desde o início
            </p>
          </div>
        </div>
        <Badge tone="safe">LGPD</Badge>
      </header>

      <div className="mt-4 space-y-2.5 text-xs leading-relaxed text-slate-600">
        <p className="flex items-start gap-2">
          <LockKeyhole
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          O e-mail e o endereço só são coletados depois do cadastro, com
          consentimento explícito e finalidade informada.
        </p>
        <p className="flex items-start gap-2">
          <LockKeyhole
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          Cada morador acessa apenas o próprio endereço. As políticas RLS do
          Supabase impedem leitura pública dos dados particulares.
        </p>
        <p className="flex items-start gap-2">
          <LockKeyhole
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          Correção e exclusão podem ser solicitadas pelos canais do projeto.
          Nenhum dado é vendido ou usado para rastreamento em segundo plano.
        </p>
      </div>
    </Card>
  )
}
