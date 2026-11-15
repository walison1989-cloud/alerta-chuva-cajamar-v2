import { Clock, History, Info } from 'lucide-react'
import { AvaliacaoNivelBadge } from '@/components/avaliacao/AvaliacaoNivelBadge'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDateTime } from '@/lib/format'
import type { HistoricoAvaliacao } from '@/types/avaliacaoPreventiva'

function origemLabel(origem: HistoricoAvaliacao['origem']): string {
  return origem === 'imovel' ? 'Imóvel' : 'Região'
}

interface AvaliacaoHistoricoCardProps {
  historico: HistoricoAvaliacao[]
  isLoading: boolean
  error: string | null
}

/**
 * Histórico declarado pelo próprio usuário. Cada linha é um cálculo do cliente, com a
 * versão da regra e do motor usadas naquele momento.
 */
export function AvaliacaoHistoricoCard({
  historico,
  isLoading,
  error,
}: AvaliacaoHistoricoCardProps) {
  return (
    <Card className="p-5" aria-labelledby="historico-analise-preventiva">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <h2
              id="historico-analise-preventiva"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Histórico de avaliações registradas
            </h2>
            <p className="text-[13px] text-slate-500">
              Registros pessoais calculados no navegador; não validados pelo servidor
            </p>
          </div>
        </div>
        <Badge tone="neutral">{historico.length} registro(s)</Badge>
      </header>

      {error ? (
        <p
          className="mt-3 rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="mt-3 space-y-2" aria-label="Carregando histórico">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}

      {!isLoading && !error && historico.length === 0 ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Nenhuma avaliação registrada. A prévia na tela não é salva
          automaticamente; use o botão de registro para criar o histórico
          pessoal experimental.
        </p>
      ) : null}

      {historico.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {historico.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <AvaliacaoNivelBadge nivel={item.nivel} />
                <span className="text-xs font-semibold text-slate-500">
                  {origemLabel(item.origem)}
                  {item.bairro ? ` · ${item.bairro}` : ''}
                  {!item.bairro && item.municipio
                    ? ` · ${item.municipio}`
                    : ''}
                </span>
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {formatDateTime(item.iniciadaEm)}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                {item.resumo}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Regra {item.regraVersao} · motor {item.motorVersao} ·{' '}
                {item.totalEvidencias} evidência(s) · nível {item.nivelOrdem}/3
              </p>
              {item.dadosAusentes.length > 0 ? (
                <p className="mt-1 text-xs font-semibold text-attention-700">
                  {item.dadosAusentes.length} dado(s) ausente(s) nesta execução
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
