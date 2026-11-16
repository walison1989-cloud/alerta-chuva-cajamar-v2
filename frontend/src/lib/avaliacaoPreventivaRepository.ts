import type { SupabaseClient } from '@supabase/supabase-js'
import { CONSULTA_PADRAO } from '@/lib/avaliacaoPreventiva'
import type {
  AvaliacaoNivel,
  AvaliacaoOrigem,
  DadoAusente,
  DadoDesatualizado,
  FaixaNivel,
  HistoricoAvaliacao,
  MotivoAvaliacao,
  MotivoDimensao,
  ParametrosRegra,
  PacoteEvidencias,
  EvidenciaTerreno,
  PayloadRegistro,
  PreviaNotificacao,
  RegraAvaliacaoPublica,
  RegraMatriz,
} from '@/types/avaliacaoPreventiva'

export class AvaliacaoPreventivaRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvaliacaoPreventivaRepositoryError'
  }
}

export interface ConsultaEvidenciasOpcoes {
  raioSuscetibilidadeM?: number
  raioEstacoesKm?: number
  limiteEstacoes?: number
}

const NIVEIS: AvaliacaoNivel[] = [
  'dados_insuficientes',
  'sem_sinal_experimental',
  'atencao_experimental',
  'atencao_forte_experimental',
]

const DIMENSOES: MotivoDimensao[] = [
  'localizacao',
  'suscetibilidade',
  'chuva_observada',
  'previsao',
  'qualidade_dado',
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function readText(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readInteger(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = readNumber(source, key)
  return value === null ? null : Math.trunc(value)
}

function readTimestamp(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = readText(source, key)
  if (!value) return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = source[key]
  return typeof value === 'boolean' ? value : null
}

function parseArray<T>(
  value: unknown,
  parser: (row: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => parser(item))
    .filter((item): item is T => item !== null)
}

function parseFaixas(value: unknown): FaixaNivel[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const faixas: FaixaNivel[] = []
  for (const item of value) {
    const source = asRecord(item)
    if (!source) return null
    const nivel = readInteger(source, 'nivel')
    const min = readNumber(source, 'min')
    if (nivel === null || nivel < 0 || min === null || min < 0) return null

    let max: number | null = null
    if (source.max !== null && source.max !== undefined) {
      max = readNumber(source, 'max')
      if (max === null || max < min) return null
    }
    faixas.push({ nivel, min, max })
  }
  return faixas.sort((left, right) => left.min - right.min)
}

function parseRegras(value: unknown): RegraMatriz[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const regras: RegraMatriz[] = []
  for (const item of value) {
    const source = asRecord(item)
    if (!source) return null
    const id = readText(source, 'id')
    const minSuscetibilidade = readInteger(source, 'min_suscetibilidade')
    const minChuva = readInteger(source, 'min_chuva')
    const nivel = readText(source, 'nivel') as AvaliacaoNivel | null
    if (!id || minSuscetibilidade === null || minChuva === null) return null
    if (!nivel || !NIVEIS.includes(nivel)) return null
    if (
      minSuscetibilidade < 0 ||
      minSuscetibilidade > 3 ||
      minChuva < 0 ||
      minChuva > 3
    ) {
      return null
    }
    regras.push({
      id,
      minSuscetibilidade,
      minChuva,
      nivel,
      avisoAreaNaoMapeada: readBoolean(source, 'aviso_area_nao_mapeada') === true,
    })
  }
  return regras
}

function parseSuscetibilidadeNiveis(
  value: unknown,
): Record<string, number> | null {
  const source = asRecord(value)
  if (!source) return null
  const entries = Object.entries(source)
    .map(([classe, nivel]) => [classe, typeof nivel === 'number' ? nivel : null] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== null)
  if (entries.length === 0) return null
  return Object.fromEntries(
    entries.filter(([, nivel]) => Number.isFinite(nivel) && nivel >= 0),
  )
}

function parseLimitacoes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseParametros(value: unknown): ParametrosRegra | null {
  const source = asRecord(value)
  if (!source) return null

  const frescorMaxHoras = readNumber(source, 'frescor_max_horas')
  const raioSuscetibilidadeM = readNumber(source, 'raio_suscetibilidade_m')
  const raioEstacoesKm = readNumber(source, 'raio_estacoes_km')
  const raioPreferencialEstacoesKm = readNumber(
    source,
    'raio_preferencial_estacoes_km',
  )
  const limiteEstacoes = readInteger(source, 'limite_estacoes')
  const faixasObservado24hMm = parseFaixas(
    source.faixas_observado_24h_mm,
  )
  const faixasPrevisao24hMm = parseFaixas(source.faixas_previsao_24h_mm)
  const suscetibilidadeNiveis = parseSuscetibilidadeNiveis(
    source.suscetibilidade_niveis,
  )
  const regras = parseRegras(source.regras)

  if (
    frescorMaxHoras === null ||
    frescorMaxHoras <= 0 ||
    frescorMaxHoras > 72 ||
    raioSuscetibilidadeM === null ||
    raioSuscetibilidadeM < 0 ||
    raioEstacoesKm === null ||
    raioEstacoesKm <= 0 ||
    raioPreferencialEstacoesKm === null ||
    raioPreferencialEstacoesKm <= 0 ||
    limiteEstacoes === null ||
    limiteEstacoes <= 0 ||
    !faixasObservado24hMm ||
    !faixasPrevisao24hMm ||
    !suscetibilidadeNiveis ||
    !regras
  ) {
    return null
  }

  return {
    frescorMaxHoras,
    raioSuscetibilidadeM,
    raioEstacoesKm,
    raioPreferencialEstacoesKm,
    limiteEstacoes,
    faixasObservado24hMm,
    faixasPrevisao24hMm,
    suscetibilidadeNiveis,
    regras,
    limitacoes: parseLimitacoes(source.limitacoes),
    pico3hCriticoMm: readNumber(source, 'pico_3h_critico_mm'),
  }
}

export function mapRegraAvaliacaoRow(
  row: unknown,
): RegraAvaliacaoPublica | null {
  const source = asRecord(row)
  if (!source) return null

  const id = readInteger(source, 'id')
  const versao = readText(source, 'versao')
  const motorVersao = readText(source, 'motor_versao')
  const titulo = readText(source, 'titulo')
  const descricao = readText(source, 'descricao')
  const aviso = readText(source, 'aviso')
  const vigenteDe = readTimestamp(source, 'vigente_de')
  const parametros = parseParametros(source.parametros)

  if (
    id === null ||
    !versao ||
    !motorVersao ||
    !titulo ||
    !descricao ||
    !aviso ||
    !vigenteDe ||
    !parametros
  ) {
    return null
  }

  return {
    id,
    versao,
    motorVersao,
    titulo,
    descricao,
    parametros,
    aviso,
    vigenteDe,
    vigenteAte: readTimestamp(source, 'vigente_ate'),
    criadaEm: readTimestamp(source, 'criada_em') ?? vigenteDe,
  }
}

function parseArea(row: unknown) {
  const source = asRecord(row)
  if (!source) return null
  const id = readInteger(source, 'id')
  const cartografiaSlug = readText(source, 'cartografia_slug')
  const tipo = readText(source, 'tipo')
  const classe = readText(source, 'classe')
  const processo = readText(source, 'processo')
  const areaHa = readNumber(source, 'area_ha')
  const distanciaM = readNumber(source, 'distancia_m')

  if (id === null || !tipo || !classe || distanciaM === null) return null

  return {
    id,
    cartografiaSlug: cartografiaSlug ?? '',
    tipo,
    classe,
    classeOrdem: readInteger(source, 'classe_ordem'),
    processo: processo ?? '',
    areaHa: areaHa ?? 0,
    contemPonto: source.contem_ponto === true,
    distanciaM,
  }
}

function parseEstacao(row: unknown) {
  const source = asRecord(row)
  if (!source) return null
  const codigo = readText(source, 'codigo')
  const nome = readText(source, 'nome')
  if (!codigo || !nome) return null

  const chuva = readNumber(source, 'chuva_24h_mm')
  const temLeituraFlag = readBoolean(source, 'tem_leitura')
  const temLeitura = temLeituraFlag ?? chuva !== null

  return {
    idEstacao: readInteger(source, 'id_estacao'),
    nome,
    codigo,
    municipio: readText(source, 'municipio'),
    distanciaKm: readNumber(source, 'distancia_km'),
    chuva24hMm: temLeitura ? chuva : null,
    dataHora: readTimestamp(source, 'data_hora'),
    coletadoEm: readTimestamp(source, 'coletado_em'),
    tipoMedicao: readText(source, 'tipo_medicao'),
    janelaHoras: readInteger(source, 'janela_horas'),
    qualidade: readText(source, 'qualidade'),
    fonte: readText(source, 'fonte'),
    temLeitura,
    idadeHoras: readNumber(source, 'idade_horas'),
    desatualizada: source.desatualizada === true,
  }
}

function parseColeta(row: unknown) {
  const source = asRecord(row)
  if (!source) return null
  const fonte = readText(source, 'fonte')
  if (!fonte) return null

  return {
    fonte,
    status: readText(source, 'status'),
    ultimaTentativaEm: readTimestamp(source, 'ultima_tentativa_em'),
    ultimaConclusaoEm: readTimestamp(source, 'ultima_conclusao_em'),
    ultimoSucessoEm: readTimestamp(source, 'ultimo_sucesso_em'),
    payloadAtualizadoEm: readTimestamp(source, 'payload_atualizado_em'),
    estacoesNoRaio: readInteger(source, 'estacoes_no_raio'),
    medicoesGravadas: readInteger(source, 'medicoes_gravadas'),
    mensagemPublica: readText(source, 'mensagem_publica'),
    idadePayloadHoras: readNumber(source, 'idade_payload_horas'),
  }
}

function parseOcorrencia(row: unknown) {
  const source = asRecord(row)
  if (!source) return null
  const id = readInteger(source, 'id')
  const tipo = readText(source, 'tipo')
  const distanciaM = readNumber(source, 'distancia_m')
  if (id === null || !tipo || distanciaM === null) return null

  return {
    id,
    tipo,
    descricao: readText(source, 'descricao'),
    bairro: readText(source, 'bairro'),
    verificadoEm: readTimestamp(source, 'verificado_em'),
    distanciaM,
  }
}

function parseCartografia(row: unknown) {
  const source = asRecord(row)
  if (!source) return null
  const id = readInteger(source, 'id')
  const slug = readText(source, 'slug')
  const titulo = readText(source, 'titulo')
  if (id === null || !slug || !titulo) return null

  return {
    id,
    slug,
    titulo,
    fonte: readText(source, 'fonte') ?? '',
    editor: readText(source, 'editor') ?? '',
    escala: readText(source, 'escala') ?? '',
    anoPublicacao: readInteger(source, 'ano_publicacao'),
    urlItem: readText(source, 'url_item') ?? '',
  }
}

function parseResumoChuva(value: unknown) {
  const source = asRecord(value)
  const referencia = asRecord(source?.estacao_referencia)
  return {
    totalEstacoes: source ? (readInteger(source, 'total_estacoes') ?? 0) : 0,
    comLeitura: source ? (readInteger(source, 'com_leitura') ?? 0) : 0,
    frescas: source ? (readInteger(source, 'frescas') ?? 0) : 0,
    frescasAte10km: source ? (readInteger(source, 'frescas_ate_10km') ?? 0) : 0,
    max24hMm: source ? readNumber(source, 'max_24h_mm') : null,
    maxAte10kmMm: source ? readNumber(source, 'max_ate_10km_mm') : null,
    mediana24hMm: source ? readNumber(source, 'mediana_24h_mm') : null,
    estacaoReferencia: referencia
      ? (() => {
          const codigo = readText(referencia, 'codigo')
          const nome = readText(referencia, 'nome')
          const distanciaKm = readNumber(referencia, 'distancia_km')
          const chuva24hMm = readNumber(referencia, 'chuva_24h_mm')
          const dataHora = readTimestamp(referencia, 'data_hora')
          if (!codigo || !nome || distanciaKm === null || chuva24hMm === null || !dataHora) {
            return null
          }
          return { codigo, nome, distanciaKm, chuva24hMm, dataHora }
        })()
      : null,
  }
}

/**
 * Normaliza dados topográficos retornados pela RPC do Supabase. Altitude
 * absoluta não substitui elevação relativa ao escoamento. Nunca inferir
 * conectividade hidrológica de declividade ou distância em linha reta.
 * Um payload parcial não recebe qualidade "boa" por omissão.
 */
export function parseEvidenciaTerreno(value: unknown): EvidenciaTerreno | null {
  const source = asRecord(parseMaybeJson(value))
  if (!source) return null
  const fonte = readText(source, 'fonte')
  const rawQuality = readText(source, 'qualidade')
  if (!fonte) return null

  // Resposta REAL de public.terreno_motor2_no_ponto: chaves camelCase.
  const altitude = readNumber(source, 'altitudeM') ?? readNumber(source, 'altitude_m')
  const rel = readNumber(source, 'elevacaoRelativaM') ?? readNumber(source, 'elevacao_relativa_m')
  const slope = readNumber(source, 'declividadeGraus') ?? readNumber(source, 'declividade_graus')
  const lowThreshold = readNumber(source, 'limiarRelevoBaixoM')
  const position = readText(source, 'posicaoTopografica') ?? readText(source, 'posicao_topografica')
  const connectivity = readText(source, 'conectividadeHidrologica') ?? readText(source, 'conectividade_hidrologica')
  const validRel = rel !== null && rel >= -2000 && rel <= 2000
  const validSlope = slope !== null && slope >= 0 && slope <= 90
  const validAltitude = altitude !== null && altitude > -500 && altitude < 9000
  const posicaoTopografica = position === 'baixa' || position === 'elevada'
    ? position
    : validRel && lowThreshold !== null && rel <= lowThreshold ? 'baixa'
      : validRel && lowThreshold !== null && rel >= Math.abs(lowThreshold) ? 'elevada'
        : 'indefinida'
  // A função de terreno não fornece conectividade de drenagem. NÃO inferir.
  const conectividadeHidrologica = connectivity === 'confirmada' || connectivity === 'descartada'
    ? connectivity : 'desconhecida'
  const qualidade = rawQuality === 'boa' && validRel && validSlope && validAltitude
    ? 'boa'
    : (rawQuality === 'boa' || rawQuality === 'limitada') && (validRel || validAltitude)
      ? 'limitada' : 'sem_dados'
  return {
    fonte: fonte ?? 'Terreno Motor2 (sem leitura)',
    qualidade,
    altitudeM: validAltitude ? altitude : null,
    elevacaoRelativaM: validRel ? rel : null,
    declividadeGraus: validSlope ? slope : null,
    posicaoTopografica,
    conectividadeHidrologica,
  }
}

/**
 * Evidência lida no banco e diagnóstico de cobertura/permissões em separado.
 * Nunca concluir que o imóvel está seguro quando o MDT está indisponível.
 */
export interface ResultadoConsultaTerreno {
  terreno: EvidenciaTerreno | null
  diagnostico: string | null
}

export function diagnosticarRespostaTerreno(value: unknown): string | null {
  const source = asRecord(parseMaybeJson(value))
  if (!source) return 'O Supabase não retornou um resultado de terreno válido.'
  const qualidade = readText(source, 'qualidade')
  switch (qualidade) {
    case 'fora_cobertura':
      return 'O endereço está fora da cobertura do modelo de terreno de 5 m instalado. É necessário ampliar a cobertura topográfica; proximidade de área suscetível não substitui essa leitura.'
    case 'sem_dados':
      return 'O modelo de terreno não possui leitura válida para este ponto (célula sem dados ou bloco ausente).'
    case 'nao_instalado':
      return 'Não foi encontrado um perfil de terreno ativo no Supabase.'
    case 'ponto_invalido':
      return 'As coordenadas do endereço são inválidas. Confira a localização cadastrada.'
    case 'limitada':
      return 'A leitura topográfica está incompleta. O risco permanece condicionado aos demais dados disponíveis.'
    case 'boa':
      return null
    default:
      return 'A RPC de terreno retornou uma condição não reconhecida. Confira a função instalada no Supabase.'
  }
}

export async function fetchTerrenoComDiagnosticoNoPonto(
  client: SupabaseClient,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<ResultadoConsultaTerreno> {
  const builder = client.rpc('terreno_motor2_no_ponto', {
    p_latitude: latitude,
    p_longitude: longitude,
  })
  if (signal) builder.abortSignal(signal)
  const { data, error } = await builder
  if (error) {
    const code = error.code ?? ''
    const message = (error.message ?? '').toLowerCase()
    if (code === '42501' || message.includes('permission denied')) {
      throw new AvaliacaoPreventivaRepositoryError(
        'A leitura de terreno foi bloqueada por permissão no Supabase. Confira o acesso EXECUTE da função para authenticated.',
      )
    }
    if (code === 'PGRST202' || code === '42883' || message.includes('could not find the function')) {
      throw new AvaliacaoPreventivaRepositoryError(
        'A função terreno_motor2_no_ponto não está acessível na API do Supabase. Verifique schema, assinatura e permissões.',
      )
    }
    throw new AvaliacaoPreventivaRepositoryError(
      'Falha ao consultar o terreno no Supabase (código ' + (code || 'não informado') + '). Consulte Network → rpc/terreno_motor2_no_ponto.',
    )
  }

  const terreno = parseEvidenciaTerreno(data)
  const diagnostico = diagnosticarRespostaTerreno(data)
  if (terreno?.qualidade === 'boa' && terreno.elevacaoRelativaM !== null) {
    return { terreno, diagnostico: null }
  }
  return {
    terreno,
    diagnostico: diagnostico ?? 'A consulta retornou terreno incompleto; não foi possível obter a elevação relativa.',
  }
}

/** Compatibilidade para consumidores que necessitam apenas dos valores. */
export async function fetchTerrenoNoPonto(
  client: SupabaseClient,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<EvidenciaTerreno | null> {
  const resposta = await fetchTerrenoComDiagnosticoNoPonto(client, latitude, longitude, signal)
  return resposta.terreno
}

/**
 * Normaliza o JSONB devolvido pelas RPCs de evidências. Rejeita payload que
 * não seja objeto, mas mantém listas vazias quando a fonte não tem dados.
 */
export function normalizePacoteEvidencias(
  value: unknown,
): PacoteEvidencias | null {
  const source = asRecord(parseMaybeJson(value))
  if (!source) return null

  return {
    temEndereco: source.tem_endereco === true,
    localizacaoValida: source.localizacao_valida === true,
    municipio: readText(source, 'municipio'),
    bairro: readText(source, 'bairro'),
    precisao: readText(source, 'precisao'),
    cartografia: parseCartografia(source.cartografia),
    suscetibilidadeDisponivel: source.suscetibilidade_disponivel === true,
    suscetibilidade: parseArray(source.suscetibilidade, parseArea).slice(0, 50),
    estacoes: parseArray(source.estacoes, parseEstacao).slice(0, 50),
    resumoChuva: parseResumoChuva(source.resumo_chuva),
    coleta: parseColeta(source.coleta),
    ocorrencias: parseArray(source.ocorrencias, parseOcorrencia).slice(0, 50),
    geradoEm: readTimestamp(source, 'gerado_em') ?? new Date().toISOString(),
    terreno: parseEvidenciaTerreno(source.terreno),
  }
}

function traduzirErroRpc(message: string, fallback: string): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('does not exist') ||
    normalized.includes('could not find the function') ||
    normalized.includes('schema cache')
  ) {
    return 'A migration da Etapa 5.2 ainda não está disponível no Supabase. Aplique as migrations antes de usar a análise preventiva.'
  }
  if (normalized.includes('autenticacao_obrigatoria')) {
    return 'Entre na sua conta para registrar ou consultar avaliações do imóvel.'
  }
  if (normalized.includes('endereco_obrigatorio')) {
    return 'Cadastre um endereço com localização antes de registrar uma avaliação do imóvel.'
  }
  if (normalized.includes('regra_nao_publicada')) {
    return 'A regra experimental não está publicada e vigente. Nenhum resultado foi registrado.'
  }
  if (normalized.includes('coordenadas_nao_permitidas')) {
    return 'O registro foi recusado porque o payload continha coordenadas. A avaliação não deve armazenar a localização do imóvel.'
  }
  if (normalized.includes('nivel_invalido') || normalized.includes('resultado_incompleto')) {
    return 'O resultado não corresponde ao formato aceito pelo servidor. Nada foi registrado.'
  }
  if (normalized.includes('execucao_nao_encontrada')) {
    return 'A avaliação não foi encontrada para este usuário.'
  }
  return fallback
}

export async function fetchRegraAvaliacaoPublica(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<RegraAvaliacaoPublica | null> {
  const builder = client
    .from('vw_regras_avaliacao_publicas')
    .select('*')
    .limit(1)
  if (signal) builder.abortSignal(signal)

  const { data, error } = await builder
  if (error) {
    throw new AvaliacaoPreventivaRepositoryError(
      traduzirErroRpc(
        error.message,
        'Não foi possível consultar a regra experimental publicada. Verifique a conexão e se a migration da Etapa 5.2 foi aplicada.',
      ),
    )
  }

  const row = ((data ?? []) as unknown[])[0]
  if (!row) return null
  const regra = mapRegraAvaliacaoRow(row)
  if (!regra) {
    throw new AvaliacaoPreventivaRepositoryError(
      'A regra experimental publicada tem formato incompatível com esta versão do motor. Nenhuma classificação será gerada.',
    )
  }
  return regra
}

export async function fetchEvidenciasDoMorador(
  client: SupabaseClient,
  options: ConsultaEvidenciasOpcoes = {},
  signal?: AbortSignal,
): Promise<PacoteEvidencias> {
  const builder = client.rpc('evidencias_avaliacao_do_morador', {
    p_raio_suscetibilidade_m:
      options.raioSuscetibilidadeM ?? CONSULTA_PADRAO.raioSuscetibilidadeM,
    p_raio_estacoes_km:
      options.raioEstacoesKm ?? CONSULTA_PADRAO.raioEstacoesKm,
    p_limite_estacoes:
      options.limiteEstacoes ?? CONSULTA_PADRAO.limiteEstacoes,
  })
  if (signal) builder.abortSignal(signal)

  const { data, error } = await builder
  if (error) {
    throw new AvaliacaoPreventivaRepositoryError(
      traduzirErroRpc(
        error.message,
        'Não foi possível obter as evidências do imóvel. Verifique a conexão, o endereço e a migration da Etapa 5.2.',
      ),
    )
  }

  const pacote = normalizePacoteEvidencias(data)
  if (!pacote) {
    throw new AvaliacaoPreventivaRepositoryError(
      'O servidor devolveu um pacote de evidências em formato inválido.',
    )
  }
  return pacote
}

export async function fetchEvidenciasNoPonto(
  client: SupabaseClient,
  latitude: number,
  longitude: number,
  options: ConsultaEvidenciasOpcoes = {},
  signal?: AbortSignal,
): Promise<PacoteEvidencias> {
  const builder = client.rpc('evidencias_avaliacao_no_ponto', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_raio_suscetibilidade_m:
      options.raioSuscetibilidadeM ?? CONSULTA_PADRAO.raioSuscetibilidadeM,
    p_raio_estacoes_km:
      options.raioEstacoesKm ?? CONSULTA_PADRAO.raioEstacoesKm,
    p_limite_estacoes:
      options.limiteEstacoes ?? CONSULTA_PADRAO.limiteEstacoes,
  })
  if (signal) builder.abortSignal(signal)

  const { data, error } = await builder
  if (error) {
    throw new AvaliacaoPreventivaRepositoryError(
      traduzirErroRpc(
        error.message,
        'Não foi possível obter as evidências da região de referência. Verifique a conexão e a migration da Etapa 5.2.',
      ),
    )
  }

  const pacote = normalizePacoteEvidencias(data)
  if (!pacote) {
    throw new AvaliacaoPreventivaRepositoryError(
      'O servidor devolveu um pacote de evidências em formato inválido.',
    )
  }
  return pacote
}

export async function registrarAvaliacaoPreventiva(
  client: SupabaseClient,
  payload: PayloadRegistro,
): Promise<string> {
  const { data, error } = await client.rpc('registrar_avaliacao_preventiva', {
    p_entrada: payload,
  })
  if (error) {
    throw new AvaliacaoPreventivaRepositoryError(
      traduzirErroRpc(
        error.message,
        'Não foi possível registrar a avaliação. Nada foi gravado.',
      ),
    )
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new AvaliacaoPreventivaRepositoryError(
      'O servidor não devolveu o identificador da avaliação registrada.',
    )
  }
  return data
}

function parseMotivos(value: unknown): MotivoAvaliacao[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const source = asRecord(item)
    if (!source) return []
    const codigo = readText(source, 'codigo')
    const dimensao = readText(source, 'dimensao') as MotivoDimensao | null
    const descricao = readText(source, 'descricao')
    if (!codigo || !dimensao || !descricao) return []
    const evidencias = Array.isArray(source.evidencias)
      ? source.evidencias.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : []
    return [
      {
        codigo,
        dimensao: DIMENSOES.includes(dimensao) ? dimensao : 'qualidade_dado',
        descricao,
        evidencias,
      },
    ]
  })
}

function parseDadosAusentes(value: unknown): DadoAusente[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const source = asRecord(item)
    if (!source) return []
    const codigo = readText(source, 'codigo')
    const descricao = readText(source, 'descricao')
    if (!codigo || !descricao) return []
    return [{ codigo, descricao, fonte: readText(source, 'fonte') }]
  })
}

function parseDadosDesatualizados(value: unknown): DadoDesatualizado[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const source = asRecord(item)
    if (!source) return []
    const codigo = readText(source, 'codigo')
    const descricao = readText(source, 'descricao')
    const fonte = readText(source, 'fonte')
    if (!codigo || !descricao || !fonte) return []
    return [
      {
        codigo,
        descricao,
        fonte,
        idadeHoras: readNumber(source, 'idadeHoras'),
        limiteHoras: readNumber(source, 'limiteHoras'),
        referenciaEm: readTimestamp(source, 'referenciaEm'),
      },
    ]
  })
}

export async function fetchHistoricoAvaliacoes(
  client: SupabaseClient,
  limit = 20,
  signal?: AbortSignal,
): Promise<HistoricoAvaliacao[]> {
  const builder = client.rpc('historico_avaliacoes_preventivas', {
    p_limite: limit,
  })
  if (signal) builder.abortSignal(signal)

  const { data, error } = await builder
  if (error) {
    throw new AvaliacaoPreventivaRepositoryError(
      traduzirErroRpc(
        error.message,
        'Não foi possível carregar o histórico de avaliações.',
      ),
    )
  }

  return ((data ?? []) as unknown[]).flatMap((row) => {
    const source = asRecord(row)
    if (!source) return []
    const id = readText(source, 'id')
    const iniciadaEm = readTimestamp(source, 'iniciada_em')
    const origem = readText(source, 'origem') as AvaliacaoOrigem | null
    const regraVersao = readText(source, 'regra_versao')
    const motorVersao = readText(source, 'motor_versao')
    const nivel = readText(source, 'nivel') as AvaliacaoNivel | null
    const nivelOrdem = readInteger(source, 'nivel_ordem')
    const titulo = readText(source, 'titulo')
    const resumo = readText(source, 'resumo')
    const totalEvidencias = readInteger(source, 'total_evidencias')

    if (
      !id ||
      !iniciadaEm ||
      (origem !== 'imovel' && origem !== 'regiao') ||
      !regraVersao ||
      !motorVersao ||
      !nivel ||
      !NIVEIS.includes(nivel) ||
      nivelOrdem === null ||
      !titulo ||
      !resumo
    ) {
      return []
    }

    return [
      {
        id,
        iniciadaEm,
        origem,
        municipio: readText(source, 'municipio'),
        bairro: readText(source, 'bairro'),
        regiao: readText(source, 'regiao'),
        regraVersao,
        motorVersao,
        nivel,
        nivelOrdem,
        titulo,
        resumo,
        motivos: parseMotivos(source.motivos),
        dadosAusentes: parseDadosAusentes(source.dados_ausentes),
        dadosDesatualizados: parseDadosDesatualizados(
          source.dados_desatualizados,
        ),
        totalEvidencias: totalEvidencias ?? 0,
      },
    ]
  })
}

export async function criarPreviaNotificacaoInterna(
  client: SupabaseClient,
  execucaoId: string,
): Promise<PreviaNotificacao> {
  const { data, error } = await client.rpc(
    'criar_previa_notificacao_interna',
    { p_execucao_id: execucaoId },
  )
  if (error) {
    throw new AvaliacaoPreventivaRepositoryError(
      traduzirErroRpc(
        error.message,
        'Não foi possível gerar a prévia interna. Nenhum aviso foi enviado.',
      ),
    )
  }

  const row = ((data ?? []) as unknown[])[0]
  const source = asRecord(row)
  if (!source) {
    throw new AvaliacaoPreventivaRepositoryError(
      'O servidor não devolveu a prévia interna.',
    )
  }
  const id = readInteger(source, 'id')
  const titulo = readText(source, 'titulo')
  const corpo = readText(source, 'corpo')
  const criadaEm = readTimestamp(source, 'criada_em')
  if (id === null || !titulo || !corpo || !criadaEm) {
    throw new AvaliacaoPreventivaRepositoryError(
      'A prévia interna veio em formato inválido.',
    )
  }
  return { id, titulo, corpo, criadaEm }
}
