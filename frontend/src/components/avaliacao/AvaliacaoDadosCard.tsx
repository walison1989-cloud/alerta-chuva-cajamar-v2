import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Database,
  Info,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/lib/format'
import { formatIdadeHoras } from '@/lib/avaliacaoPreventiva'
import type {
  DadoAusente,
  DadoDesatualizado,
  PacoteEvidencias,
  ResultadoAvaliacao,
} from '@/types/avaliacaoPreventiva'

function desatualizadoDescricao(item: DadoDesatualizado): string {
  const idade =
    item.idadeHoras === null
      ? null
      : `idade de ${formatIdadeHoras(item.idadeHoras)}`
  const limite =
    item.limiteHoras === null
      ? null
      : `limite de ${formatIdadeHoras(item.limiteHoras)}`
  const referencia = item.referenciaEm
    ? `referência em ${formatDateTime(item.referenciaEm)}`
    : null
  const detalhes = [idade, limite, referencia].filter(Boolean).join(' · ')
  return detalhes.length > 0 ? `${item.descricao} (${detalhes})` : item.descricao
}

interface ListaProps<T extends DadoAusente | DadoDesatualizado> {
  itens: T[]
  vazio: string
  tone: 'safe' | 'attention'
  descricao: (item: T) => string
}

function ListaDados<T extends DadoAusente | DadoDesatualizado>({
  itens,
  vazio,
  tone,
  descricao,
}: ListaProps<T>) {
  if (itens.length === 0) {
    return (
      <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-emerald-50 px-2.5 py-2 text-xs leading-relaxed text-emerald-900">
        <CheckCircle2
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        />
        {vazio}
      </p>
    )
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {itens.map((item, index) => (
        <li
          key={`${item.codigo}-${index}`}
          className={
            tone === 'attention'
              ? 'flex items-start gap-1.5 rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900'
              : 'flex items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600'
          }
        >
          <AlertTriangle
            className="mt-0.5 h-3 w-3 shrink-0"
            aria-hidden="true"
          />
          <span>
            {descricao(item)}
            {item.fonte ? (
              <span className="ml-1 font-semibold opacity-70">
                ({item.fonte})
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface AvaliacaoDadosCardProps {
  resultado: ResultadoAvaliacao | null
  evidencias: PacoteEvidencias | null
}

/**
 * Situação dos dados: o que faltou, o que está desatualizado e como está a
 * coleta CEMADEN. É a seção que sustenta o rótulo "Dados insuficientes".
 */
export function AvaliacaoDadosCard({
  resultado,
  evidencias,
}: AvaliacaoDadosCardProps) {
  const coleta = evidencias?.coleta ?? null
  const resumo = evidencias?.resumoChuva ?? null
  const ausentes = resultado?.dadosAusentes ?? []
  const desatualizados = resultado?.dadosDesatualizados ?? []
  const insuficiente = resultado?.nivel === 'dados_insuficientes'

  return (
    <Card className="p-5" aria-labelledby="situacao-dados-avaliacao">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <h2
              id="situacao-dados-avaliacao"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Situação dos dados
            </h2>
            <p className="text-[13px] text-slate-500">
              Frescor, ausências e coleta da fonte
            </p>
          </div>
        </div>
        <Badge tone={insuficiente ? 'attention' : 'neutral'}>
          {insuficiente ? 'Base incompleta' : 'Base mínima'}
        </Badge>
      </header>

      {insuficiente ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900">
          <CircleSlash
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            A regra não foi aplicada porque faltam dados obrigatórios. Isso é
            diferente de afirmar que não há risco.
          </span>
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-50 px-2.5 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Estações
          </p>
          <p className="mt-0.5 text-base font-bold leading-none text-slate-900">
            {resumo?.totalEstacoes ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">no raio</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-2.5 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Com leitura
          </p>
          <p className="mt-0.5 text-base font-bold leading-none text-slate-900">
            {resumo?.comLeitura ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">24 h</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-2.5 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Frescas
          </p>
          <p className="mt-0.5 text-base font-bold leading-none text-slate-900">
            {resumo?.frescas ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">dentro do limite</p>
        </div>
      </div>

      <section className="mt-4" aria-labelledby="dados-ausentes">
        <p
          id="dados-ausentes"
          className="text-xs font-bold uppercase tracking-wide text-slate-500"
        >
          Dados ausentes
        </p>
        <ListaDados
          itens={ausentes}
          vazio="Nenhum dado obrigatório ausente nesta execução."
          tone="attention"
          descricao={(item) => item.descricao}
        />
      </section>

      <section className="mt-3" aria-labelledby="dados-desatualizados">
        <p
          id="dados-desatualizados"
          className="text-xs font-bold uppercase tracking-wide text-slate-500"
        >
          Dados desatualizados
        </p>
        <ListaDados
          itens={desatualizados}
          vazio="Nenhuma fonte obrigatória está desatualizada."
          tone="attention"
          descricao={desatualizadoDescricao}
        />
      </section>

      <section className="mt-3 border-t border-slate-200 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Coleta CEMADEN
        </p>
        {coleta ? (
          <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-slate-600">
            <p>
              Status:{' '}
              <span className="font-semibold text-slate-800">
                {coleta.status ?? 'não informado'}
              </span>
              {coleta.idadePayloadHoras !== null
                ? ` · arquivo atualizado há ${formatIdadeHoras(
                    coleta.idadePayloadHoras,
                  )}`
                : ''}
            </p>
            <p>
              Último sucesso: {formatDateTime(coleta.ultimoSucessoEm)} · última
              tentativa: {formatDateTime(coleta.ultimaTentativaEm)}
            </p>
            {coleta.mensagemPublica ? (
              <p className="text-slate-500">{coleta.mensagemPublica}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Sem registro público da coleta mais recente. A análise ainda pode
            usar as medições disponíveis.
          </p>
        )}
      </section>
    </Card>
  )
}
