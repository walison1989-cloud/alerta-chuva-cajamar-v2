import type { RainStation } from '@/types/rain'
import type {
  AvaliacaoNivel,
  PrevisaoResumo,
  RegraAvaliacaoPublica,
  PacoteEvidencias,
} from '@/types/avaliacaoPreventiva'
import { classificarFaixaExperimental, MOTOR_VERSAO, previsaoEstaFresca } from '@/lib/avaliacaoPreventiva'

export const TRIANGULACAO_VERSAO = 'triangulacao-idw-exp-v2'
const RAIO_MAX_KM = 30
const JANELA_ALINHAMENTO_MS = 60 * 60 * 1000

export interface PontoAnalise {
  latitude: number
  longitude: number
}

export interface LeituraTriangulada {
  nivel: AvaliacaoNivel | null
  status: 'dados_insuficientes' | 'sinal_experimental' | 'sem_sinal_experimental'
  motivo: string
  chuvaObservadaMm: number | null
  chuvaFuturaMm: number | null
  nivelChuva: number | null
  nivelSuscetibilidade: number | null
  suporteEspacial: boolean
  estacoes: Array<{
    codigo: string
    nome: string
    chuvaMm: number
    distanciaKm: number
    peso: number
    dataHora: string
  }>
  regraVersao: string | null
  motorVersao: string
}

function coordenadaValida(point: PontoAnalise): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180
}

function distanciaKm(a: PontoAnalise, b: PontoAnalise): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)))
}

function pointInsideTriangle(point: PontoAnalise, a: PontoAnalise, b: PontoAnalise, c: PontoAnalise): boolean {
  // Coordenadas locais em graus são adequadas para o pequeno raio municipal.
  const x = (p: PontoAnalise) => (p.longitude - point.longitude) * Math.cos(point.latitude * Math.PI / 180)
  const y = (p: PontoAnalise) => p.latitude - point.latitude
  const ax = x(a), ay = y(a), bx = x(b), by = y(b), cx = x(c), cy = y(c)
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  if (Math.abs(denominator) < 1e-12) return false
  const u = ((by - cy) * -cx + (cx - bx) * -cy) / denominator
  const v = ((cy - ay) * -cx + (ax - cx) * -cy) / denominator
  const w = 1 - u - v
  return u >= -1e-9 && v >= -1e-9 && w >= -1e-9
}

/** Interpola somente leituras CEMADEN de 24 h, recentes e temporalmente alinhadas. */
export function triangularChuva24h(
  ponto: PontoAnalise,
  estacoes: RainStation[],
  agora: number,
): Pick<LeituraTriangulada, 'chuvaObservadaMm' | 'suporteEspacial' | 'estacoes'> {
  if (!coordenadaValida(ponto) || !Number.isFinite(agora)) return { chuvaObservadaMm: null, suporteEspacial: false, estacoes: [] }
  const candidates = estacoes.flatMap((station) => {
    if (station.catalogueOnly || station.source.toLocaleUpperCase('en-US') !== 'CEMADEN') return []
    if (station.measurementType !== 'acumulado_24h' || station.windowHours !== 24) return []
    if (station.quality !== 'oficial') return []
    if (station.accumulatedMm === null || !Number.isFinite(station.accumulatedMm) || station.accumulatedMm < 0) return []
    if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) return []
    const timestamp = station.lastReadingAt ? Date.parse(station.lastReadingAt) : NaN
    if (!Number.isFinite(timestamp) || timestamp > agora || agora - timestamp > 6 * 60 * 60 * 1000) return []
    const distance = distanciaKm(ponto, station)
    if (distance > RAIO_MAX_KM) return []
    return [{ station, timestamp, distance }]
  }).sort((a, b) => a.distance - b.distance || a.station.code.localeCompare(b.station.code))

  // Collapse duplicate records for a physical gauge, retaining the freshest valid one.
  const byCode = new Map<string, typeof candidates[number]>()
  for (const item of candidates) {
    const previous = byCode.get(item.station.code)
    if (!previous || item.timestamp > previous.timestamp) byCode.set(item.station.code, item)
  }
  let selected = [...byCode.values()].sort((a, b) => a.distance - b.distance).slice(0, 10)
  if (!selected.length) return { chuvaObservadaMm: null, suporteEspacial: false, estacoes: [] }
  const newest = Math.max(...selected.map((item) => item.timestamp))
  selected = selected.filter((item) => newest - item.timestamp <= JANELA_ALINHAMENTO_MS)
  const colocated = new Set<string>()
  selected = selected.filter((item) => {
    const key = `${item.station.latitude.toFixed(5)},${item.station.longitude.toFixed(5)}`
    if (colocated.has(key)) return false
    colocated.add(key)
    return true
  })
  if (!selected.length) return { chuvaObservadaMm: null, suporteEspacial: false, estacoes: [] }

  const direct = selected.find((item) => item.distance <= 0.005)
  const weighted = direct ? [{ ...direct, weight: 1 }] : selected.map((item) => {
    const rawWeight = 1 / Math.max(item.distance, 0.005) ** 2
    return { ...item, weight: rawWeight }
  })
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  const normalized = weighted.map((item) => ({ ...item, weight: item.weight / total }))
  const mm = normalized.reduce((sum, item) => sum + item.weight * item.station.accumulatedMm!, 0)
  const hasTriangle = normalized.some((a, i) =>
    normalized.some((b, j) =>
      j > i && normalized.some((c, k) =>
        k > j && pointInsideTriangle(ponto, a.station, b.station, c.station),
      ),
    ),
  )
  const support = Boolean(direct) || (normalized.length >= 3 && hasTriangle)

  return {
    chuvaObservadaMm: Number.isFinite(mm) ? mm : null,
    suporteEspacial: support,
    estacoes: normalized.map(({ station, distance, weight }) => ({
      codigo: station.code,
      nome: station.name,
      chuvaMm: station.accumulatedMm!,
      distanciaKm: distance,
      peso: weight,
      dataHora: station.lastReadingAt!,
    })),
  }
}

/** Cruza interpolação, chuva prevista e classe oficial no ponto com a regra publicada. */
export function avaliarTriangulacao(
  ponto: PontoAnalise,
  estacoes: RainStation[],
  evidencias: PacoteEvidencias | null,
  previsao: PrevisaoResumo | null,
  regra: RegraAvaliacaoPublica | null,
  agora: number,
): LeituraTriangulada {
  const rain = triangularChuva24h(ponto, estacoes, agora)
  const forecastFresh = previsaoEstaFresca(previsao, regra?.parametros.frescorMaxHoras ?? 6, agora)
  const chuvaFuturaMm = forecastFresh ? previsao?.precipMm24h ?? null : null
  const area = evidencias?.suscetibilidade.find((item) => item.contemPonto) ?? null
  const levelS = area ? regra?.parametros.suscetibilidadeNiveis[area.classe] : null
  const validRule = regra && regra.motorVersao === MOTOR_VERSAO
  const missing: string[] = []
  if (!rain.suporteEspacial || rain.chuvaObservadaMm === null) missing.push('Não há pelo menos três pluviômetros recentes cercando o ponto; sem triângulo confiável, a estimativa é bloqueada.')
  if (!area || typeof levelS !== 'number') missing.push('A carta oficial não indica uma área que contenha exatamente o ponto analisado.')
  if (chuvaFuturaMm === null) missing.push('A previsão de chuva para as próximas 24 h está ausente ou desatualizada.')
  if (!validRule) missing.push('A regra publicada não é compatível com esta versão da análise.')

  const nivelChuvaObservada = rain.chuvaObservadaMm === null || !regra
    ? null
    : classificarFaixaExperimental(rain.chuvaObservadaMm, regra.parametros.faixasObservado24hMm)
  const nivelPrevisao = chuvaFuturaMm === null || !regra
    ? null
    : classificarFaixaExperimental(chuvaFuturaMm, regra.parametros.faixasPrevisao24hMm)
  const nivelChuva = nivelChuvaObservada === null || nivelPrevisao === null
    ? null
    : Math.max(nivelChuvaObservada, nivelPrevisao)
  const classified = missing.length === 0 && regra && typeof levelS === 'number' && nivelChuva !== null
    ? regra.parametros.regras.find((candidate) => levelS >= candidate.minSuscetibilidade && nivelChuva >= candidate.minChuva)
    : null
  // Mesmas barreiras de segurança da classificação principal: triangulação IDW
  // de chuva não prova que a água chegue ao imóvel ou que haja risco forte.
  const terrain = evidencias?.terreno
  const exposureVerified = Boolean(
    area && terrain?.fonte && terrain.qualidade === 'boa' &&
    terrain.posicaoTopografica === 'baixa' &&
    terrain.conectividadeHidrologica === 'confirmada',
  )
  const peak3h = previsao?.pico3hMm
  const peakGate = typeof peak3h === 'number' && Number.isFinite(peak3h) &&
    peak3h >= (regra?.parametros.pico3hCriticoMm ?? Number.POSITIVE_INFINITY)
  const observedStrong = (nivelChuvaObservada ?? 0) >= 3
  const strongAllowed = exposureVerified &&
    (nivelChuvaObservada ?? 0) >= 2 &&
    ((nivelPrevisao ?? 0) >= 2 || observedStrong) &&
    (peakGate || observedStrong)
  const strongDowngraded = classified?.nivel === 'atencao_forte_experimental' && !strongAllowed
  const finalLevel = strongDowngraded ? 'atencao_experimental' : classified?.nivel ?? 'sem_sinal_experimental'

  return {
    status: missing.length ? 'dados_insuficientes' : classified ? 'sinal_experimental' : 'sem_sinal_experimental',
    nivel: missing.length ? 'dados_insuficientes' : finalLevel,
    motivo: missing.length ? missing.join(' ') : strongDowngraded
      ? 'A triangulação da chuva não autoriza atenção forte: faltam comprovação de terreno baixo, conectividade hidrológica e corroboração meteorológica suficiente. Não é previsão de alagamento do imóvel.'
      : classified
      ? `A regra ${classified.id} foi atingida com ${rain.estacoes.length === 1 ? 'a medição da estação mais próxima' : `a chuva interpolada entre ${rain.estacoes.length} estações`} e a suscetibilidade ${area!.classe} que contém o ponto. Isso não confirma alagamento.`
      : 'Com os critérios da regra publicada, a combinação de suscetibilidade e chuva não atingiu uma faixa de atenção. Isso não significa ausência de risco.',
    chuvaObservadaMm: rain.chuvaObservadaMm,
    chuvaFuturaMm,
    nivelChuva,
    nivelSuscetibilidade: typeof levelS === 'number' ? levelS : null,
    suporteEspacial: rain.suporteEspacial,
    estacoes: rain.estacoes,
    regraVersao: regra?.versao ?? null,
    motorVersao: TRIANGULACAO_VERSAO,
  }
}
