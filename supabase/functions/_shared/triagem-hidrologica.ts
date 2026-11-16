/**
 * Motor de TRIAGEM hidrometeorológica, versão 0.1.0. Não produz eventos de
 * inundação confirmada nem probabilidade de alagamento. Parâmetros de aviso
 * experimental (não calibrados em uma bacia específica de Cajamar).
 */
export const TRIAGEM_VERSAO = 'triagem-hidro-0.1.0'
export type Processo = 'inundacao' | 'enxurrada'
export type Nivel = 'dados_insuficientes' | 'sem_sinal_meteorologico' | 'atencao_meteorologica' | 'atencao_experimental'
export interface AreaContida { tipo: Processo; classe: string; distancia_m?: number }
export interface DadosTriagem {
  chuvaObservada24hMm: number | null
  previsao24hMm: number | null
  picoPrevisto3hMm: number | null
  chuvaAtualModeloMm: number | null
  codigoTempoAtual: number | null
  areasContidas: AreaContida[]
}
export interface TriagemResultado {
  versao: string
  nivel: Nivel
  processos: Processo[]
  chuvaAgora: boolean | null
  sinalForte: boolean
  confianca: 'limitada' | 'incompleta'
  riscoConfirmado: false
  podeEnviarAlertaAlagamento: false
  motivos: string[]
}
const valid = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
const chuvaCodes = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99])
export function classificarTriagem(d: DadosTriagem): TriagemResultado {
  const processos = [...new Set(d.areasContidas.filter(a=>a.tipo==='inundacao'||a.tipo==='enxurrada').map(a=>a.tipo))]
  const chuvaAgora = valid(d.chuvaAtualModeloMm) || (typeof d.codigoTempoAtual === 'number' && Number.isFinite(d.codigoTempoAtual))
    ? (valid(d.chuvaAtualModeloMm) && d.chuvaAtualModeloMm > 0) || chuvaCodes.has(d.codigoTempoAtual ?? -1)
    : null
  const obs = valid(d.chuvaObservada24hMm) ? d.chuvaObservada24hMm : null
  const prev = valid(d.previsao24hMm) ? d.previsao24hMm : null
  const pico = valid(d.picoPrevisto3hMm) ? d.picoPrevisto3hMm : null
  const motivos: string[] = []
  if (obs===null) motivos.push('Triangulação CEMADEN 24 h indisponível ou sem cobertura espacial válida.')
  if (prev===null) motivos.push('Previsão horária válida indisponível.')
  if (processos.length===0) motivos.push('Nenhum polígono oficial contém o ponto; proximidade não é exposição comprovada.')
  if (processos.includes('enxurrada')) motivos.push('A carta indica suscetibilidade a enxurrada, mas faltam vazão e chuva observada de curta duração para confirmar perigo.')
  const sinalForte = (obs!==null && obs>=30) || (prev!==null && prev>=30) || (pico!==null && pico>=20)
  const sinalModerado = sinalForte || (obs!==null && obs>=5) || (prev!==null && prev>=5) || (pico!==null && pico>=5)
  let nivel: Nivel = 'dados_insuficientes'
  if (obs!==null && prev!==null) {
    nivel = sinalModerado ? (processos.length ? 'atencao_experimental' : 'atencao_meteorologica') : 'sem_sinal_meteorologico'
  } else if (sinalModerado) {
    nivel = 'atencao_meteorologica'
  }
  if (chuvaAgora === true) motivos.push('A grade Open-Meteo indica precipitação no intervalo atual; não é medição no imóvel.')
  if (nivel==='sem_sinal_meteorologico') motivos.push('Não foram atingidos os limites experimentais de chuva acumulada ou prevista; não significa ausência de alagamento.')
  if (nivel==='atencao_experimental') motivos.push('Há sinal meteorológico e polígono oficial contendo o ponto; não há prova de conectividade hidráulica, drenagem ou inundação.')
  if (nivel==='atencao_meteorologica') motivos.push('Há sinal de chuva relevante, sem confirmação hidrológica do endereço.')
  return {
    versao:TRIAGEM_VERSAO,nivel,processos,chuvaAgora,sinalForte,
    confianca: obs!==null && prev!==null ? 'limitada':'incompleta',
    riscoConfirmado:false,podeEnviarAlertaAlagamento:false,motivos,
  }
}
