import { Info, MapPin, Mountain, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import {
  SUSCETIBILIDADE_FONTE,
  SUSCETIBILIDADE_META,
  SUSCETIBILIDADE_NOTA,
  describeTipoSuscetibilidade,
  formatAreaSuscetibilidade,
  formatDistanciaSuscetibilidade,
} from '@/lib/suscetibilidade'
import type {
  AreaSuscetibilidadeProxima,
  CartografiaSuscetibilidade,
  SuscetibilidadeFeature,
} from '@/types/suscetibilidade'

interface SuscetibilidadeCardProps {
  cartografia: CartografiaSuscetibilidade | null
  features: SuscetibilidadeFeature[]
  areasImovel: AreaSuscetibilidadeProxima[]
  isLoading: boolean
  isAuthenticated: boolean
  hasAddress: boolean
  error: string | null
}

function areaContida(areas: AreaSuscetibilidadeProxima[]) {
  return areas.filter((area) => area.contemPonto)
}

/**
 * Cartão da carta oficial de suscetibilidade. Mostra a proveniência e a
 * relação do imóvel com os polígonos, sem revelar coordenadas e sem
 * transformar suscetibilidade em previsão de alagamento.
 */
export function SuscetibilidadeCard({
  cartografia,
  features,
  areasImovel,
  isLoading,
  isAuthenticated,
  hasAddress,
  error,
}: SuscetibilidadeCardProps) {
  const inundacao = features.filter((feature) => feature.tipo === 'inundacao')
  const enxurrada = features.filter((feature) => feature.tipo === 'enxurrada')
  const contidas = areaContida(areasImovel)
  const publicada = Boolean(cartografia) || features.length > 0

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mountain className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            Suscetibilidade oficial
          </h2>
        </div>
        <Badge tone="neutral">{SUSCETIBILIDADE_FONTE.label}</Badge>
      </header>

      {error ? (
        <p className="flex items-start gap-1.5 rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-[13px] text-slate-500">
          Consultando a carta oficial de suscetibilidade…
        </p>
      ) : null}

      {!isLoading && !publicada && !error ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
          A carta oficial ainda não foi importada neste ambiente. Nenhuma
          geometria é desenhada sem a fonte publicada.
        </p>
      ) : null}

      {publicada ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 px-2.5 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Inundação
              </p>
              <p className="mt-0.5 text-base font-bold leading-none text-slate-900">
                {inundacao.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">polígonos</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2.5 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Enxurrada
              </p>
              <p className="mt-0.5 text-base font-bold leading-none text-slate-900">
                {enxurrada.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">polígonos</p>
            </div>
          </div>

          <ul className="flex flex-wrap gap-1.5">
            {Object.entries(SUSCETIBILIDADE_META).map(([classe, meta]) => {
              const total = features.filter(
                (feature) => feature.classe === classe,
              ).length
              if (total === 0) return null
              return (
                <li
                  key={classe}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden="true"
                  />
                  {meta.label}: {total}
                </li>
              )
            })}
          </ul>

          <p className="text-xs leading-relaxed text-slate-500">
            {cartografia ? (
              <>
                Escala {cartografia.escala}. Publicação{' '}
                {cartografia.anoPublicacao ?? SUSCETIBILIDADE_FONTE.ano}.
                Licença: {cartografia.licenca ?? 'acesso aberto'}.
              </>
            ) : (
              <>
                Escala {SUSCETIBILIDADE_FONTE.escala}. Publicação{' '}
                {SUSCETIBILIDADE_FONTE.ano}.
              </>
            )}{' '}
            <a
              href={cartografia?.urlItem ?? SUSCETIBILIDADE_FONTE.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              Ver fonte no Rigeo/SGB
            </a>
            .
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          No seu imóvel
        </p>

        {!isAuthenticated ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Entre na sua conta e cadastre o imóvel para comparar o ponto privado
            com as áreas oficiais.
          </p>
        ) : !hasAddress ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Cadastre ou confirme o endereço do imóvel para consultar as áreas
            oficiais próximas.
          </p>
        ) : areasImovel.length === 0 ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Nenhuma área oficial de inundação ou enxurrada mapeada no entorno de
            500 m do imóvel. A ausência de polígono na carta não significa
            ausência de risco.
          </p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {contidas.length > 0 ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-attention-50 px-2 py-1.5 text-xs leading-relaxed text-attention-900">
                <ShieldAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  O ponto cadastrado está dentro de{' '}
                  {contidas.length === 1
                    ? 'uma área oficial'
                    : `${contidas.length} áreas oficiais`}{' '}
                  de suscetibilidade. Leia a classe e a fonte antes de
                  interpretar.
                </span>
              </p>
            ) : null}

            <ul className="space-y-1">
              {areasImovel.slice(0, 6).map((area) => {
                const meta = SUSCETIBILIDADE_META[area.classe]
                return (
                  <li
                    key={area.id}
                    className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
                  >
                    <span className="flex min-w-0 items-start gap-1.5">
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-800">
                          {describeTipoSuscetibilidade(area.tipo)} ·{' '}
                          {meta.label}
                        </span>
                        <span className="block text-xs leading-snug text-slate-500">
                          {area.contemPonto
                            ? 'O imóvel está nesta área'
                            : `A ${formatDistanciaSuscetibilidade(area.distanciaM)} do imóvel`}{' '}
                          · {formatAreaSuscetibilidade(area.areaHa)}
                        </span>
                      </span>
                    </span>
                    {area.contemPonto ? (
                      <Badge tone="attention">No ponto</Badge>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {areasImovel.length > 6 ? (
              <p className="text-xs text-slate-500">
                Mostrando 6 de {areasImovel.length} áreas no raio consultado.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 rounded-xl bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{SUSCETIBILIDADE_NOTA}</span>
      </p>
    </div>
  )
}
