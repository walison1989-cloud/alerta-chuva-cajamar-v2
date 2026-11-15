import { Info, MapPinned, Mountain } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import {
  formatMetrosAvaliacao,
} from '@/lib/avaliacaoPreventiva'
import {
  formatAreaSuscetibilidade,
  SUSCETIBILIDADE_META,
} from '@/lib/suscetibilidade'
import type { PacoteEvidencias } from '@/types/avaliacaoPreventiva'
import type { SuscetibilidadeClasse } from '@/types/suscetibilidade'

const TIPO_LABEL: Record<string, string> = {
  inundacao: 'Inundação',
  enxurrada: 'Enxurrada',
}

interface AvaliacaoAreasCardProps {
  evidencias: PacoteEvidencias | null
}

/**
 * Áreas oficiais de suscetibilidade no raio. Mostrar a classe cartográfica
 * aqui não é afirmar risco atual: a carta é de 2017 e não reage à chuva.
 */
export function AvaliacaoAreasCard({ evidencias }: AvaliacaoAreasCardProps) {
  const areas = evidencias?.suscetibilidade ?? []
  const cartografia = evidencias?.cartografia ?? null

  return (
    <Card className="p-5" aria-labelledby="areas-analise-preventiva">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <h2
              id="areas-analise-preventiva"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Áreas de suscetibilidade no raio
            </h2>
            <p className="text-[13px] text-slate-500">
              Recorte da carta oficial, não avaliação meteorológica
            </p>
          </div>
        </div>
        <Badge tone="neutral">{areas.length} no raio</Badge>
      </header>

      {!cartografia ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          A carta oficial não está publicada neste ambiente. Nenhuma área é
          exibida e a suscetibilidade não entra na classificação.
        </p>
      ) : null}

      {cartografia && areas.length === 0 ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900">
          <Mountain className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Nenhuma área mapeada no raio consultado. A carta pode não cobrir o
          ponto, o que não significa ausência de risco.
        </p>
      ) : null}

      {areas.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {areas.slice(0, 10).map((area) => {
            const meta =
              SUSCETIBILIDADE_META[area.classe as SuscetibilidadeClasse]
            return (
              <li
                key={area.id}
                className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2"
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta?.color ?? '#94a3b8' }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800">
                    {TIPO_LABEL[area.tipo] ?? area.tipo} ·{' '}
                    {meta?.label ?? area.classe}
                    {area.contemPonto ? (
                      <span className="ml-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-700">
                        ponto contido
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {area.contemPonto
                      ? 'O ponto analisado está dentro do polígono'
                      : `A ${formatMetrosAvaliacao(area.distanciaM)} do ponto`}
                    {' · '}
                    {formatAreaSuscetibilidade(area.areaHa)}
                    {area.processo ? ` · ${area.processo}` : ''}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {areas.length > 10 ? (
        <p className="mt-2 text-xs text-slate-500">
          Exibindo as 10 primeiras de {areas.length} áreas no raio.
        </p>
      ) : null}

      {cartografia ? (
        <p className="mt-3 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-500">
          Fonte: {cartografia.fonte} · {cartografia.editor} · escala{' '}
          {cartografia.escala}
          {cartografia.anoPublicacao ? ` · ${cartografia.anoPublicacao}` : ''}.
          A carta descreve o terreno e não reage à chuva do momento.
        </p>
      ) : null}
    </Card>
  )
}
