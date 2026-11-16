import { describe, expect, it } from 'vitest'
import type { RainStation } from '@/types/rain'
import type { RegraAvaliacaoPublica, PacoteEvidencias } from '@/types/avaliacaoPreventiva'
import { avaliarTriangulacao, triangularChuva24h } from './triangulacaoChuva'

const now = Date.parse('2026-11-08T12:00:00.000Z')
const point = { latitude: -23.35, longitude: -46.93 }

function station(code: string, latitude: number, longitude: number, mm: number, overrides: Partial<RainStation> = {}): RainStation {
  return {
    key: code, id: 1, name: code, code, latitude, longitude, source: 'CEMADEN', sourceId: code,
    municipality: 'Cajamar', state: 'SP', stationType: 'Pluviométrica', network: 'CEMADEN',
    sourceStatus: 1, lastCollectedAt: new Date(now - 5 * 60_000).toISOString(),
    lastReadingAt: new Date(now - 10 * 60_000).toISOString(), accumulatedMm: mm,
    measurementType: 'acumulado_24h', windowHours: 24, unit: 'mm', quality: 'oficial', distanceKm: null,
    ...overrides,
  }
}

const stations = [
  station('N', -23.34, -46.93, 20),
  station('S', -23.36, -46.93, 40),
  station('E', -23.35, -46.91, 30),
  station('W', -23.35, -46.95, 10),
]

const rule: RegraAvaliacaoPublica = {
  id: 1, versao: 'exp-2026.11-v2', motorVersao: '1.1.0', titulo: 'Regra teste', descricao: 'teste',
  aviso: 'teste', vigenteDe: new Date(now - 86_400_000).toISOString(), vigenteAte: null, criadaEm: new Date(now - 86_400_000).toISOString(),
  parametros: {
    pico3hCriticoMm: 20, frescorMaxHoras: 6, raioSuscetibilidadeM: 500, raioEstacoesKm: 30, raioPreferencialEstacoesKm: 10, limiteEstacoes: 10,
    faixasObservado24hMm: [{ nivel: 0, min: 0, max: null }, { nivel: 1, min: 10, max: 25 }, { nivel: 2, min: 25, max: 50 }, { nivel: 3, min: 50, max: null }],
    faixasPrevisao24hMm: [{ nivel: 0, min: 0, max: null }, { nivel: 1, min: 10, max: 25 }, { nivel: 2, min: 25, max: 50 }, { nivel: 3, min: 50, max: null }],
    suscetibilidadeNiveis: { Alta: 3, Media: 2, Baixa: 1 },
    regras: [{ id: 'forte', minSuscetibilidade: 2, minChuva: 2, nivel: 'atencao_forte_experimental', avisoAreaNaoMapeada: true }],
    limitacoes: [],
  },
}

const evidence: PacoteEvidencias = {
  temEndereco: true, localizacaoValida: true, municipio: 'Cajamar', bairro: null, precisao: 'precisa',
  cartografia: { id: 1, slug: 'mapa', titulo: 'Carta', fonte: 'SGB/CPRM + IPT', editor: 'SGB', escala: '1:25000', anoPublicacao: 2017, urlItem: 'https://example.test' },
  suscetibilidadeDisponivel: true,
  suscetibilidade: [{ id: 1, cartografiaSlug: 'mapa', tipo: 'inundacao', classe: 'Alta', classeOrdem: 1, processo: 'inundacao', areaHa: 2, contemPonto: true, distanciaM: 0 }],
  estacoes: [], resumoChuva: { totalEstacoes: 0, comLeitura: 0, frescas: 0, frescasAte10km: 0, max24hMm: null, maxAte10kmMm: null, mediana24hMm: null, estacaoReferencia: null },
  coleta: null, ocorrencias: [], geradoEm: new Date(now).toISOString(),
}

const forecast = { fonte: 'Open-Meteo', precipMm24h: 20, probabilidadeMaxPct: 50, fetchedAt: now - 10 * 60_000, referenciaEm: new Date(now).toISOString(), timezone: 'America/Sao_Paulo' }

describe('triangulação experimental de chuva', () => {
  it('interpola no triângulo de três estações envolvendo o endereço', () => {
    const result = triangularChuva24h(point, stations, now)
    expect(result.suporteEspacial).toBe(true)
    expect(result.estacoes.reduce((sum, item) => sum + item.peso, 0)).toBeCloseTo(1)
    expect(result.chuvaObservadaMm).toBeGreaterThan(0)
    expect(result.estacoes).toHaveLength(3)
    expect(result.metodo).toBe('triangulo')
    expect(result.chuvaObservadaMm).toBeCloseTo(30, 1)
  })

  it('não interpola três estações concentradas no mesmo lado do imóvel', () => {
    const east = [
      station('E1', -23.34, -46.92, 5),
      station('E2', -23.35, -46.91, 10),
      station('E3', -23.36, -46.92, 15),
    ]
    const result = triangularChuva24h(point, east, now)
    expect(result.suporteEspacial).toBe(false)
    expect(result.chuvaObservadaMm).toBeNull()
  })

  it('não mistura acumulados de horários separados por mais de uma hora', () => {
    const mismatch = stations.slice(0, 3).map((item, index) => index === 2
      ? { ...item, lastReadingAt: new Date(now - 3 * 3_600_000).toISOString() }
      : item)
    const result = triangularChuva24h(point, mismatch, now)
    expect(result.suporteEspacial).toBe(false)
    expect(result.chuvaObservadaMm).toBeNull()
  })

  it('não eleva a confiabilidade quando a variação entre estações é extrema', () => {
    const uneven = stations.map((item, i) => ({ ...item, accumulatedMm: i === 0 ? 120 : 0 }))
    const result = triangularChuva24h(point, uneven, now)
    expect(result.suporteEspacial).toBe(false)
    expect(result.justificativa).toContain('divergem')
  })

  it('aceita medição quase no ponto sem chamar isso de triangulação', () => {
    const onPoint = station('LOCAL', point.latitude, point.longitude, 7)
    const result = triangularChuva24h(point, [onPoint], now)
    expect(result.metodo).toBe('direta')
    expect(result.chuvaObservadaMm).toBe(7)
    expect(result.suporteEspacial).toBe(true)
    expect(result.estacoes).toHaveLength(1)
  })

  it('desconsidera catálogo sem telemetria, leitura velha, fonte não autorizada e janela diferente', () => {
    const excluded = [
      station('catalogo', -23.35, -46.93, 99, { catalogueOnly: true }),
      station('velha', -23.35, -46.93, 99, { lastReadingAt: new Date(now - 7 * 3_600_000).toISOString() }),
      station('outra-fonte', -23.35, -46.93, 99, { source: 'SP Águas' }),
      station('outra-janela', -23.35, -46.93, 99, { windowHours: 1 }),
      station('suspeita', -23.35, -46.93, 99, { quality: 'suspeita' }),
    ]
    expect(triangularChuva24h(point, excluded, now).chuvaObservadaMm).toBeNull()
  })

  it('não chama de triangulação uma leitura sem três estações cercando o ponto', () => {
    const result = triangularChuva24h(point, stations.slice(0, 2), now)
    expect(result.chuvaObservadaMm).toBeNull()
    expect(result.suporteEspacial).toBe(false)
  })

  it('usa a regra publicada e bloqueia a classificação quando não há triângulo', () => {
    const insufficient = avaliarTriangulacao(point, stations.slice(0, 2), evidence, forecast, rule, now)
    expect(insufficient.status).toBe('dados_insuficientes')
    expect(insufficient.motivo).toContain('menos de três pluviômetros válidos')
    const classified = avaliarTriangulacao(point, stations, evidence, forecast, rule, now)
    expect(classified.status).toBe('sinal_experimental')
    expect(classified.nivel).toBe('atencao_experimental')
    expect(classified.nivelSuscetibilidade).toBe(3)
  })

  it('permite forte apenas com terreno baixo/conectividade e observação confirmada na rede', () => {
    const withTerrain: PacoteEvidencias = {
      ...evidence,
      terreno: { fonte: 'MDT validado', qualidade: 'boa', elevacaoRelativaM: -6,
        declividadeGraus: 2, posicaoTopografica: 'baixa', conectividadeHidrologica: 'confirmada' },
    }
    const result = avaliarTriangulacao(point, stations, withTerrain, { ...forecast, precipMm24h: 35, pico3hMm: 22 }, rule, now)
    expect(result.nivel).toBe('atencao_forte_experimental')
  })

  it('bloqueia quando a previsão, a área que contém o ponto ou a regra compatível faltam', () => {
    expect(avaliarTriangulacao(point, stations, evidence, null, rule, now).status).toBe('dados_insuficientes')
    const outside = { ...evidence, suscetibilidade: evidence.suscetibilidade.map((area) => ({ ...area, contemPonto: false })) }
    expect(avaliarTriangulacao(point, stations, outside, forecast, rule, now).status).toBe('dados_insuficientes')
    expect(avaliarTriangulacao(point, stations, evidence, forecast, { ...rule, motorVersao: '2.0' }, now).status).toBe('dados_insuficientes')
  })

  it('não soma chuva observada e prevista como uma janela de 48 horas', () => {
    const output = avaliarTriangulacao(point, stations, evidence, { ...forecast, precipMm24h: 35 }, rule, now)
    expect(output.chuvaObservadaMm).toBeLessThan(35)
    expect(output.chuvaFuturaMm).toBe(35)
    expect(output.status).toBe('sinal_experimental')
  })

  it('retorna sem sinal quando os dados completos não atingem a matriz publicada', () => {
    const dry = stations.map((item) => ({ ...item, accumulatedMm: 0 }))
    const output = avaliarTriangulacao(point, dry, evidence, { ...forecast, precipMm24h: 0 }, rule, now)
    expect(output.status).toBe('sem_sinal_experimental')
    expect(output.nivel).toBe('sem_sinal_experimental')
    expect(output.motivo).toContain('não atingiu')
  })
})
