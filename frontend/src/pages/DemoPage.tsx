import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  FlaskConical,
  Map,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { DemoIndicators } from '@/components/demo/DemoIndicators'
import { DemoScenarioPanel } from '@/components/demo/DemoScenarioPanel'
import { DemoSourcesCard } from '@/components/demo/DemoSourcesCard'
import { ForecastCard } from '@/components/home/ForecastCard'
import { WeatherNowCard } from '@/components/home/WeatherNowCard'
import { CajamarMap } from '@/components/map/CajamarMap'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useWeather } from '@/hooks/useWeather'
import {
  buildDemoIndicators,
  DEFAULT_DEMO_SCENARIO_ID,
  getDemoScenario,
  overallDemoLevel,
  type DemoScenarioId,
  type DemoScenarioValues,
} from '@/lib/demo'

function DemoMapCard() {
  return (
    <Card className="overflow-hidden" aria-labelledby="mapa-demonstracao">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
            <Map className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="mapa-demonstracao"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Mapa de Cajamar
              </h2>
              <Badge tone="safe">Dados reais</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Mapa base OpenStreetMap · sem camadas de risco simuladas
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <CajamarMap className="h-72 sm:h-96" interactive />
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-sm ring-1 ring-slate-200/70 backdrop-blur">
          <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-bold text-slate-800">Cajamar, SP</p>
            <p className="text-xs text-slate-500">Centro de referência</p>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200 backdrop-blur">
          Mapa real · nenhum dado simulado
        </div>
      </div>

      <p className="px-5 py-3.5 text-[13px] text-slate-500">
        Arraste e use o zoom para explorar. O marcador é apenas o centro
        administrativo aproximado e não representa risco, estação ou imóvel.
      </p>
    </Card>
  )
}

function DemoNotice() {
  return (
    <Card
      className="border-attention-200 bg-attention-50 p-4 sm:p-5"
      role="note"
      aria-label="Aviso de demonstração"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-attention-100 p-2 text-attention-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold text-attention-900">
            DADOS SIMULADOS — não é um alerta oficial
          </p>
          <p className="mt-1 text-xs leading-relaxed text-attention-900/80">
            Os cenários e indicadores desta página são fictícios e servem
            apenas para teste visual. A meteorologia e o mapa são reais e
            identificados como tal. Em emergência, siga a Defesa Civil (199) ou
            o Corpo de Bombeiros (193).
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-attention-900/70">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Nenhum alerta real
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Nenhuma notificação
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Nenhuma escrita no banco
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function DemoPage() {
  useDocumentTitle('Demonstração')
  const weather = useWeather()
  const [values, setValues] = useState<DemoScenarioValues>(() =>
    getDemoScenario(DEFAULT_DEMO_SCENARIO_ID),
  )
  const [activeScenarioId, setActiveScenarioId] =
    useState<DemoScenarioId>(DEFAULT_DEMO_SCENARIO_ID)

  const indicators = useMemo(() => buildDemoIndicators(values), [values])
  const overallLevel = useMemo(
    () => overallDemoLevel(indicators),
    [indicators],
  )

  function handleScenarioChange(
    nextValues: DemoScenarioValues,
    id: DemoScenarioId,
  ) {
    setValues(nextValues)
    setActiveScenarioId(id)
  }

  function handleReset() {
    setValues(getDemoScenario(DEFAULT_DEMO_SCENARIO_ID))
    setActiveScenarioId(DEFAULT_DEMO_SCENARIO_ID)
  }

  return (
    <div>
      <section className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="attention">
            <FlaskConical className="h-3 w-3" aria-hidden="true" />
            Ambiente de demonstração
          </Badge>
          <Badge tone="neutral">Uso interno e apresentação</Badge>
        </div>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Laboratório de chuva e indicadores
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Teste visualmente como o aplicativo se comporta em diferentes
          condições de chuva. A previsão e o mapa usam fontes reais; os
          cenários e indicadores abaixo são <strong>DEMONSTRAÇÃO</strong> e não
          representam alertas.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#simulacao" className={buttonStyles('attention')}>
            <CloudRain className="h-4 w-4" aria-hidden="true" />
            Abrir simulador
          </a>
          <a href="#dados-reais" className={buttonStyles('secondary')}>
            <Map className="h-4 w-4" aria-hidden="true" />
            Ver dados reais
          </a>
        </div>
      </section>

      <DemoNotice />

      <section
        id="simulacao"
        className="mt-5 scroll-mt-24"
        aria-labelledby="titulo-simulacao"
      >
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="titulo-simulacao"
              className="text-lg font-bold tracking-tight text-slate-950"
            >
              Simulação
            </h2>
            <p className="text-xs text-slate-500">
              Controles locais, sem chamadas a serviços de alerta.
            </p>
          </div>
          <Badge tone="attention">Somente nesta página</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
          <div className="lg:col-span-2">
            <DemoScenarioPanel
              values={values}
              activeScenarioId={activeScenarioId}
              onChange={handleScenarioChange}
              onReset={handleReset}
            />
          </div>
          <div className="lg:col-span-3">
            <DemoIndicators
              indicators={indicators}
              overallLevel={overallLevel}
            />
          </div>
        </div>
      </section>

      <section
        id="dados-reais"
        className="mt-6 scroll-mt-24"
        aria-labelledby="titulo-dados-reais"
      >
        <div className="mb-2">
          <h2
            id="titulo-dados-reais"
            className="text-lg font-bold tracking-tight text-slate-950"
          >
            Dados reais
          </h2>
          <p className="text-xs text-slate-500">
            Open-Meteo e OpenStreetMap, sem simulação.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="space-y-4 lg:col-span-2">
            <WeatherNowCard weather={weather} />
            <DemoMapCard />
            <ForecastCard weather={weather} />
          </div>

          <div className="space-y-4">
            <DemoSourcesCard />

            <Card className="p-5" aria-labelledby="como-usar-demo">
              <header className="flex items-start gap-3">
                <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2
                    id="como-usar-demo"
                    className="text-base font-bold tracking-tight text-slate-900"
                  >
                    Como usar esta página
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Roteiro rápido de teste visual
                  </p>
                </div>
              </header>

              <ol className="mt-4 space-y-2 text-xs leading-relaxed text-slate-600">
                <li className="flex gap-2">
                  <span className="font-bold text-brand-700">1.</span>
                  Escolha um cenário ou mova os controles do simulador.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-brand-700">2.</span>
                  Compare os indicadores e as cores com o cenário esperado.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-brand-700">3.</span>
                  Confira acima a previsão real da Open-Meteo e o mapa.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-brand-700">4.</span>
                  Recarregue a página para voltar ao cenário padrão.
                </li>
              </ol>

              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-100">
                Acesse pelo computador ou celular. Os controles têm área de
                toque ampliada e o mapa aceita arrastar e pinçar. Nenhum dado
                desta simulação sai do navegador.
              </p>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
