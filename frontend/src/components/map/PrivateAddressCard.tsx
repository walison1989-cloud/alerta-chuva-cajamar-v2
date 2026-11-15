import { House, LocateFixed, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatAddressLabel } from '@/lib/addressFormat'
import type { AddressRecord } from '@/types/address'

interface PrivateAddressCardProps {
  address: AddressRecord | null
  isAuthenticated: boolean
  isAuthLoading: boolean
  addressError: string | null
  onCenter?: () => void
}

/**
 * Cartão do imóvel privado. Os dados vêm da consulta autenticada e nunca
 * entram na camada pública do mapa. Sem sessão ou sem endereço, o cartão
 * explica o próximo passo em vez de inventar uma localização.
 */
export function PrivateAddressCard({
  address,
  isAuthenticated,
  isAuthLoading,
  addressError,
  onCenter,
}: PrivateAddressCardProps) {
  return (
    <div className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <House className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            Meu imóvel
          </h2>
        </div>
        <Badge tone="safe">
          <LockKeyhole className="h-2.5 w-2.5" aria-hidden="true" />
          Privado
        </Badge>
      </header>

      {isAuthLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !isAuthenticated ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Entre para ver seu endereço no mapa
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            O imóvel e as distâncias até as estações são visíveis apenas para a
            conta autenticada.
          </p>
          <Link
            to="/entrar"
            className={buttonStyles('secondary', 'sm', 'mt-2 w-full')}
          >
            Entrar na conta
          </Link>
        </div>
      ) : !address ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Nenhum endereço cadastrado
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Cadastre o endereço para calcular no PostGIS a distância até cada
            estação. Sem endereço, o mapa continua mostrando apenas dados
            públicos.
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-950">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{formatAddressLabel(address)}</span>
          </p>
          {address.latitude !== null && address.longitude !== null ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-800">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Marcador privado ativo · distâncias calculadas no servidor
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-attention-800">
              O endereço não tem coordenadas confirmadas. Ajuste o ponto em
              “Meu endereço” para habilitar as distâncias.
            </p>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-emerald-800/80">
            Nenhum dado pessoal é enviado à camada pública, a outros usuários ou
            a scripts de terceiros.
          </p>
          {onCenter && address.latitude !== null && address.longitude !== null ? (
            <button
              type="button"
              onClick={onCenter}
              className={buttonStyles('secondary', 'sm', 'mt-2 w-full')}
            >
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
              Centralizar no imóvel
            </button>
          ) : null}
          <Link
            to="/meu-endereco"
            className="mt-2 inline-flex min-h-7 items-center text-xs font-semibold text-emerald-900 underline-offset-2 hover:underline"
          >
            Revisar endereço
          </Link>
        </div>
      )}
    </div>
  )
}
