import { BookOpenCheck, ExternalLink, Info, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { SOURCE_CEMADEN, SOURCE_OPEN_METEO } from '@/config/app'
import { SUSCETIBILIDADE_FONTE } from '@/lib/suscetibilidade'
import type { RegraAvaliacaoPublica } from '@/types/avaliacaoPreventiva'

const ORIENTACOES = [
  'Leia o nível como sinal ordinal da regra experimental, nunca como probabilidade de alagamento.',
  'Chuva observada é medição das estações; previsão é modelo. As duas aparecem separadas e não se substituem.',
  'Suscetibilidade cartográfica descreve o terreno e não reage à chuva do momento.',
  'Dados insuficientes ou desatualizados impedem a classificação. Isso não é atestado de segurança.',
  'Sem sinal experimental também não significa ausência de risco; a regra ainda não foi calibrada hidrologicamente.',
]

function FonteLink({
  href,
  children,
}: {
  href: string
  children: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}

interface AvaliacaoInterpretacaoCardProps {
  regra: RegraAvaliacaoPublica | null
  limitacoes: string[]
}

/**
 * Orientação de leitura, limitações e fontes. Esta seção existe para impedir
 * que o resultado experimental seja confundido com alerta oficial.
 */
export function AvaliacaoInterpretacaoCard({
  regra,
  limitacoes,
}: AvaliacaoInterpretacaoCardProps) {
  const limitacoesVersao =
    limitacoes.length > 0 ? limitacoes : regra?.parametros.limitacoes ?? []

  return (
    <Card
      className="border-brand-200/70 bg-brand-50/40 p-5"
      aria-labelledby="interpretacao-analise-preventiva"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpenCheck
            className="h-4 w-4 text-brand-700"
            aria-hidden="true"
          />
          <div>
            <h2
              id="interpretacao-analise-preventiva"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Como interpretar
            </h2>
            <p className="text-[13px] text-slate-500">
              Limites desta versão experimental
            </p>
          </div>
        </div>
        <Badge tone="neutral">Não oficial</Badge>
      </header>

      <ul className="mt-3 space-y-1.5">
        {ORIENTACOES.map((orientacao) => (
          <li
            key={orientacao}
            className="flex items-start gap-1.5 text-[13px] leading-relaxed text-slate-700"
          >
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            {orientacao}
          </li>
        ))}
      </ul>

      {limitacoesVersao.length > 0 ? (
        <section className="mt-3 border-t border-brand-200/70 pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Limitações declaradas pela regra{' '}
            {regra ? `· ${regra.versao}` : ''}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
            {limitacoesVersao.map((limitacao) => (
              <li key={limitacao}>{limitacao}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-3 border-t border-brand-200/70 pt-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Fontes
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          <FonteLink href={SOURCE_CEMADEN.href}>CEMADEN</FonteLink> para chuva
          observada · <FonteLink href={SUSCETIBILIDADE_FONTE.href}>SGB/CPRM + IPT</FonteLink>{' '}
          para suscetibilidade ·{' '}
          <FonteLink href={SOURCE_OPEN_METEO.href}>Open-Meteo</FonteLink> para
          previsão.
        </p>
      </section>

      <p className="mt-3 flex items-start gap-2 rounded-2xl border border-alert-100 bg-white/80 px-3 py-2.5 text-xs font-semibold leading-relaxed text-alert-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros). Siga sempre
        os canais oficiais.
      </p>
    </Card>
  )
}
