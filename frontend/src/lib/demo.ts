import { formatMm, formatPercent } from '@/lib/format'

/**
 * Cenários do simulador da página /demo.
 *
 * Nada aqui representa alerta oficial, medição de estação ou critério da
 * Defesa Civil. São valores ilustrativos, mantidos apenas na memória da
 * página, para testar a apresentação visual dos indicadores.
 */

export type DemoScenarioId =
  | 'seco'
  | 'chuva-leve'
  | 'chuva-moderada'
  | 'chuva-forte'
  | 'temporal'
  | 'personalizado'

export interface DemoScenarioValues {
  /** Intensidade instantânea simulada, em mm/h. */
  precipitationMm: number
  /** Acumulado simulado para as próximas 24 h, em mm. */
  next24hMm: number
  /** Probabilidade simulada, em %. */
  probabilityPct: number
  /** Vento simulado, em km/h. */
  windKmh: number
}

export interface DemoScenario extends DemoScenarioValues {
  id: Exclude<DemoScenarioId, 'personalizado'>
  label: string
  description: string
}

export const DEFAULT_DEMO_SCENARIO_ID = 'chuva-moderada' as const

export const DEMO_SCENARIOS: readonly DemoScenario[] = Object.freeze([
  {
    id: 'seco',
    label: 'Tempo seco',
    description: 'Céu sem chuva e vento fraco.',
    precipitationMm: 0,
    next24hMm: 0,
    probabilityPct: 5,
    windKmh: 8,
  },
  {
    id: 'chuva-leve',
    label: 'Chuva leve',
    description: 'Garoa persistente, sem acumulado alto.',
    precipitationMm: 1.2,
    next24hMm: 6,
    probabilityPct: 35,
    windKmh: 12,
  },
  {
    id: 'chuva-moderada',
    label: 'Chuva moderada',
    description: 'Chuva contínua com acumulado relevante.',
    precipitationMm: 4.5,
    next24hMm: 24,
    probabilityPct: 62,
    windKmh: 22,
  },
  {
    id: 'chuva-forte',
    label: 'Chuva forte',
    description: 'Pancadas fortes e vento intenso.',
    precipitationMm: 14,
    next24hMm: 65,
    probabilityPct: 88,
    windKmh: 45,
  },
  {
    id: 'temporal',
    label: 'Temporal',
    description: 'Cenário extremo para testar os limites visuais.',
    precipitationMm: 32,
    next24hMm: 140,
    probabilityPct: 98,
    windKmh: 75,
  },
])

export type DemoLevel = 'none' | 'low' | 'moderate' | 'high' | 'critical'

export type DemoIndicatorKey =
  | 'intensidade'
  | 'acumulado'
  | 'probabilidade'
  | 'vento'

export interface DemoIndicator {
  key: DemoIndicatorKey
  label: string
  valueLabel: string
  level: DemoLevel
  levelLabel: string
  hint: string
  /** Preenchimento ilustrativo da barra, de 0 a 100. */
  progressPct: number
}

const LEVEL_RANK: Record<DemoLevel, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
}

export const DEMO_OVERALL_LABELS: Record<DemoLevel, string> = {
  none: 'Sem sinal de chuva',
  low: 'Cenário ameno',
  moderate: 'Cenário moderado',
  high: 'Cenário elevado',
  critical: 'Cenário crítico',
}

const LIMITS = {
  precipitationMm: { min: 0, max: 60 },
  next24hMm: { min: 0, max: 200 },
  probabilityPct: { min: 0, max: 100 },
  windKmh: { min: 0, max: 120 },
} as const

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function normalizeDemoValues(
  values: DemoScenarioValues,
): DemoScenarioValues {
  return {
    precipitationMm: round(
      clamp(
        values.precipitationMm,
        LIMITS.precipitationMm.min,
        LIMITS.precipitationMm.max,
      ),
      1,
    ),
    next24hMm: round(
      clamp(values.next24hMm, LIMITS.next24hMm.min, LIMITS.next24hMm.max),
      1,
    ),
    probabilityPct: round(
      clamp(
        values.probabilityPct,
        LIMITS.probabilityPct.min,
        LIMITS.probabilityPct.max,
      ),
    ),
    windKmh: round(
      clamp(values.windKmh, LIMITS.windKmh.min, LIMITS.windKmh.max),
    ),
  }
}

export function getDemoScenario(id: DemoScenarioId): DemoScenarioValues {
  const scenario =
    DEMO_SCENARIOS.find((item) => item.id === id) ??
    DEMO_SCENARIOS.find((item) => item.id === DEFAULT_DEMO_SCENARIO_ID)

  if (!scenario) {
    return { precipitationMm: 0, next24hMm: 0, probabilityPct: 0, windKmh: 0 }
  }

  const { precipitationMm, next24hMm, probabilityPct, windKmh } = scenario
  return { precipitationMm, next24hMm, probabilityPct, windKmh }
}

function classifyRainIntensity(value: number): {
  level: DemoLevel
  label: string
} {
  if (value < 0.1) return { level: 'none', label: 'Sem chuva' }
  if (value < 2.5) return { level: 'low', label: 'Fraca' }
  if (value < 10) return { level: 'moderate', label: 'Moderada' }
  if (value < 30) return { level: 'high', label: 'Forte' }
  return { level: 'critical', label: 'Muito forte' }
}

function classifyAccumulated(value: number): {
  level: DemoLevel
  label: string
} {
  if (value < 1) return { level: 'none', label: 'Seco' }
  if (value < 10) return { level: 'low', label: 'Baixo' }
  if (value < 30) return { level: 'moderate', label: 'Moderado' }
  if (value < 70) return { level: 'high', label: 'Alto' }
  return { level: 'critical', label: 'Muito alto' }
}

function classifyProbability(value: number): {
  level: DemoLevel
  label: string
} {
  if (value < 20) return { level: 'none', label: 'Improvável' }
  if (value < 40) return { level: 'low', label: 'Baixa' }
  if (value < 70) return { level: 'moderate', label: 'Média' }
  if (value < 90) return { level: 'high', label: 'Alta' }
  return { level: 'critical', label: 'Muito alta' }
}

function classifyWind(value: number): {
  level: DemoLevel
  label: string
} {
  if (value < 10) return { level: 'none', label: 'Calmo' }
  if (value < 30) return { level: 'low', label: 'Fraco' }
  if (value < 50) return { level: 'moderate', label: 'Moderado' }
  if (value < 70) return { level: 'high', label: 'Forte' }
  return { level: 'critical', label: 'Muito forte' }
}

function percentOf(value: number, max: number): number {
  return Math.round(clamp((value / max) * 100, 0, 100))
}

/**
 * Converte os valores do simulador em quatro indicadores visuais.
 * As faixas são ilustrativas e não substituem critérios oficiais.
 */
export function buildDemoIndicators(
  values: DemoScenarioValues,
): DemoIndicator[] {
  const normalized = normalizeDemoValues(values)
  const intensity = classifyRainIntensity(normalized.precipitationMm)
  const accumulated = classifyAccumulated(normalized.next24hMm)
  const probability = classifyProbability(normalized.probabilityPct)
  const wind = classifyWind(normalized.windKmh)

  return [
    {
      key: 'intensidade',
      label: 'Intensidade agora',
      valueLabel: `${formatMm(normalized.precipitationMm)}/h`,
      level: intensity.level,
      levelLabel: intensity.label,
      hint: 'Quanto está chovendo neste instante, no cenário.',
      progressPct: percentOf(normalized.precipitationMm, LIMITS.precipitationMm.max),
    },
    {
      key: 'acumulado',
      label: 'Acumulado em 24 h',
      valueLabel: formatMm(normalized.next24hMm),
      level: accumulated.level,
      levelLabel: accumulated.label,
      hint: 'Soma simulada de chuva para as próximas 24 horas.',
      progressPct: percentOf(normalized.next24hMm, LIMITS.next24hMm.max),
    },
    {
      key: 'probabilidade',
      label: 'Probabilidade',
      valueLabel: formatPercent(normalized.probabilityPct),
      level: probability.level,
      levelLabel: probability.label,
      hint: 'Chance simulada de ocorrência de chuva.',
      progressPct: normalized.probabilityPct,
    },
    {
      key: 'vento',
      label: 'Vento',
      valueLabel: `${Math.round(normalized.windKmh)} km/h`,
      level: wind.level,
      levelLabel: wind.label,
      hint: 'Intensidade simulada do vento.',
      progressPct: percentOf(normalized.windKmh, LIMITS.windKmh.max),
    },
  ]
}

export function overallDemoLevel(indicators: DemoIndicator[]): DemoLevel {
  return indicators.reduce<DemoLevel>((worst, indicator) => {
    return LEVEL_RANK[indicator.level] > LEVEL_RANK[worst]
      ? indicator.level
      : worst
  }, 'none')
}

export function overallDemoLabel(level: DemoLevel): string {
  return DEMO_OVERALL_LABELS[level]
}
