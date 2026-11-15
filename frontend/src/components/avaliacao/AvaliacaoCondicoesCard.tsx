import {
  AlertTriangle,
  Clock,
  CloudRain,
  CloudSun,
  Info,
  MapPin,
  Mountain,
  Radio,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { formatDateTime, formatMm, formatPercent } from '@/lib/format'
import {
  formatDistanciaKmAvaliacao,
  formatIdadeHoras,
  formatMetrosAvaliacao,
} from '@/lib/avaliacaoPreventiva'
import { SUSCETIBILIDADE_META } from '@/lib/suscetibilidade'
import type {
  PacoteEvidencias,
  PrevisaoResumo,
  ResultadoAvaliacao,
} from '@/types/avaliacaoPreventiva'
import type { SuscetibilidadeClasse } from '@/types/suscetibilidade'

const TIPO_LABEL: Record<string, string> = {
  inundacao: 'inundação',
  enxurrada: 'enxurrada',
}

interface AvaliacaoCondicoesCardProps {
  evidencias: PacoteEvidencias | null
  previsao: PrevisaoResumo | null
  previsaoEmCache: boolean
  resultado: ResultadoAvaliacao | null
}

/**
 * Separa visualmente as três dimensões. A carta de suscetibilidade é
 * característica do terreno, a chuva observada é medição e a previsão é
 * modelo: nenhuma delas é probabilidade de alagamento.
 */
export function AvaliacaoCondicoesCard({
  evidencias,
  previsao,
  previsaoEmCache,
  resultado,
}: AvaliacaoCondicoesCardProps) {
  const cartografia = evidencias?.cartografia ?? null
  const area = resultado?.areaPrincipal ?? null
  const areaMeta = area
    ? SUSCETIBILIDADE_META[area.classe as SuscetibilidadeClasse]
    : null
  const estacao = resultado?.estacaoReferencia ?? null
  const resumo = evidencias?.resumoChuva ?? null
  const previsaoDisponivel =
    previsao !== null &&
    previsao.precipMm24h !== null &&
    Number.isFinite(previsao.precipMm24h)

  return (
    <Card className="p-5" aria-labelledby="condicoes-analise-preventiva">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CloudRain className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <h2
              id="condicoes-analise-preventiva"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Condições consideradas
            </h2>
            <p className="text-[13px] text-slate-500">
              Cada dimensão mantém sua origem e seu significado
            </p>
          </div>
        </div>
        <Badge tone="neutral">3 fontes separadas</Badge>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <section
          className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
          aria-labelledby="condicao-suscetibilidade"
        >
          <div className="flex items-center justify-between gap-2">
            <p
              id="condicao-suscetibilidade"
              className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-slate-500"
            >
              <Mountain className="h-3.5 w-3.5" aria-hidden="true" />
              Suscetibilidade
            </p>
            <Badge tone="neutral">Carta oficial</Badge>
          </div>

          {area && areaMeta ? (
            <div className="mt-2">
              <p className="flex items-center gap-1.5 text-lg font-bold text-slate-900">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: area.contemPonto ? areaMeta.color : '#64748b' }}
                  aria-hidden="true"
                />
                {area.contemPonto ? areaMeta.label : 'Somente área vizinha'}
              </p>
              <p className="mt-0.5 text-[13px] text-slate-600">
                {TIPO_LABEL[area.tipo] ?? area.tipo} ·{' '}
                {area.contemPonto
                  ? 'ponto contido na área'
                  : `a ${formatMetrosAvaliacao(area.distanciaM)} do ponto`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {area.contemPonto
                  ? `${areaMeta.description} A carta não comprova sozinha a exposição do lote.`
                  : 'A classe exibida é da área vizinha, NÃO do imóvel. Altimetria e conectividade precisam ser verificadas.'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
              {cartografia
                ? 'Nenhuma área oficial mapeada no raio consultado.'
                : 'Carta oficial não publicada ou indisponível.'}
            </p>
          )}

          <p className="mt-2 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-500">
            {cartografia
              ? `${cartografia.fonte} · escala ${cartografia.escala}${
                  cartografia.anoPublicacao
                    ? ` · ${cartografia.anoPublicacao}`
                    : ''
                }. A carta não reage à chuva do momento.`
              : 'Sem a carta, a suscetibilidade não entra na classificação.'}
          </p>
        </section>

        <section
          className="rounded-2xl border border-brand-200/80 bg-brand-50/50 p-3"
          aria-labelledby="condicao-chuva-observada"
        >
          <div className="flex items-center justify-between gap-2">
            <p
              id="condicao-chuva-observada"
              className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-brand-800"
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              Chuva observada
            </p>
            <Badge tone={estacao ? 'safe' : 'attention'}>
              {estacao ? 'Medição fresca' : 'Sem leitura fresca'}
            </Badge>
          </div>

          {estacao ? (
            <div className="mt-2">
              <p className="text-lg font-bold text-brand-950">
                {formatMm(estacao.chuva24hMm ?? 0)}
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-brand-900">
                {estacao.nome}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-brand-900/80">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {formatDistanciaKmAvaliacao(estacao.distanciaKm)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {formatDateTime(estacao.dataHora)}
                </span>
              </p>
              {estacao.idadeHoras !== null ? (
                <p className="mt-1 text-xs text-brand-900/70">
                  Idade da leitura: {formatIdadeHoras(estacao.idadeHoras)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-brand-900/80">
              Não há estação com acumulado de 24 h dentro do limite de frescor
              desta regra. A ausência de leitura não é ausência de chuva.
            </p>
          )}

          <div className="mt-2 border-t border-brand-200/70 pt-2 text-xs leading-relaxed text-brand-900/70">
            <p>
              Estações no raio: {resumo?.totalEstacoes ?? 0} · com leitura:{' '}
              {resumo?.comLeitura ?? 0} · frescas: {resumo?.frescas ?? 0}
            </p>
            {resumo?.max24hMm !== null && resumo?.max24hMm !== undefined ? (
              <p className="mt-0.5">
                Máximo no raio: {formatMm(resumo.max24hMm)}. Acumulado de 24 h
                não é intensidade mm/h.
              </p>
            ) : null}
          </div>
        </section>

        <section
          className="rounded-2xl border border-attention-200 bg-attention-50/60 p-3"
          aria-labelledby="condicao-previsao"
        >
          <div className="flex items-center justify-between gap-2">
            <p
              id="condicao-previsao"
              className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-attention-800"
            >
              <CloudSun className="h-3.5 w-3.5" aria-hidden="true" />
              Previsão 24 h
            </p>
            <Badge tone="attention">Modelo</Badge>
          </div>

          {previsaoDisponivel && previsao ? (
            <div className="mt-2">
              <p className="text-lg font-bold text-attention-950">
                {formatMm(previsao.precipMm24h ?? 0)}
              </p>
              <p className="mt-0.5 text-[13px] text-attention-900/80">
                Open-Meteo · próximas 24 h
              </p>
              <p className="mt-1 text-xs text-attention-900/80">
                Probabilidade máxima de precipitação:{' '}
                {previsao.probabilidadeMaxPct === null
                  ? 'não informada'
                  : formatPercent(previsao.probabilidadeMaxPct)}
                . Esse percentual é de chuva, não de alagamento.
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-attention-900/70">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Consultada em {formatDateTime(previsao.fetchedAt)}
              </p>
              {previsaoEmCache ? (
                <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-attention-900">
                  <Info
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  Valor vindo do cache local; confira a atualização.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-attention-900/80">
              Previsão indisponível ou desatualizada. A previsão não substitui
              a chuva observada.
            </p>
          )}

          <p className="mt-2 border-t border-attention-200/70 pt-2 text-xs leading-relaxed text-attention-900/70">
            Previsão é resultado de modelo meteorológico, não medição local.
          </p>
        </section>
      </div>

      <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
        <AlertTriangle
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
          aria-hidden="true"
        />
        <span className={cn('block')}>
          Suscetibilidade cartográfica descreve o terreno; avaliação
          meteorológica descreve o momento. As duas não formam um alerta
          oficial.
        </span>
      </p>
    </Card>
  )
}
