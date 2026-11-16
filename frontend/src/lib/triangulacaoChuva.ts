import type { RainStation } from '@/types/rain'
import type {
  AvaliacaoNivel,
  PrevisaoResumo,
  RegraAvaliacaoPublica,
  PacoteEvidencias,
} from '@/types/avaliacaoPreventiva'
import { classificarFaixaExperimental, MOTOR_VERSAO, previsaoEstaFresca } from '@/lib/avaliacaoPreventiva'

export const TRIANGULACAO_VERSAO = 'triangulacao-gps-estacoes-ativas-v4'
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
  metodo: 'triangulo' | 'direta' | 'indisponivel'
  justificativa: string
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

/**
 * Interpolação linear no triângulo, em coordenadas métricas locais.
 * Só é utilizada se o imóvel estiver dentro das três estações (não extrapola).
 */
function pesosTriangulo(
  ponto: PontoAnalise, a: PontoAnalise, b: PontoAnalise, c: PontoAnalise,
): [number, number, number] | null {
  const cos = Math.cos(ponto.latitude * Math.PI / 180)
  const xy = (p: PontoAnalise) => [
    (p.longitude - ponto.longitude) * 111.195 * cos,
    (p.latitude - ponto.latitude) * 111.195,
  ] as const
  const [ax, ay] = xy(a), [bx, by] = xy(b), [cx, cy] = xy(c)
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  // Área muito pequena/estações quase alinhadas: interpolação instável.
  if (Math.abs(den) < 0.05) return null
  const u = ((by - cy) * -cx + (cx - bx) * -cy) / den
  const v = ((cy - ay) * -cx + (ax - cx) * -cy) / den
  const w = 1 - u - v
  if (Math.min(u, v, w) < -1e-9) return null
  const adjusted = [Math.max(0, u), Math.max(0, v), Math.max(0, w)]
  const total = adjusted[0]! + adjusted[1]! + adjusted[2]!
  return [adjusted[0]! / total, adjusted[1]! / total, adjusted[2]! / total]
}

export interface ChuvaTriangulada24h {
  chuvaObservadaMm: number | null
  suporteEspacial: boolean
  /** 'direta' representa medição a até 100 m do ponto; não uma triangulação. */
  metodo: 'triangulo' | 'direta' | 'indisponivel'
  justificativa: string
  estacoes: LeituraTriangulada['estacoes']
}

/**
 * Usa exatamente três estações cercando o imóvel, com acumulados de 24 h,
 * sem misturar janelas e leituras antigas. O resultado é observação espacial
 * estimada, NÃO precipitação futura nem probabilidade de alagamento.
 */
export function triangularChuva24h(
  ponto: PontoAnalise,
  estacoes: RainStation[],
  agora: number,
): ChuvaTriangulada24h {
  const empty = (justificativa: string): ChuvaTriangulada24h => ({
    chuvaObservadaMm: null,
    suporteEspacial: false,
    metodo: 'indisponivel',
    justificativa,
    estacoes: [],
  })
  if (!coordenadaValida(ponto) || !Number.isFinite(agora)) {
    return empty('Localização ou horário inválido.')
  }
  const candidates = estacoes.flatMap((station) => {
    // Regra de elegibilidade: exige status explícito de ativa + validada.
    // Um catálogo ou payload antigo sem os sinalizadores NÃO entra na conta.
    if (station.active !== true || station.validated !== true) return []
    if (station.catalogueOnly || station.source.trim().toUpperCase() !== 'CEMADEN') return []
    if (station.measurementType !== 'acumulado_24h' || station.windowHours !== 24 || station.unit !== 'mm') return []
    if (station.quality !== 'oficial') return []
    if (station.accumulatedMm === null || !Number.isFinite(station.accumulatedMm) || station.accumulatedMm < 0) return []
    if (!coordenadaValida(station)) return []
    const timestamp = station.lastReadingAt ? Date.parse(station.lastReadingAt) : NaN
    if (!Number.isFinite(timestamp) || timestamp > agora || agora - timestamp > 6 * 3_600_000) return []
    const distance = distanciaKm(ponto, station)
    if (distance > RAIO_MAX_KM) return []
    return [{ station, timestamp, distance }]
  }).sort((a, b) => b.timestamp - a.timestamp || a.distance - b.distance)

  const byCode = new Map<string, typeof candidates[number]>()
  for (const item of candidates) {
    if (!byCode.has(item.station.code)) byCode.set(item.station.code, item)
  }
  const colocated = new Set<string>()
  const valid = [...byCode.values()]
    .sort((a, b) => a.distance - b.distance)
    .filter((item) => {
      const key = `${item.station.latitude.toFixed(5)},${item.station.longitude.toFixed(5)}`
      if (colocated.has(key)) return false
      colocated.add(key)
      return true
    })

  const direct = valid.find((item) => item.distance <= 0.1)
  if (direct) return {
    chuvaObservadaMm: direct.station.accumulatedMm,
    suporteEspacial: true,
    metodo: 'direta',
    justificativa: 'Medição de uma estação a até 100 m do ponto; não é triangulação.',
    estacoes: [{
      codigo: direct.station.code,
      nome: direct.station.name,
      chuvaMm: direct.station.accumulatedMm!,
      distanciaKm: direct.distance,
      peso: 1,
      dataHora: direct.station.lastReadingAt!,
    }],
  }
  // Partimos do GPS confirmado, ordenamos por DISTÂNCIA e expandimos
  // até 18 estações ativas com leituras válidas. As três mais próximas
  // isoladamente podem estar do mesmo lado: escolhemos então o menor
  // triângulo envolvente, sem extrapolar a chuva fora dele.
  const pool = valid.slice(0, 18)
  if (pool.length < 3) return empty('Há menos de três pluviômetros válidos próximos ao imóvel.')
  type Candidate = typeof pool[number]
  let selected: {
    items: [Candidate, Candidate, Candidate]
    weights: [number, number, number]
    /** Menor raio necessário para abranger três estações do triângulo. */
    farthestKm: number
    /** Desempate: menor distância GPS→estações somada. */
    sumKm: number
  } | null = null
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const a = pool[i]!, b = pool[j]!, c = pool[k]!
        const farthest = Math.max(a.distance, b.distance, c.distance)
        // Com a topografia complexa de Cajamar, interpolação muito distante
        // não deve ser tratada como medida representativa do lote.
        if (farthest > 15) continue
        if (Math.max(a.timestamp, b.timestamp, c.timestamp) - Math.min(a.timestamp, b.timestamp, c.timestamp) > JANELA_ALINHAMENTO_MS) continue
        const weights = pesosTriangulo(ponto, a.station, b.station, c.station)
        if (!weights) continue
        const sumKm = a.distance + b.distance + c.distance
        // Primeiro o triângulo cujo pluviômetro MAIS distante está mais perto
        // do GPS; em empate, a menor soma das distâncias.
        if (!selected || farthest < selected.farthestKm - 1e-9 ||
          (Math.abs(farthest - selected.farthestKm) <= 1e-9 && sumKm < selected.sumKm)) {
          selected = { items: [a, b, c], weights, farthestKm: farthest, sumKm }
        }
      }
    }
  }
  if (!selected) return empty('As estações válidas não formam um triângulo próximo e alinhado no tempo envolvendo este endereço.')
  const mm = selected.items.reduce((total, item, index) => total + item.station.accumulatedMm! * selected!.weights[index]!, 0)
  const amounts = selected.items.map((item) => item.station.accumulatedMm!)
  const variation = Math.max(...amounts) - Math.min(...amounts)
  const mean = amounts.reduce((sum, value) => sum + value, 0) / 3
  // Heterogeneidade forte de pancadas convectivas: mostrar referência,
  // mas não alimentar decisões de risco como se a chuva fosse conhecida.
  const highlyVariable = variation > 35 && variation > 1.5 * Math.max(5, mean)
  return {
    chuvaObservadaMm: Math.round(mm * 10) / 10,
    suporteEspacial: !highlyVariable,
    metodo: 'triangulo',
    justificativa: highlyVariable
      ? 'As três estações divergem muito na chuva registrada; estimativa apenas indicativa, sem segurança para classificar o imóvel.'
      : 'Estimativa com o triângulo válido mais próximo do GPS confirmado, formado por três estações CEMADEN ativas e validadas. Não é medição no imóvel.',
    estacoes: selected.items.map((item, index) => ({
      codigo: item.station.code,
      nome: item.station.name,
      chuvaMm: item.station.accumulatedMm!,
      distanciaKm: item.distance,
      peso: selected!.weights[index]!,
      dataHora: item.station.lastReadingAt!,
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
  if (!rain.suporteEspacial || rain.chuvaObservadaMm === null) missing.push(rain.justificativa)
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
    metodo: rain.metodo,
    justificativa: rain.justificativa,
    estacoes: rain.estacoes,
    regraVersao: regra?.versao ?? null,
    motorVersao: TRIANGULACAO_VERSAO,
  }
}
