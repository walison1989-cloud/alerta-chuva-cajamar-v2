import {
  CloudRain,
  House,
  LockKeyhole,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { NearbyStationsCard } from '@/components/map/NearbyStationsCard'
import { PropertyForecastCard } from '@/components/home/PropertyForecastCard'
import { PropertySummaryCard } from '@/components/home/PropertySummaryCard'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { usePropertyOverview } from '@/hooks/usePropertyOverview'

function GuestPanel() {
  return <Card className="p-5" aria-labelledby="painel-imovel-convidado">
    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><House className="h-5 w-5" aria-hidden="true" /></div>
    <h2 id="painel-imovel-convidado" className="text-lg font-bold text-slate-950">Monitore o seu imóvel</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Salve um endereço para consultar as estações próximas e a previsão para a sua região.</p>
    <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-slate-600"><LockKeyhole className="mt-0.5 h-4 w-4 text-brand-700" aria-hidden="true" />O endereço fica visível somente para a sua conta.</p>
    <Link to="/meu-endereco" className={buttonStyles('primary','md','mt-5 w-full')}>Cadastrar meu endereço</Link>
    <Link to="/entrar" className="mt-2 flex min-h-11 items-center justify-center text-sm font-semibold text-brand-800 hover:underline">Já tenho conta</Link>
  </Card>
}

/**
 * Painel personalizado da página inicial. Só consulta o endereço e as
 * estações quando existe sessão; sem sessão, explica o benefício sem inventar
 * localização. A previsão Open-Meteo é montada para as coordenadas do imóvel
 * e permanece visualmente separada da chuva observada.
 */
export function PropertyPanel() {
  const { user, isLoading: isAuthLoading, isConfigured } = useAuth()
  const overview = usePropertyOverview(user?.id ?? null)

  if (!isConfigured) return null

  if (isAuthLoading) {
    return (
      <Card className="p-5" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-3 h-28 w-full" />
      </Card>
    )
  }

  if (!user) return <GuestPanel />

  const latitude = overview.address?.latitude ?? null
  const longitude = overview.address?.longitude ?? null
  const hasCoordinates = latitude !== null && longitude !== null

  return (
    <section aria-labelledby="painel-personalizado" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="painel-personalizado"
            className="text-lg font-bold tracking-tight text-slate-950"
          >
            Painel personalizado do imóvel
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
            Dados privados da sua conta, separados da camada pública do mapa.
          </p>
        </div>
        <Badge tone="brand">
          Informações do seu imóvel
        </Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-1">
        <PropertySummaryCard
          address={overview.address}
          addressError={overview.addressError}
          isLoading={overview.isLoading}
        />
        {latitude !== null && longitude !== null ? (
          <PropertyForecastCard latitude={latitude} longitude={longitude} />
        ) : (
          <Card className="p-5" aria-labelledby="previsao-pendente">
            <header className="flex items-center gap-2">
              <CloudRain className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <h2
                id="previsao-pendente"
                className="text-sm font-bold tracking-tight text-slate-900"
              >
                Previsão para a região do imóvel
              </h2>
            </header>
            <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              A previsão da Open-Meteo será consultada para as coordenadas
              confirmadas do imóvel. Sem localização, a página inicial continua
              exibindo a previsão de referência de Cajamar, sem tratar esse dado
              como medição local.
            </p>
          </Card>
        )}
      </div>

      <NearbyStationsCard
        stations={overview.nearbyStations}
        isLoading={overview.isLoading}
        error={overview.nearbyError}
        isAuthenticated
        hasAddress={hasCoordinates}
        title="Chuva nas proximidades"
      />
    </section>
  )
}
