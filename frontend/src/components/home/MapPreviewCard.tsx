import { ArrowRight, Map, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CajamarMap } from '@/components/map/CajamarMap'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

export function MapPreviewCard() {
  return (
    <Card className="overflow-hidden" aria-labelledby="mapa-cajamar">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
            <Map className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="mapa-cajamar"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Mapa de Cajamar
              </h2>
              <Badge tone="brand">Medição</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Estações, chuva observada e camadas PostGIS
            </p>
          </div>
        </div>
        <Link
          to="/mapa"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
        >
          Abrir mapa
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="relative">
        <CajamarMap className="h-60 sm:h-72" />
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-sm ring-1 ring-slate-200/70 backdrop-blur">
          <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-bold text-slate-800">Cajamar, SP</p>
            <p className="text-xs text-slate-500">Centro de referência</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-[13px] text-slate-500">
        <span>
          Mapa base © OpenStreetMap. Estações oficiais, chuva observada e
          ocorrências verificadas estão no mapa interativo.
        </span>
        <Link
          to="/mapa"
          className="font-semibold text-brand-700 transition hover:text-brand-900"
        >
          Ver estações e camadas
        </Link>
      </div>
    </Card>
  )
}
