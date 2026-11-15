import { describe, it, expect } from 'vitest'
import { previsaoEstaFresca, estacaoEstaFresca } from './avaliacaoPreventiva'
import type { PrevisaoResumo, EstacaoEvidencia } from '@/types/avaliacaoPreventiva'

describe('datas futuras não representam evidência recente', () => {
  const now = Date.parse('2026-11-08T12:00:00Z')
  it('rejeita previsão consultada no futuro', () => {
    expect(previsaoEstaFresca({ precipMm24h: 20, fetchedAt: now + 3600000 } as PrevisaoResumo, 6, now)).toBe(false)
  })
  it('rejeita leitura de estação no futuro', () => {
    expect(estacaoEstaFresca({ temLeitura: true, chuva24hMm: 20, dataHora: '2026-11-09T12:00:00Z' } as EstacaoEvidencia, 6, now)).toBe(false)
  })
})
