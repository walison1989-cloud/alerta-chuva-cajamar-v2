import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Info,
  RefreshCw,
} from 'lucide-react'
import { AvaliacaoNivelBadge } from '@/components/avaliacao/AvaliacaoNivelBadge'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { AVALIACAO_NIVEL_META } from '@/lib/avaliacaoPreventiva'
import type {
  AvaliacaoNivel,
  AvaliacaoPreventiva,
  MotivoDimensao,
} from '@/types/avaliacaoPreventiva'

const PAINEL_POR_NIVEL: Record<AvaliacaoNivel, string> = {
  dados_insuficientes:
    'border-slate-200 bg-slate-50 text-slate-900',
  sem_sinal_experimental:
    'border-emerald-200 bg-emerald-50/70 text-emerald-950',
  atencao_experimental:
    'border-attention-200 bg-attention-50 text-attention-950',
  atencao_forte_experimental:
    'border-alert-200 bg-alert-50 text-alert-950',
}

const DIMENSOES: {
  chave: keyof AvaliacaoPreventiva['resultado']['dimensoes']
  label: string
  hint: string
}[] = [
  {
    chave: 'suscetibilidade',
    label: 'Suscetibilidade',
    hint: 'no ponto; 0 = sem interseção',
  },
  {
    chave: 'chuvaObservada',
    label: 'Chuva observada',
    hint: 'acumulado 24 h',
  },
  {
    chave: 'previsao',
    label: 'Previsão 24 h',
    hint: 'modelo',
  },
  {
    chave: 'chuvaCombinada',
    label: 'Maior magnitude',
    hint: 'observada ou prevista',
  },
]

const DIMENSAO_LABEL: Record<MotivoDimensao, string> = {
  localizacao: 'Localização',
  suscetibilidade: 'Suscetibilidade',
  chuva_observada: 'Chuva observada',
  previsao: 'Previsão',
  qualidade_dado: 'Qualidade do dado',
}

function origemLabel(origem: AvaliacaoPreventiva['origem']): string {
  return origem === 'imovel' ? 'Imóvel do morador' : 'Região de referência'
}

interface AvaliacaoResultadoCardProps {
  avaliacao: AvaliacaoPreventiva | null
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  isRefreshing?: boolean
}

/**
 * Resultado principal do motor experimental. O nível é ordinal (0 a 3) e não
 * é probabilidade: a interface nunca deve sugerir chance de alagamento.
 */
export function AvaliacaoResultadoCard({
  avaliacao,
  isLoading,
  error,
  onRefresh,
  isRefreshing = false,
}: AvaliacaoResultadoCardProps) {
  const resultado = avaliacao?.resultado ?? null
  const meta = resultado ? AVALIACAO_NIVEL_META[resultado.nivel] : null

  return (
    <Card className="p-5" aria-labelledby="resultado-analise-preventiva">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="resultado-analise-preventiva"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              Resultado da análise preventiva
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Regra publicada · classificação experimental, sem alerta oficial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="attention">Experimental</Badge>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Atualizar análise preventiva"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
              aria-hidden="true"
            />
            Atualizar
          </Button>
        </div>
      </header>

      {error ? (
        <p
          className="mt-4 flex items-start gap-2 rounded-2xl border border-alert-200 bg-alert-50 px-3 py-2.5 text-xs leading-relaxed text-alert-900"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </p>
      ) : null}

      {isLoading && !resultado ? (
        <div className="mt-4 space-y-2.5" aria-label="Calculando análise">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}

      {!isLoading && !resultado ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
          <Info className="mx-auto h-5 w-5 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-700">
            Ainda não há avaliação para exibir
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Verifique a conexão, o endereço cadastrado e se a regra experimental
            está publicada no Supabase. Nenhuma classificação é inventada quando
            falta base.
          </p>
        </div>
      ) : null}

      {resultado && meta ? (
        <div className="mt-4 space-y-4">
          <div
            className={cn(
              'rounded-2xl border px-4 py-4',
              PAINEL_POR_NIVEL[resultado.nivel],
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <AvaliacaoNivelBadge nivel={resultado.nivel} />
              <span className="text-[13px] font-semibold uppercase tracking-wide opacity-70">
                Nível {resultado.nivelOrdem} de 3 desta regra
              </span>
            </div>
            <h3 className="mt-2 text-lg font-bold tracking-tight">
              {resultado.titulo}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed">
              {resultado.resumo}
            </p>
            {resultado.diagnostico ? (
              <div className="mt-3 rounded-xl border border-current/15 bg-white/60 px-3 py-2 text-[13px] leading-relaxed">
                <p className="font-semibold">Exposição física: {resultado.diagnostico.exposicao === 'confirmada' ? 'confirmada por evidências' : resultado.diagnostico.exposicao === 'nao_confirmada' ? 'conexão fluvial não confirmada' : 'indeterminada'}</p>
                <p className="mt-1">{resultado.diagnostico.justificativa}</p>
                <p className="mt-1">Sinal meteorológico: {resultado.diagnostico.sinalMeteorologico === 'previsto' ? 'apenas previsão' : resultado.diagnostico.sinalMeteorologico === 'ambos' ? 'observado e previsto' : resultado.diagnostico.sinalMeteorologico === 'observado' ? 'chuva observada' : 'sem sinal relevante nas faixas'}.</p>
                {resultado.diagnostico.pico3hMm !== null ? <p className="mt-1">Maior acumulado previsto em 3 horas: {resultado.diagnostico.pico3hMm.toFixed(1).replace('.', ',')} mm (modelo).</p> : null}
              </div>
            ) : null}
            {resultado.nivel === 'dados_insuficientes' ? (
              <p className="mt-2 flex items-start gap-1.5 text-[13px] font-semibold">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Dados insuficientes não significam ausência de risco. Eles
                significam que esta regra não pode classificar o momento.
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide text-slate-500">
              Dimensões consideradas
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DIMENSOES.map((dimensao) => (
                <div
                  key={dimensao.chave}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-2"
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {dimensao.label}
                  </dt>
                  <dd className="mt-0.5 text-lg font-bold leading-none text-slate-900">
                    {resultado.dimensoes[dimensao.chave]}
                    <span className="ml-1 text-xs font-medium text-slate-500">
                      /3
                    </span>
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">
                    {dimensao.hint}
                  </p>
                </div>
              ))}
            </dl>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Níveis ordinais da regra experimental. Não são probabilidade, nota
              de risco nem previsão de alagamento.
            </p>
          </div>

          <div className="grid gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 sm:grid-cols-3">
            <p>
              <span className="font-semibold text-slate-700">Origem:</span>{' '}
              {origemLabel(avaliacao?.origem ?? 'regiao')}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Gerado em:</span>{' '}
              {formatDateTime(avaliacao?.geradoEm)}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Regra:</span>{' '}
              {avaliacao?.regra?.versao ?? 'não publicada'} · motor{' '}
              {avaliacao?.regra?.motorVersao ?? '—'}
            </p>
          </div>

          {resultado.motivos.length > 0 ? (
            <details className="group rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
              <summary className="group flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                Por que saiu este resultado <span className="font-normal text-slate-500">· {resultado.motivos.length} fatores</span>
                <span className="sr-only">Abrir explicação</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-brand-600 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="mt-2 space-y-1.5">
                {resultado.motivos.map((motivo, index) => (
                  <li
                    key={`${motivo.codigo}-${index}`}
                    className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] leading-relaxed text-slate-600"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="mr-1 font-semibold text-slate-800">
                        {DIMENSAO_LABEL[motivo.dimensao]}:
                      </span>
                      {motivo.descricao}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {resultado.areaNaoMapeada ? (
            <p className="flex items-start gap-2 rounded-2xl border border-attention-200 bg-attention-50 px-3 py-2.5 text-[13px] leading-relaxed text-attention-900">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Nenhuma área oficial de suscetibilidade foi encontrada no raio
                consultado. A carta pode não cobrir o ponto; isso não significa
                ausência de risco.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
