import { AlertTriangle, MapPin, Radio } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { formatDateTime, formatMm } from '@/lib/format'
import type { LeituraTriangulada } from '@/lib/triangulacaoChuva'

interface Props {
  leitura: LeituraTriangulada
  isLoading: boolean
  error: string | null
}

export function TriangulacaoChuvaCard({ leitura, isLoading, error }: Props) {
  const supported = leitura.suporteEspacial && leitura.chuvaObservadaMm !== null
  const tone = supported ? 'safe' : 'attention'
  const label = supported
    ? leitura.metodo === 'direta' ? 'Medição próxima do imóvel' : 'Três estações ao redor'
    : 'Cobertura insuficiente'

  return (
    <Card className="p-5" aria-labelledby="triangulacao-chuva">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <h2 id="triangulacao-chuva" className="text-base font-bold text-slate-900">Chuva estimada entre estações</h2>
            <p className="text-sm text-slate-500">Verificação espacial complementar ao resultado principal</p>
          </div>
        </div>
        <Badge tone={tone}>{isLoading ? 'Consultando estações…' : label}</Badge>
      </header>

      {error ? (
        <p className="mt-3 rounded-xl bg-attention-50 px-3 py-2 text-sm text-attention-900">{error}</p>
      ) : null}

      {!isLoading && !error ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Chuva observada estimada</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{leitura.chuvaObservadaMm === null ? '—' : formatMm(leitura.chuvaObservadaMm)}</p>
              <p className="text-xs text-slate-500">{leitura.metodo === 'direta' ? '24 h anteriores · medição próxima' : '24 h anteriores · triângulo de estações'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Estações consideradas</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{leitura.estacoes.length}</p>
              <p className="text-xs text-slate-500">CEMADEN · {leitura.metodo === 'direta' ? 'medição local' : 'três estações, se disponíveis'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Previsão próximas 24 h</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{leitura.chuvaFuturaMm === null ? '—' : formatMm(leitura.chuvaFuturaMm)}</p>
              <p className="text-xs text-slate-500">Open-Meteo · não somada à observada</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
            <p className="font-semibold">{leitura.justificativa}</p>
            <p className="mt-1 text-xs text-slate-600">{leitura.motivo}</p>
            {!supported && leitura.chuvaObservadaMm !== null ? (
              <p className="mt-1 text-xs text-attention-800">A interpolação aparece como referência, mas não participa da classificação porque não há triângulo envolvendo o ponto.</p>
            ) : null}
          </div>

          {leitura.estacoes.length > 0 ? (
            <details className="group mt-3 rounded-xl border border-slate-200 bg-white px-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
                Ver estações usadas <span className="font-normal text-slate-500">· {leitura.estacoes.length}</span>
                <MapPin className="h-4 w-4 text-brand-600" aria-hidden="true" />
              </summary>
              <ul className="grid gap-2 pb-3 sm:grid-cols-2" aria-label="Estações usadas na interpolação">
                {leitura.estacoes.map((station) => (
                  <li key={station.codigo} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                    <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{station.nome}</span><span className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" aria-hidden="true" />{station.distanciaKm.toFixed(1)} km · peso {(station.peso * 100).toFixed(0)}%</span></span>
                    <span className="shrink-0 text-right"><span className="block font-bold text-slate-800">{formatMm(station.chuvaMm)}</span><span className="text-xs text-slate-500">{formatDateTime(station.dataHora)}</span></span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-slate-600">Carregando estações e validando se elas cercam o ponto no mapa…</p>
      ) : null}

      <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-attention-50 px-3 py-2 text-xs leading-relaxed text-attention-950">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Interpolação triangular e regras experimentais, sem calibração local. Não é probabilidade nem alerta de alagamento; não envia avisos. Versão {leitura.motorVersao}.</span>
      </p>
    </Card>
  )
}
