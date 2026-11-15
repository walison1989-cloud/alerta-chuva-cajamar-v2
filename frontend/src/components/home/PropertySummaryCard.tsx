import {
  CalendarClock,
  House,
  LocateFixed,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatAddressLabel } from '@/lib/addressFormat'
import {
  formatDateTimeShort,
  formatLatitude,
  formatLongitude,
} from '@/lib/format'
import type { AddressRecord } from '@/types/address'

function describePrecision(address: AddressRecord): string {
  if (address.precisao === 'geocodificado') {
    return address.geocoding_fonte?.includes('(exato)')
      ? 'Geocodificado (exato)'
      : 'Geocodificado (aproximado)'
  }
  if (address.geocoding_fonte?.startsWith('gps')) {
    return 'GPS do dispositivo'
  }
  return 'Ajustado manualmente'
}

interface PropertySummaryCardProps {
  address: AddressRecord | null
  addressError: string | null
  isLoading: boolean
}

export function PropertySummaryCard({
  address,
  addressError,
  isLoading,
}: PropertySummaryCardProps) {
  const latitude = address?.latitude ?? null
  const longitude = address?.longitude ?? null
  const hasCoordinates = latitude !== null && longitude !== null

  return (
    <Card className="p-5" aria-labelledby="meu-imovel-painel">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="rounded-2xl bg-emerald-50 p-2 text-emerald-700">
            <House className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="meu-imovel-painel"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Meu imóvel
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Endereço e localização confirmada
            </p>
          </div>
        </div>
        <Badge tone="safe">
          <LockKeyhole className="h-2.5 w-2.5" aria-hidden="true" />
          Privado
        </Badge>
      </header>

      {isLoading ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : !address ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Nenhum imóvel cadastrado
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Cadastre o endereço para ver a localização confirmada, a previsão da
            região e as estações pluviométricas mais próximas.
          </p>
          {addressError ? (
            <p className="mt-1 text-xs leading-relaxed text-alert-700">
              {addressError}
            </p>
          ) : null}
          <Link
            to="/meu-endereco"
            className={buttonStyles('primary', 'sm', 'mt-2 w-full')}
          >
            Cadastrar meu endereço
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="flex items-start gap-1.5 text-xs font-semibold text-slate-900">
            <MapPin
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
            <span>{formatAddressLabel(address)}</span>
          </p>

          {latitude !== null && longitude !== null ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
              <div className="grid grid-cols-2 gap-2 text-xs text-emerald-900">
                <div>
                  <p className="font-semibold uppercase tracking-wide text-emerald-700/80">
                    Latitude
                  </p>
                  <p className="font-bold">{formatLatitude(latitude)}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-emerald-700/80">
                    Longitude
                  </p>
                  <p className="font-bold">{formatLongitude(longitude)}</p>
                </div>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-emerald-800">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  Localização confirmada
                </span>
                <span>· {describePrecision(address)}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-800/80">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                Atualizado em {formatDateTimeShort(address.updated_at)}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-attention-200 bg-attention-50 p-2.5 text-xs leading-relaxed text-attention-900">
              O endereço não tem coordenadas confirmadas. Ajuste o ponto em
              “Meu endereço” para habilitar distâncias e previsão.
            </p>
          )}

          <p className="text-xs leading-relaxed text-slate-500">
            O endereço e as coordenadas são visíveis apenas para a sua conta.
            Não são publicados nas views públicas do mapa.
          </p>

          <div className="flex flex-col gap-1.5 sm:flex-row">
            {hasCoordinates ? (
              <Link
                to="/mapa?centralizar=imovel"
                className={buttonStyles('primary', 'sm', 'flex-1')}
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                Centralizar no mapa
              </Link>
            ) : null}
            <Link
              to="/meu-endereco"
              className={buttonStyles('secondary', 'sm', 'flex-1')}
            >
              Revisar endereço
            </Link>
          </div>
        </div>
      )}
    </Card>
  )
}
