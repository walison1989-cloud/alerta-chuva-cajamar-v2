/**
 * Contrato da análise preventiva experimental.
 *
 * A classificação NÃO é alerta oficial e NÃO é probabilidade de alagamento.
 * Chuva observada (CEMADEN), previsão (Open-Meteo) e suscetibilidade
 * cartográfica (SGB/CPRM + IPT) permanecem dimensões separadas.
 */

export type AvaliacaoNivel =
  | 'dados_insuficientes'
  | 'sem_sinal_experimental'
  | 'atencao_experimental'
  | 'atencao_forte_experimental'

export type AvaliacaoOrigem = 'imovel' | 'regiao'

export type EvidenciaTipo =
  | 'suscetibilidade'
  | 'chuva_observada'
  | 'previsao'
  | 'qualidade_dado'
  | 'ocorrencia'
  | 'localizacao'

export type MotivoDimensao =
  | 'localizacao'
  | 'suscetibilidade'
  | 'chuva_observada'
  | 'previsao'
  | 'qualidade_dado'

export interface FaixaNivel {
  nivel: number
  min: number
  max: number | null
}

export interface RegraMatriz {
  id: string
  minSuscetibilidade: number
  minChuva: number
  nivel: AvaliacaoNivel
  avisoAreaNaoMapeada: boolean
}

export interface ParametrosRegra {
  frescorMaxHoras: number
  raioSuscetibilidadeM: number
  raioEstacoesKm: number
  raioPreferencialEstacoesKm: number
  limiteEstacoes: number
  faixasObservado24hMm: FaixaNivel[]
  faixasPrevisao24hMm: FaixaNivel[]
  suscetibilidadeNiveis: Record<string, number>
  regras: RegraMatriz[]
  limitacoes: string[]
  /** Limiar EXPLÍCITO e experimental para concentração da previsão (não calibrado localmente). */
  pico3hCriticoMm?: number | null
}

export interface RegraAvaliacaoPublica {
  id: number
  versao: string
  motorVersao: string
  titulo: string
  descricao: string
  parametros: ParametrosRegra
  aviso: string
  vigenteDe: string
  vigenteAte: string | null
  criadaEm: string
}

export interface AreaSuscetibilidadeEvidencia {
  id: number
  cartografiaSlug: string
  tipo: string
  classe: string
  classeOrdem: number | null
  processo: string
  areaHa: number
  contemPonto: boolean
  distanciaM: number
}

export interface EstacaoEvidencia {
  idEstacao: number | null
  nome: string
  codigo: string
  municipio: string | null
  distanciaKm: number | null
  chuva24hMm: number | null
  dataHora: string | null
  coletadoEm: string | null
  tipoMedicao: string | null
  janelaHoras: number | null
  qualidade: string | null
  fonte: string | null
  temLeitura: boolean
  idadeHoras: number | null
  desatualizada: boolean
}

export interface ColetaEvidencia {
  fonte: string
  status: string | null
  ultimaTentativaEm: string | null
  ultimaConclusaoEm: string | null
  ultimoSucessoEm: string | null
  payloadAtualizadoEm: string | null
  estacoesNoRaio: number | null
  medicoesGravadas: number | null
  mensagemPublica: string | null
  idadePayloadHoras: number | null
}

export interface OcorrenciaEvidencia {
  id: number
  tipo: string
  descricao: string | null
  bairro: string | null
  verificadoEm: string | null
  distanciaM: number
}

export interface CartografiaEvidencia {
  id: number
  slug: string
  titulo: string
  fonte: string
  editor: string
  escala: string
  anoPublicacao: number | null
  urlItem: string
}

export interface ResumoChuva {
  totalEstacoes: number
  comLeitura: number
  frescas: number
  frescasAte10km: number
  max24hMm: number | null
  maxAte10kmMm: number | null
  mediana24hMm: number | null
  estacaoReferencia: {
    codigo: string
    nome: string
    distanciaKm: number
    chuva24hMm: number
    dataHora: string
  } | null
}

export interface PacoteEvidencias {
  temEndereco: boolean
  localizacaoValida: boolean
  municipio: string | null
  bairro: string | null
  precisao: string | null
  cartografia: CartografiaEvidencia | null
  suscetibilidadeDisponivel: boolean
  suscetibilidade: AreaSuscetibilidadeEvidencia[]
  estacoes: EstacaoEvidencia[]
  resumoChuva: ResumoChuva
  coleta: ColetaEvidencia | null
  ocorrencias: OcorrenciaEvidencia[]
  geradoEm: string
  /** Informação opcional de terreno. Nunca preencher por inferência de proximidade. */
  terreno?: EvidenciaTerreno | null
}

/**
 * Evidência de terreno precisa vir de cálculo no ponto e análise hidrológica.
 * Elevação relativa a uma média local, isoladamente, NÃO prova conectividade.
 */
export interface EvidenciaTerreno {
  fonte: string
  qualidade: 'boa' | 'limitada' | 'sem_dados'
  altitudeM?: number | null
  elevacaoRelativaM: number | null
  declividadeGraus: number | null
  posicaoTopografica: 'baixa' | 'elevada' | 'indefinida'
  conectividadeHidrologica: 'confirmada' | 'descartada' | 'desconhecida'
}

/**
 * Resumo da previsão no momento da avaliação. É o único dado que não vem
 * persistido do banco: a Open-Meteo é consultada no navegador e o resumo
 * usado fica registrado na execução.
 */
export interface PrevisaoResumo {
  fonte: string
  precipMm24h: number | null
  /** Maior acumulado em janelas móveis, calculado da série horária original. */
  pico3hMm?: number | null
  pico6hMm?: number | null
  probabilidadeMaxPct: number | null
  fetchedAt: number | null
  referenciaEm: string | null
  timezone: string | null
}

export interface MotivoAvaliacao {
  codigo: string
  dimensao: MotivoDimensao
  descricao: string
  evidencias: string[]
}

export interface DadoAusente {
  codigo: string
  descricao: string
  fonte: string | null
}

export interface DadoDesatualizado {
  codigo: string
  descricao: string
  fonte: string
  idadeHoras: number | null
  limiteHoras: number | null
  referenciaEm: string | null
}

export interface DimensoesAvaliacao {
  suscetibilidade: number
  chuvaObservada: number
  previsao: number
  /**
   * Maior magnitude entre `chuvaObservada` (24 h passadas) e `previsao`
   * (próximas 24 h), em mm/24 h. É um envelope conservador de duas janelas
   * distintas, não uma soma nem um total de 48 h.
   */
  chuvaCombinada: number
}

export interface ResultadoAvaliacao {
  nivel: AvaliacaoNivel
  nivelOrdem: number
  titulo: string
  resumo: string
  explicacao: string
  motivos: MotivoAvaliacao[]
  dadosAusentes: DadoAusente[]
  dadosDesatualizados: DadoDesatualizado[]
  limitacoes: string[]
  dimensoes: DimensoesAvaliacao
  areaPrincipal: AreaSuscetibilidadeEvidencia | null
  estacaoReferencia: EstacaoEvidencia | null
  areaNaoMapeada: boolean
  /** Diagnóstico informativo; não é probabilidade nem alerta oficial. */
  diagnostico?: {
    exposicao: 'confirmada' | 'nao_confirmada' | 'indeterminada'
    sinalMeteorologico: 'observado' | 'previsto' | 'ambos' | 'sem_sinal'
    pico3hMm: number | null
    pico6hMm: number | null
    justificativa: string
  }
  classificacao: {
    regraId: string | null
    minSuscetibilidade: number | null
    minChuva: number | null
  }
}

export interface EntradaMotor {
  /** Instante da avaliação em milissegundos. */
  agora: number
  origem: AvaliacaoOrigem
  municipio: string | null
  bairro: string | null
  regiao: string | null
  regra: RegraAvaliacaoPublica | null
  evidencias: PacoteEvidencias | null
  previsao: PrevisaoResumo | null
  previsaoErro: string | null
  previsaoEmCache: boolean
  motorVersao: string
}

export interface AvaliacaoPreventiva {
  geradoEm: string
  origem: AvaliacaoOrigem
  municipio: string | null
  bairro: string | null
  regiao: string | null
  regra: RegraAvaliacaoPublica | null
  evidencias: PacoteEvidencias | null
  previsao: PrevisaoResumo | null
  previsaoEmCache: boolean
  resultado: ResultadoAvaliacao
}

export interface EvidenciaRegistro {
  tipo: EvidenciaTipo
  fonte: string
  referencia_id: string | null
  rotulo: string
  valor_num: number | null
  valor_texto: string | null
  unidade: string | null
  distancia_m: number | null
  contido: boolean | null
  medido_em: string | null
  coletado_em: string | null
  qualidade: string | null
  desatualizado: boolean
  detalhes: Record<string, unknown>
}

export interface ResultadoRegistro {
  nivel: AvaliacaoNivel
  nivel_ordem: number
  titulo: string
  resumo: string
  explicacao: string
  motivos: MotivoAvaliacao[]
  dados_ausentes: DadoAusente[]
  dados_desatualizados: DadoDesatualizado[]
  limitacoes: string[]
}

export interface PayloadRegistro {
  origem: AvaliacaoOrigem
  municipio: string | null
  bairro: string | null
  regiao: string | null
  regra_versao: string
  motor_versao: string
  hash_entrada: string
  gerado_em: string
  dimensoes: DimensoesAvaliacao
  metadados: Record<string, unknown>
  evidencias: EvidenciaRegistro[]
  resultado: ResultadoRegistro
}

export interface HistoricoAvaliacao {
  id: string
  iniciadaEm: string
  origem: AvaliacaoOrigem
  municipio: string | null
  bairro: string | null
  regiao: string | null
  regraVersao: string
  motorVersao: string
  nivel: AvaliacaoNivel
  nivelOrdem: number
  titulo: string
  resumo: string
  motivos: MotivoAvaliacao[]
  dadosAusentes: DadoAusente[]
  dadosDesatualizados: DadoDesatualizado[]
  totalEvidencias: number
}

export interface PreviaNotificacao {
  id: number
  titulo: string
  corpo: string
  criadaEm: string
}
