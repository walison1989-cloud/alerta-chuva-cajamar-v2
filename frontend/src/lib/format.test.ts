import { describe, expect, it } from 'vitest'
import {
  formatApiDateTime,
  formatApiTime,
  formatDayLabel,
  formatMm,
  formatPercent,
  formatRelativeTime,
  formatTemperature,
} from '@/lib/format'

describe('formatação de dados meteorológicos', () => {
  it('formata milímetros no padrão brasileiro', () => {
    expect(formatMm(12.34)).toBe('12,3 mm')
    expect(formatMm(0)).toBe('0,0 mm')
    expect(formatMm(-2)).toBe('0,0 mm')
    expect(formatMm(Number.NaN)).toBe('—')
  })

  it('formata temperatura e porcentagem', () => {
    expect(formatTemperature(21.6)).toBe('22 °C')
    expect(formatPercent(49.6)).toBe('50%')
    expect(formatPercent(Number.NaN)).toBe('—')
  })

  it('mantém o horário local devolvido pela API', () => {
    expect(formatApiDateTime('2026-11-05T19:30')).toBe('05/11 às 19:30')
    expect(formatApiTime('2026-11-05T19:30')).toBe('19h')
    expect(formatApiDateTime('inválido')).toBe('inválido')
  })

  it('rotula hoje e amanhã e formata os demais dias', () => {
    expect(formatDayLabel('2026-11-05', 0)).toBe('Hoje')
    expect(formatDayLabel('2026-11-06', 1)).toBe('Amanhã')
    expect(formatDayLabel('2026-11-07', 2)).toMatch(/sáb/i)
  })

  it('calcula tempo relativo', () => {
    const now = 1_700_000_000_000
    expect(formatRelativeTime(now, now)).toBe('agora mesmo')
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('há 5 min')
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe('há 3 h')
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60_000, now)).toBe('há 2 d')
  })
})
