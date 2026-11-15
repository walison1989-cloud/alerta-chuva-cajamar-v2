import { describe, expect, it } from 'vitest'
import {
  buildDemoIndicators,
  DEMO_SCENARIOS,
  getDemoScenario,
  normalizeDemoValues,
  overallDemoLabel,
  overallDemoLevel,
} from '@/lib/demo'

describe('simulador de demonstração', () => {
  it('mantém todos os cenários dentro dos limites declarados', () => {
    for (const scenario of DEMO_SCENARIOS) {
      const normalized = normalizeDemoValues(scenario)
      expect(normalized).toEqual({
        precipitationMm: scenario.precipitationMm,
        next24hMm: scenario.next24hMm,
        probabilityPct: scenario.probabilityPct,
        windKmh: scenario.windKmh,
      })
    }
  })

  it('limita valores fora da faixa em vez de gerar números inválidos', () => {
    expect(
      normalizeDemoValues({
        precipitationMm: 999,
        next24hMm: -10,
        probabilityPct: 140,
        windKmh: Number.NaN,
      }),
    ).toEqual({
      precipitationMm: 60,
      next24hMm: 0,
      probabilityPct: 100,
      windKmh: 0,
    })
  })

  it('classifica o cenário seco como sem sinal de chuva', () => {
    const indicators = buildDemoIndicators(getDemoScenario('seco'))
    expect(indicators.map((item) => item.level)).toEqual([
      'none',
      'none',
      'none',
      'none',
    ])
    expect(overallDemoLevel(indicators)).toBe('none')
    expect(overallDemoLabel('none')).toBe('Sem sinal de chuva')
  })

  it('classifica o cenário moderado como moderado', () => {
    const indicators = buildDemoIndicators(getDemoScenario('chuva-moderada'))
    expect(overallDemoLevel(indicators)).toBe('moderate')
    expect(overallDemoLabel('moderate')).toBe('Cenário moderado')
  })

  it('classifica o temporal como crítico', () => {
    const indicators = buildDemoIndicators(getDemoScenario('temporal'))
    expect(overallDemoLevel(indicators)).toBe('critical')
    expect(overallDemoLabel('critical')).toBe('Cenário crítico')
    expect(
      indicators.find((item) => item.key === 'intensidade')?.levelLabel,
    ).toBe('Muito forte')
  })

  it('mantém as barras entre 0 e 100', () => {
    const indicators = buildDemoIndicators(getDemoScenario('temporal'))
    for (const indicator of indicators) {
      expect(indicator.progressPct).toBeGreaterThanOrEqual(0)
      expect(indicator.progressPct).toBeLessThanOrEqual(100)
    }
  })
})
