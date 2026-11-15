import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { PROJECT_STAGE } from '@/config/app'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

interface StagePageProps {
  title: string
  description: string
  stage: number
  icon: LucideIcon
  scope: string[]
  note: string
}

export function StagePage({
  title,
  description,
  stage,
  icon: Icon,
  scope,
  note,
}: StagePageProps) {
  useDocumentTitle(title)

  return (
    <div className="mx-auto max-w-3xl">
      <Badge tone="brand">
        Etapa {stage} de {PROJECT_STAGE.total}
      </Badge>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>

      <Card className="mt-5 p-5 sm:p-6" aria-labelledby="planejamento-tela">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-brand-50 p-3 text-brand-700">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="planejamento-tela"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Planejado para a Etapa {stage}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Esta tela ainda não coleta nem grava dados.
              </p>
            </div>
          </div>
          <Badge tone="attention">Em construção</Badge>
        </div>

        <h3 className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          O que esta tela terá
        </h3>
        <ul className="mt-2 space-y-2">
          {scope.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-sm leading-relaxed text-slate-600"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-2xl border border-attention-200 bg-attention-50 p-4">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-attention-900">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {note}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/" className={buttonStyles('secondary')}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao início
          </Link>
          <Link to="/mapa" className={buttonStyles('ghost')}>
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Ver mapa base
          </Link>
        </div>
      </Card>

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 text-xs leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-700">
          Já entregue até a Privado
        </p>
        <p className="mt-1">
          Estrutura React + TypeScript + Vite, Tailwind, rotas, layout
          responsivo, PWA instalável, consulta real à Open-Meteo, mapa base com
          OpenStreetMap e estados explícitos de indisponibilidade. Na Etapa 2,
          entraram autenticação Supabase, rotas protegidas, cadastro de
          endereço com ViaCEP, geocodificação aproximada, ajuste no mapa e
          histórico de versões. A Medição trouxe a camada do CEMADEN e as
          consultas PostGIS. A Etapa 4 concluiu a localização confirmada do
          imóvel, as estações mais próximas e o painel personalizado da página
          inicial.
        </p>
      </div>
    </div>
  )
}
