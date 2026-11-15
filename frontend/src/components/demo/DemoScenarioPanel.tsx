import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import {
  DEMO_SCENARIOS,
  type DemoScenarioId,
  type DemoScenarioValues,
} from '@/lib/demo'
import { cn } from '@/lib/cn'

interface SliderConfig {
  key: keyof DemoScenarioValues
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint: string
}

const SLIDERS: readonly SliderConfig[] = [
  {
    key: 'precipitationMm',
    label: 'Chuva agora',
    unit: 'mm/h',
    min: 0,
    max: 60,
    step: 0.5,
    hint: 'Intensidade instantânea simulada.',
  },
  {
    key: 'next24hMm',
    label: 'Acumulado em 24 h',
    unit: 'mm',
    min: 0,
    max: 200,
    step: 1,
    hint: 'Total simulado para o restante do dia e a madrugada.',
  },
  {
    key: 'probabilityPct',
    label: 'Probabilidade',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
    hint: 'Chance simulada de chuva.',
  },
  {
    key: 'windKmh',
    label: 'Vento',
    unit: 'km/h',
    min: 0,
    max: 120,
    step: 1,
    hint: 'Intensidade simulada do vento.',
  },
]

interface DemoScenarioPanelProps {
  values: DemoScenarioValues
  activeScenarioId: DemoScenarioId
  onChange: (values: DemoScenarioValues, id: DemoScenarioId) => void
  onReset: () => void
}

export function DemoScenarioPanel({
  values,
  activeScenarioId,
  onChange,
  onReset,
}: DemoScenarioPanelProps) {
  return (
    <Card
      className="border-attention-200 bg-white p-5 sm:p-6"
      aria-labelledby="simulador-cenarios"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-attention-100 p-2.5 text-attention-700">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="simulador-cenarios"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Simulador de cenários
              </h2>
              <Badge tone="attention">DEMONSTRAÇÃO</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Escolha um cenário ou ajuste os valores manualmente
            </p>
          </div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Cenários simulados">
        {DEMO_SCENARIOS.map((scenario) => {
          const isActive = activeScenarioId === scenario.id
          return (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(scenario, scenario.id)}
              className={cn(
                'flex min-h-16 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition',
                isActive
                  ? 'border-attention-500 bg-attention-50 shadow-sm ring-1 ring-attention-200'
                  : 'border-slate-200 bg-white hover:border-attention-300 hover:bg-attention-50/50',
              )}
            >
              <span
                className={cn(
                  'text-xs font-bold',
                  isActive ? 'text-attention-900' : 'text-slate-800',
                )}
              >
                {scenario.label}
              </span>
              <span className="mt-0.5 text-xs leading-snug text-slate-500">
                {scenario.description}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        O modo manual é ativado ao mover qualquer controle. Nada é enviado ao
        servidor: os valores existem apenas nesta página.
      </p>

      <div className="mt-5 space-y-4">
        {SLIDERS.map((slider) => {
          const inputId = `demo-${slider.key}`
          const value = values[slider.key]
          return (
            <div key={slider.key}>
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor={inputId}
                  className="text-xs font-semibold text-slate-700"
                >
                  {slider.label}
                </label>
                <output
                  htmlFor={inputId}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-[13px] font-bold text-slate-700"
                >
                  {value} {slider.unit}
                </output>
              </div>
              <input
                id={inputId}
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={value}
                onChange={(event) =>
                  onChange(
                    { ...values, [slider.key]: Number(event.target.value) },
                    'personalizado',
                  )
                }
                className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-attention-600"
              />
              <p className="mt-1 text-xs text-slate-500">{slider.hint}</p>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Restaurar cenário padrão
      </button>
    </Card>
  )
}
