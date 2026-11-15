import { Map, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataSourcesCard } from '@/components/home/DataSourcesCard'
import { ExperimentalAnalysisCard } from '@/components/home/ExperimentalAnalysisCard'
import { ForecastCard } from '@/components/home/ForecastCard'
import { ObservedRainCard } from '@/components/home/ObservedRainCard'
import { OfficialAlertsCard } from '@/components/home/OfficialAlertsCard'
import { PrivacyCard } from '@/components/home/PrivacyCard'
import { PropertyPanel } from '@/components/home/PropertyPanel'
import { WeatherNowCard } from '@/components/home/WeatherNowCard'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { env } from '@/config/env'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useWeather } from '@/hooks/useWeather'
import { formatTodayLong } from '@/lib/format'

export function HomePage() {
  useDocumentTitle()
  const weather=useWeather()
  return <div className="space-y-6 sm:space-y-8">
    <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div className="max-w-2xl"><p className="mb-2 text-sm font-medium capitalize text-slate-600">{formatTodayLong()}</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Como está Cajamar hoje?</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">Veja a previsão, confira a chuva nas estações e acompanhe a região do seu imóvel.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 xl:shrink-0">
        <Link to="/mapa" className={buttonStyles('primary')}><Map className="h-4 w-4" aria-hidden="true" />Abrir mapa</Link>
        <Link to="/meu-endereco" className={buttonStyles('secondary')}><MapPin className="h-4 w-4" aria-hidden="true" />Consultar meu endereço</Link>
      </div>
    </section>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5"><WeatherNowCard weather={weather} /><ForecastCard weather={weather} /><ObservedRainCard /></div>
      <aside className="min-w-0 space-y-5" aria-label="Seu imóvel e canais oficiais"><PropertyPanel /><OfficialAlertsCard />{env.experimentalAnalysisEnabled?<ExperimentalAnalysisCard />:null}</aside>
    </div>
    <details className="rounded-2xl border border-slate-200 bg-white p-5" id="fontes-e-privacidade">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Sobre os dados e sua privacidade</summary>
      <p className="mb-4 mt-3 text-sm leading-relaxed text-slate-600">Saiba de onde vêm as informações e como o endereço cadastrado é protegido.</p>
      <div className="grid items-start gap-4 lg:grid-cols-2"><DataSourcesCard /><PrivacyCard /></div>
    </details>
  </div>
}
