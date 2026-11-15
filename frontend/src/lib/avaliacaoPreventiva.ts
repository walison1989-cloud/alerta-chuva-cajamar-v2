import { canonicalJson, sha256Hex } from '@/lib/canonicalHash'
import { formatDateTime, formatMm, formatPercent } from '@/lib/format'
import type {
  AvaliacaoNivel,
  AvaliacaoPreventiva,
  AreaSuscetibilidadeEvidencia,
  DadoAusente,
  DadoDesatualizado,
  DimensoesAvaliacao,
  EntradaMotor,
  EstacaoEvidencia,
  EvidenciaRegistro,
  MotivoAvaliacao,
  ParametrosRegra,
  PayloadRegistro,
  PrevisaoResumo,
  RegraMatriz,
  ResultadoAvaliacao,
} from '@/types/avaliacaoPreventiva'

/** Versão do código que interpreta `parametros`. Precisa casar com a regra. */
export const MOTOR_VERSAO = '1.1.0'

/**
 * Parâmetros usados apenas para consultar as RPCs e listar dados ausentes
 * quando a regra publicada não pôde ser lida. Nunca classificam sozinhos.
 */
export const CONSULTA_PADRAO = {
  frescorMaxHoras: 6,
  raioSuscetibilidadeM: 500,
  raioEstacoesKm: 30,
  raioPreferencialEstacoesKm: 10,
  limiteEstacoes: 10,
} as const

type NivelTone = 'neutral' | 'attention' | 'alert'

export const AVALIACAO_NIVEL_META: Record<
  AvaliacaoNivel,
  { label: string; ordem: number; tone: NivelTone; description: string }
> = {
  dados_insuficientes: {
    label: 'Dados insuficientes',
    ordem: 0,
    tone: 'neutral',
    description:
      'Falta base mínima para uma leitura experimental. Nenhuma classificação é afirmada.',
  },
  sem_sinal_experimental: {
    label: 'Sem sinal experimental',
    ordem: 1,
    tone: 'neutral',
    description:
      'Os dados disponíveis não atingiram nenhum critério desta versão. Não significa ausência de risco.',
  },
  atencao_experimental: {
    label: 'Atenção experimental',
    ordem: 2,
    tone: 'attention',
    description:
      'Combinação experimental que merece leitura preventiva. Não é previsão de alagamento.',
  },
  atencao_forte_experimental: {
    label: 'Atenção forte experimental',
    ordem: 3,
    tone: 'alert',
    description:
      'Evidências meteorológicas e exposição física convergentes; não é alerta oficial nem confirmação de alagamento.',
  },
}

export const AVALIACAO_LIMITACOES_BASE = [
  'A classificação é experimental e não é alerta oficial.',
  'Não há estimativa de probabilidade de alagamento.',
  'A dimensão de chuva usa a maior magnitude entre o acumulado observado das 24 h passadas e a previsão para as próximas 24 h. Os valores não são somados e não representam um total de 48 h.',
  'O resultado não substitui a Defesa Civil (199) nem os canais oficiais.',
  'Sem dados verificados de altitude relativa, drenagem e conectividade hidrológica, a classificação forte por imóvel fica bloqueada.',
  'A carta oficial identifica áreas de suscetibilidade, não o perigo atual do imóvel. A proximidade nunca confirma exposição.',
]

const CLASSE_LABEL: Record<string, string> = {
  Alta: 'Alta',
  Media: 'Média',
  Baixa: 'Baixa',
  Enxurrada: 'Enxurrada',
}

function classeLabel(classe: string): string {
  return CLASSE_LABEL[classe] ?? classe
}

function tipoLabel(tipo: string): string {
  return tipo === 'inundacao' ? 'inundação' : tipo === 'enxurrada' ? 'enxurrada' : tipo
}

export function formatMetrosAvaliacao(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'distância não informada'
  if (value < 1000) return `${Math.round(value)} m`
  return `${(value / 1000).toFixed(1).replace('.', ',')} km`
}

export function formatDistanciaKmAvaliacao(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'distância não informada'
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} km`
}

export function formatIdadeHoras(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'idade não informada'
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} h`
}

export function classificarFaixaExperimental(
  value: number | null,
  faixas: { nivel: number; min: number; max: number | null }[],
): number {
  if (value === null || !Number.isFinite(value) || value < 0) return 0
  const ordered = [...faixas].sort((left, right) => left.min - right.min)
  let nivel = 0
  for (const faixa of ordered) {
    if (value >= faixa.min) nivel = faixa.nivel
  }
  return Math.max(0, Math.min(3, Math.trunc(nivel)))
}

export function calcularIdadeHoras(
  timestamp: string | null,
  agora: number,
): number | null {
  if (!timestamp) return null
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, (agora - parsed) / 3_600_000)
}

export function estacaoEstaFresca(
  estacao: EstacaoEvidencia,
  frescorHoras: number,
  agora: number,
): boolean {
  if (!estacao.temLeitura) return false
  if (
    estacao.chuva24hMm === null ||
    !Number.isFinite(estacao.chuva24hMm) ||
    estacao.chuva24hMm < 0
  ) {
    return false
  }
  if (!estacao.dataHora) return false
  const timestamp = Date.parse(estacao.dataHora)
  if (Number.isNaN(timestamp)) return false
  return timestamp <= agora && agora - timestamp <= frescorHoras * 3_600_000
}

export function previsaoEstaFresca(
  previsao: PrevisaoResumo | null,
  frescorHoras: number,
  agora: number,
): boolean {
  if (!previsao) return false
  if (
    previsao.precipMm24h === null ||
    !Number.isFinite(previsao.precipMm24h) ||
    previsao.precipMm24h < 0
  ) {
    return false
  }
  if (previsao.fetchedAt === null || !Number.isFinite(previsao.fetchedAt)) {
    return false
  }
  return previsao.fetchedAt <= agora && agora - previsao.fetchedAt <= frescorHoras * 3_600_000
}

function nivelSuscetibilidade(
  classe: string,
  parametros: ParametrosRegra | null,
): number {
  const value = parametros?.suscetibilidadeNiveis[classe]
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0
}

function escolherAreaPrincipal(
  areas: AreaSuscetibilidadeEvidencia[],
  parametros: ParametrosRegra | null,
): AreaSuscetibilidadeEvidencia | null {
  if (areas.length === 0) return null
  // Preferir a classe mais alta que contém o ponto. Áreas vizinhas são
  // apenas contexto cartográfico e jamais elevam a classe do imóvel.
  const contidas = areas.filter((area) => area.contemPonto)
  const candidatas = contidas.length ? contidas : areas
  return [...candidatas].sort((left, right) => {
    if (!contidas.length) return left.distanciaM - right.distanciaM
    const level = nivelSuscetibilidade(right.classe, parametros) - nivelSuscetibilidade(left.classe, parametros)
    return level !== 0 ? level : left.distanciaM - right.distanciaM
  })[0] ?? null
}

function escolherEstacaoReferencia(
  frescas: EstacaoEvidencia[],
  raioPreferencialKm: number,
): EstacaoEvidencia | null {
  if (frescas.length === 0) return null
  const preferenciais = frescas.filter(
    (estacao) =>
      estacao.distanciaKm !== null &&
      estacao.distanciaKm <= raioPreferencialKm,
  )
  const candidatas = preferenciais.length > 0 ? preferenciais : frescas
  // A estação mais chuvosa não é necessariamente representativa do endereço:
  // usar o menor afastamento como referência, sem inferir conexão hidrológica.
  return [...candidatas].sort((left, right) =>
    (left.distanciaKm ?? Number.POSITIVE_INFINITY) -
    (right.distanciaKm ?? Number.POSITIVE_INFINITY)
  )[0] ?? null
}

function descreverSuscetibilidade(
  area: AreaSuscetibilidadeEvidencia | null,
  areaNaoMapeada: boolean,
): string {
  if (areaNaoMapeada) {
    return 'nenhuma área de suscetibilidade mapeada no raio'
  }
  if (!area) return 'suscetibilidade não disponível'
  return `suscetibilidade ${classeLabel(area.classe)} ${
    area.contemPonto
      ? 'no ponto'
      : `a ${formatMetrosAvaliacao(area.distanciaM)} do ponto`
  }`
}

function descreverChuva(
  estacao: EstacaoEvidencia | null,
  previsao: PrevisaoResumo | null,
  previsaoFresca: boolean,
): string {
  const partes: string[] = []
  if (estacao) {
    partes.push(
      `chuva observada de ${formatMm(estacao.chuva24hMm ?? 0)} em 24 h`,
    )
  }
  if (previsaoFresca && previsao && previsao.precipMm24h !== null) {
    partes.push(
      `previsão de ${formatMm(previsao.precipMm24h)} para as próximas 24 h`,
    )
  }
  return partes.length > 0 ? partes.join(' e ') : 'sem sinal de chuva disponível'
}

function unirLimitacoes(parametros: ParametrosRegra | null): string[] {
  return Array.from(
    new Set([...AVALIACAO_LIMITACOES_BASE, ...(parametros?.limitacoes ?? [])]),
  )
}

function timestampOuNulo(value: string | null): string | null {
  if (!value) return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

/**
 * Executa a regra experimental. Função pura: recebe evidências já coletadas e
 * não faz chamadas de rede nem persiste nada. A mesma entrada gera a mesma
 * avaliação (exceto pelo instante `agora`).
 */
export function avaliarPreventivamente(
  entrada: EntradaMotor,
): AvaliacaoPreventiva {
  const geradoEm = new Date(entrada.agora).toISOString()
  const regra = entrada.regra
  const parametros = regra?.parametros ?? null
  const frescorHoras = parametros?.frescorMaxHoras ?? CONSULTA_PADRAO.frescorMaxHoras
  const raioPreferencial =
    parametros?.raioPreferencialEstacoesKm ??
    CONSULTA_PADRAO.raioPreferencialEstacoesKm
  const raioSuscetibilidade =
    parametros?.raioSuscetibilidadeM ?? CONSULTA_PADRAO.raioSuscetibilidadeM

  const dadosAusentes: DadoAusente[] = []
  const dadosDesatualizados: DadoDesatualizado[] = []
  const motivos: MotivoAvaliacao[] = []
  const bloqueios = new Set<string>()

  const addAusente = (item: DadoAusente, bloqueante = true): void => {
    if (!dadosAusentes.some((existente) => existente.codigo === item.codigo)) {
      dadosAusentes.push(item)
    }
    if (bloqueante) bloqueios.add(item.codigo)
  }

  const addDesatualizado = (item: DadoDesatualizado): void => {
    if (
      !dadosDesatualizados.some(
        (existente) =>
          existente.codigo === item.codigo &&
          existente.referenciaEm === item.referenciaEm,
      )
    ) {
      dadosDesatualizados.push(item)
    }
  }

  if (!regra) {
    addAusente({
      codigo: 'regra_publicada',
      descricao:
        'Nenhuma regra experimental publicada e vigente foi encontrada no banco.',
      fonte: 'sistema',
    })
  } else if (regra.motorVersao !== entrada.motorVersao) {
    addAusente({
      codigo: 'motor_incompativel',
      descricao: `A regra ${regra.versao} exige o motor ${regra.motorVersao}, mas esta aplicação executa ${entrada.motorVersao}.`,
      fonte: 'sistema',
    })
  }

  const evidencias = entrada.evidencias
  if (!evidencias) {
    addAusente({
      codigo: 'evidencias',
      descricao:
        'O pacote de evidências espaciais e pluviométricas não pôde ser obtido.',
      fonte: 'sistema',
    })
  } else {
    if (!evidencias.localizacaoValida) {
      addAusente({
        codigo: 'localizacao',
        descricao:
          'A localização analisada não é válida. Cadastre um endereço ou use a região de referência.',
        fonte: 'sistema',
      })
    }
    if (entrada.origem === 'imovel' && !evidencias.temEndereco) {
      addAusente({
        codigo: 'endereco',
        descricao:
          'O usuário não possui endereço cadastrado com localização para a análise do imóvel.',
        fonte: 'sistema',
      })
    }
    if (
      !evidencias.suscetibilidadeDisponivel ||
      !evidencias.cartografia
    ) {
      addAusente({
        codigo: 'cartografia',
        descricao:
          'A carta oficial de suscetibilidade não está publicada ou não pôde ser consultada.',
        fonte: 'SGB/CPRM + IPT',
      })
    } else if (evidencias.suscetibilidade.length === 0) {
      motivos.push({
        codigo: 'suscetibilidade_sem_area',
        dimensao: 'suscetibilidade',
        descricao: `Nenhuma área oficial de suscetibilidade foi encontrada no raio de ${raioSuscetibilidade} m. A carta pode não cobrir o ponto; isso não significa ausência de risco.`,
        evidencias: [],
      })
    }
  }

  const estacoes = evidencias?.estacoes ?? []
  const estacoesFrescas = estacoes.filter((estacao) =>
    estacaoEstaFresca(estacao, frescorHoras, entrada.agora),
  )
  const estacaoReferencia = escolherEstacaoReferencia(
    estacoesFrescas,
    raioPreferencial,
  )

  if (estacoesFrescas.length === 0) {
    addAusente({
      codigo: 'chuva_observada_fresca',
      descricao: `Nenhuma estação com acumulado de 24 h e leitura de até ${frescorHoras} h foi encontrada.`,
      fonte: 'CEMADEN',
    })
  }

  for (const estacao of estacoes
    .filter(
      (item) =>
        item.temLeitura &&
        item.chuva24hMm !== null &&
        !estacaoEstaFresca(item, frescorHoras, entrada.agora),
    )
    .slice(0, 10)) {
    const idade =
      estacao.idadeHoras ??
      calcularIdadeHoras(estacao.dataHora, entrada.agora)
    addDesatualizado({
      codigo: 'chuva_observada_desatualizada',
      descricao: `A estação ${estacao.nome} tem leitura de ${formatDateTime(estacao.dataHora)} (${formatIdadeHoras(idade)}), acima do limite de ${frescorHoras} h desta regra.`,
      fonte: estacao.fonte ?? 'CEMADEN',
      idadeHoras: idade,
      limiteHoras: frescorHoras,
      referenciaEm: estacao.dataHora,
    })
  }

  const previsaoFresca = previsaoEstaFresca(
    entrada.previsao,
    frescorHoras,
    entrada.agora,
  )
  if (!entrada.previsao || entrada.previsao.precipMm24h === null) {
    addAusente({
      codigo: 'previsao',
      descricao:
        entrada.previsaoErro ??
        'A previsão de chuva para as próximas 24 h não está disponível.',
      fonte: 'Open-Meteo',
    })
  } else if (!previsaoFresca) {
    const idade = entrada.previsao.fetchedAt
      ? Math.max(0, (entrada.agora - entrada.previsao.fetchedAt) / 3_600_000)
      : null
    addDesatualizado({
      codigo: 'previsao_desatualizada',
      descricao: `A previsão da Open-Meteo foi consultada em ${formatDateTime(entrada.previsao.fetchedAt)} (${formatIdadeHoras(idade)}), acima do limite de ${frescorHoras} h desta regra.`,
      fonte: 'Open-Meteo',
      idadeHoras: idade,
      limiteHoras: frescorHoras,
      referenciaEm: entrada.previsao.referenciaEm,
    })
    addAusente({
      codigo: 'previsao_fresca',
      descricao: `A previsão disponível está desatualizada para o limite de ${frescorHoras} h.`,
      fonte: 'Open-Meteo',
    })
  }

  if (!evidencias?.coleta) {
    addAusente(
      {
        codigo: 'coleta_cemaden',
        descricao:
          'Não há registro público da coleta CEMADEN mais recente para exibir a situação da fonte.',
        fonte: 'CEMADEN',
      },
      false,
    )
  } else if (
    evidencias.coleta.idadePayloadHoras !== null &&
    evidencias.coleta.idadePayloadHoras > frescorHoras
  ) {
    addDesatualizado({
      codigo: 'coleta_cemaden_desatualizada',
      descricao: `O arquivo do CEMADEN foi atualizado há ${formatIdadeHoras(evidencias.coleta.idadePayloadHoras)}, acima do limite de ${frescorHoras} h desta regra.`,
      fonte: 'CEMADEN',
      idadeHoras: evidencias.coleta.idadePayloadHoras,
      limiteHoras: frescorHoras,
      referenciaEm: evidencias.coleta.payloadAtualizadoEm,
    })
  }

  const areaPrincipal = escolherAreaPrincipal(
    evidencias?.suscetibilidade ?? [],
    parametros,
  )
  const areaNoPonto = areaPrincipal?.contemPonto ? areaPrincipal : null
  const suscetibilidade = areaNoPonto
    ? nivelSuscetibilidade(areaNoPonto.classe, parametros)
    : 0
  if (evidencias?.suscetibilidadeDisponivel && evidencias.cartografia && !areaNoPonto) {
    addAusente({
      codigo: 'exposicao_espacial_nao_confirmada',
      descricao: 'A carta não contém o ponto analisado. Áreas próximas não demonstram exposição do imóvel; verificar altimetria relativa, drenagem e conectividade hidrológica.',
      fonte: 'SGB/CPRM + IPT',
    }, false) // Falta exposição do lote, mas um sinal meteorológico intenso pode merecer atenção REGIONAL.
  }
  const areaNaoMapeada = Boolean(
    evidencias?.suscetibilidadeDisponivel &&
      evidencias.cartografia &&
      evidencias.suscetibilidade.length === 0,
  )
  const chuvaObservada = estacaoReferencia
    ? classificarFaixaExperimental(
        estacaoReferencia.chuva24hMm,
        parametros?.faixasObservado24hMm ?? [],
      )
    : 0
  const previsao = previsaoFresca
    ? classificarFaixaExperimental(
        entrada.previsao?.precipMm24h ?? null,
        parametros?.faixasPrevisao24hMm ?? [],
      )
    : 0
  // Envelope conservador entre duas janelas distintas de 24 h (passado
  // observado e futuro previsto). Unidades compatíveis (mm/24 h), mas janelas
  // e suportes espaciais diferentes: nunca somar nem tratar como 48 h.
  const chuvaCombinada = Math.max(chuvaObservada, previsao)

  const dimensoes: DimensoesAvaliacao = {
    suscetibilidade,
    chuvaObservada,
    previsao,
    chuvaCombinada,
  }

  if (areaPrincipal) {
    motivos.push({
      codigo: areaPrincipal.contemPonto ? 'suscetibilidade_no_ponto' : 'suscetibilidade_apenas_proxima',
      dimensao: 'suscetibilidade',
      descricao: `A área cartográfica de referência é ${classeLabel(areaPrincipal.classe)} (${tipoLabel(areaPrincipal.tipo)}) ${
        areaPrincipal.contemPonto
          ? 'com o ponto contido na área'
          : `a ${formatMetrosAvaliacao(areaPrincipal.distanciaM)} do ponto`
      }.`,
      evidencias: [`area:${areaPrincipal.id}`],
    })
  }

  if (estacaoReferencia) {
    motivos.push({
      codigo: 'chuva_observada_referencia',
      dimensao: 'chuva_observada',
      descricao: `A estação de referência é ${estacaoReferencia.nome}, a ${formatDistanciaKmAvaliacao(estacaoReferencia.distanciaKm)}, com ${formatMm(estacaoReferencia.chuva24hMm ?? 0)} em 24 h.`,
      evidencias: [`estacao:${estacaoReferencia.codigo}`],
    })

    if (
      estacaoReferencia.distanciaKm !== null &&
      estacaoReferencia.distanciaKm > raioPreferencial
    ) {
      motivos.push({
        codigo: 'estacao_fora_raio_preferencial',
        dimensao: 'qualidade_dado',
        descricao: `Nenhuma estação fresca foi encontrada até ${raioPreferencial} km; a referência está mais distante e tem representatividade espacial menor.`,
        evidencias: [`estacao:${estacaoReferencia.codigo}`],
      })
    }
  }

  if (previsaoFresca && entrada.previsao) {
    motivos.push({
      codigo: 'previsao_modelada',
      dimensao: 'previsao',
      descricao: `A previsão da Open-Meteo indica ${formatMm(entrada.previsao.precipMm24h ?? 0)} nas próximas 24 h. Previsão não é chuva observada.`,
      evidencias: ['previsao:open-meteo'],
    })
  }

  let nivel: AvaliacaoNivel = 'dados_insuficientes'
  let regraAtingida: RegraMatriz | null = null

  // MOTOR 1.1.0: a matriz histórica é apenas uma proposta de nível. A
  // exposição real e a confirmação da chuva determinam os limites de segurança.
  // Suscetibilidade territorial NÃO é elevação relativa nem conexão com o rio.
  const terreno = evidencias?.terreno ?? null
  const terrenoConfiavel = Boolean(terreno?.fonte && terreno.qualidade === 'boa')
  const exposicaoConfirmada = Boolean(
    areaNoPonto && terrenoConfiavel &&
    terreno?.posicaoTopografica === 'baixa' &&
    terreno?.conectividadeHidrologica === 'confirmada',
  )
  const exposicaoDescartada = Boolean(
    terrenoConfiavel && terreno?.conectividadeHidrologica === 'descartada',
  )
  const pico3hMm = previsaoFresca &&
    typeof entrada.previsao?.pico3hMm === 'number' &&
    Number.isFinite(entrada.previsao.pico3hMm) && entrada.previsao.pico3hMm >= 0
      ? entrada.previsao.pico3hMm : null
  const pico6hMm = previsaoFresca &&
    typeof entrada.previsao?.pico6hMm === 'number' &&
    Number.isFinite(entrada.previsao.pico6hMm) && entrada.previsao.pico6hMm >= 0
      ? entrada.previsao.pico6hMm : null
  const observadaRelevante = chuvaObservada >= 2
  const previstaRelevante = previsao >= 2
  const picoCritico = parametros?.pico3hCriticoMm ?? null
  const concentracaoForte = pico3hMm !== null && picoCritico !== null &&
    picoCritico > 0 && pico3hMm >= picoCritico

  if (bloqueios.size === 0 && regra && parametros) {
    regraAtingida = parametros.regras.find(
      (candidata) =>
        suscetibilidade >= candidata.minSuscetibilidade &&
        chuvaCombinada >= candidata.minChuva,
    ) ?? null
    // Fora do polígono: proximidade NÃO entra no cálculo. Só chuva extrema
    // da matriz pode sinalizar atenção meteorológica REGIONAL, nunca ao lote.
    if (!areaNoPonto) {
      const chuvaForteRegional = parametros.regras.find(
        (r) => r.minSuscetibilidade === 0 && r.minChuva >= 3 &&
          chuvaCombinada >= r.minChuva,
      )
      regraAtingida = chuvaForteRegional ?? null
      nivel = chuvaForteRegional ? 'atencao_experimental' : 'dados_insuficientes'
      if (!chuvaForteRegional) {
        addAusente({
          codigo: 'exposicao_imovel_indeterminada',
          descricao: 'A área oficial é apenas vizinha ou não foi localizada no ponto. Sem análise altimétrica/hidrológica não é possível atribuir perigo de alagamento ao imóvel.',
          fonte: 'motor espacial',
        })
      }
    } else {
      nivel = regraAtingida?.nivel ?? 'sem_sinal_experimental'
      if (nivel === 'atencao_forte_experimental') {
        // Alerta forte sem chuva confirmada + exposição topográfica é o erro
        // detectado no print: 0mm observado, 25mm previstos, área a 457m.
        const evidenciasConvergentes = exposicaoConfirmada &&
          !exposicaoDescartada && observadaRelevante &&
          (previstaRelevante || chuvaObservada === 3) &&
          (concentracaoForte || chuvaObservada === 3)
        if (!evidenciasConvergentes) {
          nivel = 'atencao_experimental'
          regraAtingida = null // Não alegar que a regra forte foi atingida.
          motivos.push({
            codigo: 'forte_bloqueada_sem_corroboração',
            dimensao: 'qualidade_dado',
            descricao: 'A classificação forte foi bloqueada: são necessárias evidências convergentes de chuva observada, intensidade relevante e exposição topográfica/hidrológica confirmada. Chuva prevista não é chuva medida.',
            evidencias: [],
          })
        }
      }
      if (exposicaoDescartada && nivel !== 'sem_sinal_experimental') {
        // Descartada a conectividade fluvial, não inferir risco de inundação
        // dessa área. Outros processos (enxurrada/drenagem) seguem sem avaliação.
        nivel = 'dados_insuficientes'
        regraAtingida = null
        addAusente({
          codigo: 'outros_processos_nao_avaliados',
          descricao: 'A conexão hidrológica com a área mapeada foi descartada; ainda faltam dados para avaliar enxurrada e drenagem urbana.',
          fonte: 'terreno',
        })
      }
    }
  }
  const justificativaFisica = exposicaoConfirmada
    ? 'Ponto dentro de área mapeada, terreno baixo e conectividade hidrológica confirmados por fonte topográfica.'
    : exposicaoDescartada
      ? 'A conectividade com o corpo d’água foi descartada na evidência de terreno, sem excluir enxurradas ou falhas de drenagem.'
      : areaNoPonto
        ? 'Ponto dentro de polígono oficial, mas altitude relativa, posição e conexão hidráulica do imóvel não foram comprovadas.'
        : 'Área mapeada apenas próxima ou ausente; não há comprovação de que a água alcance o imóvel.'
  motivos.push({
    codigo: 'exposicao_fisica',
    dimensao: 'suscetibilidade',
    descricao: justificativaFisica,
    evidencias: areaNoPonto ? [`area:${areaNoPonto.id}`] : [],
  })
  if (pico3hMm !== null) {
    motivos.push({
      codigo: 'pico_chuva_3h',
      dimensao: 'previsao',
      descricao: `Maior acumulado previsto em 3 horas consecutivas: ${formatMm(pico3hMm)}. Isso é previsão, não medição nem limiar local validado.`,
      evidencias: ['previsao:open-meteo'],
    })
  }

  if (nivel === 'dados_insuficientes') {
    motivos.push({
      codigo: 'base_insuficiente',
      dimensao: 'qualidade_dado',
      descricao:
        dadosAusentes.length > 0
          ? `A classificação não foi aplicada porque faltam dados obrigatórios: ${dadosAusentes.map((item) => item.descricao).join(' ')}`
          : 'A classificação não foi aplicada porque a base mínima não foi confirmada.',
      evidencias: [],
    })
  } else if (nivel === 'sem_sinal_experimental') {
    motivos.push({
      codigo: 'sem_criterio_atingido',
      dimensao: 'qualidade_dado',
      descricao: `Nenhuma regra da versão ${regra?.versao ?? ''} foi atingida com suscetibilidade ${suscetibilidade} e maior magnitude de chuva ${chuvaCombinada} (observada nas 24 h passadas ou prevista para as próximas 24 h, sem soma). "Sem sinal" não significa "sem risco".`,
      evidencias: [],
    })
  } else if (regraAtingida) {
    motivos.push({
      codigo: 'criterio_atingido',
      dimensao: 'qualidade_dado',
      descricao: `Critério ${regraAtingida.id} atingido: suscetibilidade ${suscetibilidade} >= ${regraAtingida.minSuscetibilidade} e maior magnitude de chuva ${chuvaCombinada} >= ${regraAtingida.minChuva} (observada ou prevista, sem soma).`,
      evidencias: [],
    })
    if (regraAtingida.avisoAreaNaoMapeada && areaNaoMapeada) {
      motivos.push({
        codigo: 'area_nao_mapeada',
        dimensao: 'suscetibilidade',
        descricao:
          'O critério foi atingido sem área de suscetibilidade mapeada no raio. A carta pode não cobrir o ponto, o que aumenta a incerteza.',
        evidencias: [],
      })
    }
  }

  const meta = AVALIACAO_NIVEL_META[nivel]
  const descricaoS = descreverSuscetibilidade(areaPrincipal, areaNaoMapeada)
  const descricaoC = descreverChuva(
    estacaoReferencia,
    entrada.previsao,
    previsaoFresca,
  )

  const titulo = meta.label
  let resumo: string
  if (nivel === 'dados_insuficientes') {
    resumo =
      `Não há evidências suficientes para classificar perigo de alagamento neste imóvel. ${justificativaFisica} A chuva e a previsão disponíveis não comprovam inundação; a ausência de classificação também não garante segurança.`
  } else if (nivel === 'sem_sinal_experimental') {
    resumo = `A combinação de ${descricaoS} e ${descricaoC} não atingiu os critérios da versão ${regra?.versao ?? ''}. "Sem sinal" não significa "sem risco".`
  } else if (nivel === 'atencao_forte_experimental') {
    resumo = `Evidências convergentes de exposição física e chuva relevante atingiram os critérios fortes experimentais. ${descricaoC}. Isso não confirma alagamento nem é alerta oficial.`
  } else {
    resumo = `Sinal de acompanhamento: ${descricaoC}. ${justificativaFisica} A previsão isolada ou a proximidade de área suscetível não confirma alagamento.`
  }

  const referenciaLocal =
    entrada.origem === 'imovel'
      ? [entrada.bairro, entrada.municipio].filter(Boolean).join(' · ') ||
        'imóvel do morador'
      : entrada.regiao ?? entrada.municipio ?? 'região de referência'
  const origemTexto =
    entrada.origem === 'imovel' ? 'imóvel do morador' : 'região de referência'

  const areaTexto = !evidencias
    ? 'Suscetibilidade: pacote de evidências indisponível.'
    : !evidencias.suscetibilidadeDisponivel || !evidencias.cartografia
      ? 'Suscetibilidade: carta oficial indisponível.'
      : areaPrincipal
        ? `Suscetibilidade: ${classeLabel(areaPrincipal.classe)} (${tipoLabel(areaPrincipal.tipo)}) ${
            areaPrincipal.contemPonto
              ? 'no ponto'
              : `a ${formatMetrosAvaliacao(areaPrincipal.distanciaM)} do ponto`
          }; fonte ${evidencias.cartografia.fonte}, escala ${evidencias.cartografia.escala}.`
        : `Suscetibilidade: nenhuma área oficial mapeada no raio de ${raioSuscetibilidade} m; a carta pode não cobrir o ponto.`

  const chuvaTexto = estacaoReferencia
    ? `Chuva observada: ${formatMm(estacaoReferencia.chuva24hMm ?? 0)} em 24 h na estação ${estacaoReferencia.nome} (${formatDistanciaKmAvaliacao(estacaoReferencia.distanciaKm)}), leitura de ${formatDateTime(estacaoReferencia.dataHora)}.`
    : 'Chuva observada: nenhuma estação com leitura fresca e acumulado de 24 h.'

  const previsaoTexto =
    previsaoFresca && entrada.previsao && entrada.previsao.precipMm24h !== null
      ? `Previsão: ${formatMm(entrada.previsao.precipMm24h)} nas próximas 24 h pela Open-Meteo (${
          entrada.previsao.probabilidadeMaxPct === null
            ? 'probabilidade de precipitação não informada'
            : `probabilidade máxima de precipitação de ${formatPercent(entrada.previsao.probabilidadeMaxPct)}`
        }), consultada em ${formatDateTime(entrada.previsao.fetchedAt)}.`
      : entrada.previsaoErro
        ? `Previsão: indisponível (${entrada.previsaoErro}).`
        : 'Previsão: indisponível ou desatualizada.'

  const combinacaoTexto =
    'A regra compara as magnitudes do acumulado observado de 24 h e da previsão futura de 24 h, sem somá-las. A chuva observada é de estação e a previsão é modelada em grade. A classificação forte exige terreno baixo, conectividade confirmada e chuva observada relevante; nenhuma classe próxima equivale a risco do imóvel.'

  const ausentesTexto =
    dadosAusentes.length > 0
      ? `Dados ausentes: ${dadosAusentes.map((item) => item.descricao).join(' ')}`
      : 'Dados obrigatórios: nenhum dado obrigatório ausente.'
  const desatualizadosTexto =
    dadosDesatualizados.length > 0
      ? `Dados desatualizados: ${dadosDesatualizados.map((item) => item.descricao).join(' ')}`
      : 'Dados desatualizados: nenhuma fonte obrigatória desatualizada.'
  const motivosTexto =
    motivos.length > 0
      ? `Motivos registrados: ${motivos.map((item) => item.descricao).join(' ')}`
      : ''

  const explicacao = [
    `Avaliação experimental de ${origemTexto} em ${referenciaLocal}, gerada em ${formatDateTime(geradoEm)}.`,
    areaTexto,
    chuvaTexto,
    previsaoTexto,
    combinacaoTexto,
    ausentesTexto,
    desatualizadosTexto,
    `Regra ${regra?.versao ?? 'não publicada'} · motor ${entrada.motorVersao}.`,
    motivosTexto,
    'Esta leitura é experimental, não é alerta oficial e não é probabilidade de alagamento. Em emergência, ligue 199.',
  ]
    .filter((parte) => parte.length > 0)
    .join(' ')
    .slice(0, 7900)

  const resultado: ResultadoAvaliacao = {
    nivel,
    nivelOrdem: meta.ordem,
    titulo,
    resumo: resumo.slice(0, 1900),
    explicacao,
    motivos,
    dadosAusentes,
    dadosDesatualizados,
    limitacoes: unirLimitacoes(parametros),
    dimensoes,
    areaPrincipal,
    estacaoReferencia,
    areaNaoMapeada,
    diagnostico: {
      exposicao: exposicaoConfirmada ? 'confirmada' : exposicaoDescartada ? 'nao_confirmada' : 'indeterminada',
      sinalMeteorologico: chuvaObservada > 0 && previsao > 0 ? 'ambos' : chuvaObservada > 0 ? 'observado' : previsao > 0 ? 'previsto' : 'sem_sinal',
      pico3hMm,
      pico6hMm,
      justificativa: justificativaFisica,
    },
    classificacao: {
      regraId: regraAtingida?.id ?? null,
      minSuscetibilidade: regraAtingida?.minSuscetibilidade ?? null,
      minChuva: regraAtingida?.minChuva ?? null,
    },
  }

  return {
    geradoEm,
    origem: entrada.origem,
    municipio: entrada.municipio,
    bairro: entrada.bairro,
    regiao: entrada.regiao,
    regra,
    evidencias,
    previsao: entrada.previsao,
    previsaoEmCache: entrada.previsaoEmCache,
    resultado,
  }
}

/**
 * Converte a avaliação em evidências normalizadas para a RPC de registro.
 * Nenhuma coordenada é incluída.
 */
export function montarEvidenciasRegistro(
  avaliacao: AvaliacaoPreventiva,
): EvidenciaRegistro[] {
  const { evidencias, previsao, resultado, origem, municipio, bairro, regiao } =
    avaliacao
  const agora = Date.parse(avaliacao.geradoEm)
  const frescorHoras =
    avaliacao.regra?.parametros.frescorMaxHoras ??
    CONSULTA_PADRAO.frescorMaxHoras
  const parametros = avaliacao.regra?.parametros ?? null
  const lista: EvidenciaRegistro[] = []

  lista.push({
    tipo: 'localizacao',
    fonte: 'sistema',
    referencia_id: null,
    rotulo: origem === 'imovel' ? 'Imóvel do morador' : 'Região de referência',
    valor_num: null,
    valor_texto:
      [bairro, municipio, regiao].filter(Boolean).join(' · ') ||
      (origem === 'imovel' ? 'Imóvel do morador' : 'Região de referência'),
    unidade: null,
    distancia_m: null,
    contido: null,
    medido_em: null,
    coletado_em: avaliacao.geradoEm,
    qualidade: 'sistema',
    desatualizado: false,
    detalhes: {
      origem,
      tem_endereco: evidencias?.temEndereco ?? false,
      precisao: evidencias?.precisao ?? null,
      municipio,
      bairro,
      regiao,
    },
  })

  for (const area of (evidencias?.suscetibilidade ?? []).slice(0, 50)) {
    lista.push({
      tipo: 'suscetibilidade',
      fonte: evidencias?.cartografia?.fonte ?? 'SGB/CPRM + IPT',
      referencia_id: String(area.id),
      rotulo: `Suscetibilidade a ${tipoLabel(area.tipo)} — ${classeLabel(area.classe)}${
        area.contemPonto ? ' (ponto contido)' : ''
      }`.slice(0, 300),
      valor_num: area.areaHa,
      valor_texto: area.classe,
      unidade: 'ha',
      distancia_m: area.distanciaM,
      contido: area.contemPonto,
      medido_em: null,
      coletado_em: evidencias?.geradoEm ?? null,
      qualidade: 'oficial',
      desatualizado: false,
      detalhes: {
        tipo: area.tipo,
        classe: area.classe,
        classe_ordem: area.classeOrdem,
        processo: area.processo,
        area_ha: area.areaHa,
        cartografia_slug: area.cartografiaSlug,
        nivel_regra: nivelSuscetibilidade(area.classe, parametros),
      },
    })
  }

  for (const estacao of (evidencias?.estacoes ?? []).slice(0, 50)) {
    const fresca = estacaoEstaFresca(estacao, frescorHoras, agora)
    lista.push({
      tipo: 'chuva_observada',
      fonte: estacao.fonte ?? 'CEMADEN',
      referencia_id: estacao.codigo,
      rotulo: `Estação ${estacao.nome}`.slice(0, 300),
      valor_num: estacao.chuva24hMm,
      valor_texto:
        estacao.chuva24hMm === null ? 'Sem leitura válida' : null,
      unidade: 'mm',
      distancia_m:
        estacao.distanciaKm === null ? null : estacao.distanciaKm * 1000,
      contido: null,
      medido_em: timestampOuNulo(estacao.dataHora),
      coletado_em: timestampOuNulo(estacao.coletadoEm),
      qualidade: estacao.qualidade,
      desatualizado: !fresca,
      detalhes: {
        nome: estacao.nome,
        codigo: estacao.codigo,
        municipio: estacao.municipio,
        distancia_km: estacao.distanciaKm,
        tipo_medicao: estacao.tipoMedicao,
        janela_horas: estacao.janelaHoras,
        idade_horas: estacao.idadeHoras,
        tem_leitura: estacao.temLeitura,
        fonte: estacao.fonte,
      },
    })
  }

  const previsaoFresca = previsaoEstaFresca(previsao, frescorHoras, agora)
  lista.push({
    tipo: 'previsao',
    fonte: previsao?.fonte ?? 'Open-Meteo',
    referencia_id: previsao?.referenciaEm ?? null,
    rotulo: 'Previsão de chuva para as próximas 24 h',
    valor_num: previsao?.precipMm24h ?? null,
    valor_texto:
      previsao?.precipMm24h === null || previsao === null
        ? 'Sem previsão disponível'
        : null,
    unidade: 'mm',
    distancia_m: null,
    contido: null,
    medido_em: timestampOuNulo(previsao?.referenciaEm ?? null),
    coletado_em: previsao?.fetchedAt
      ? new Date(previsao.fetchedAt).toISOString()
      : null,
    qualidade: 'modelado',
    desatualizado: !previsaoFresca,
    detalhes: {
      probabilidade_max_pct: previsao?.probabilidadeMaxPct ?? null,
      pico_3h_mm: previsao?.pico3hMm ?? null,
      pico_6h_mm: previsao?.pico6hMm ?? null,
      timezone: previsao?.timezone ?? null,
      em_cache: avaliacao.previsaoEmCache,
    },
  })

  lista.push({
    tipo: 'qualidade_dado',
    fonte: 'sistema',
    referencia_id: null,
    rotulo: 'Situação dos dados da avaliação',
    valor_num: null,
    valor_texto:
      resultado.nivel === 'dados_insuficientes'
        ? 'Dados insuficientes para classificar'
        : 'Dados mínimos disponíveis para a regra',
    unidade: null,
    distancia_m: null,
    contido: null,
    medido_em: null,
    coletado_em: avaliacao.geradoEm,
    qualidade: 'sistema',
    desatualizado: false,
    detalhes: {
      nivel: resultado.nivel,
      frescas: (evidencias?.estacoes ?? []).filter((estacao) =>
        estacaoEstaFresca(estacao, frescorHoras, agora),
      ).length,
      total_estacoes: evidencias?.estacoes.length ?? 0,
      coleta_status: evidencias?.coleta?.status ?? null,
      coleta_idade_payload_horas:
        evidencias?.coleta?.idadePayloadHoras ?? null,
      previsao_em_cache: avaliacao.previsaoEmCache,
      diagnostico: resultado.diagnostico ?? null,
      bloqueios: resultado.dadosAusentes.map((item) => item.codigo),
    },
  })

  for (const ocorrencia of (evidencias?.ocorrencias ?? []).slice(0, 20)) {
    lista.push({
      tipo: 'ocorrencia',
      fonte: 'Registros públicos',
      referencia_id: String(ocorrencia.id),
      rotulo: ocorrencia.tipo.slice(0, 300),
      valor_num: null,
      valor_texto: ocorrencia.descricao ?? ocorrencia.tipo,
      unidade: null,
      distancia_m: ocorrencia.distanciaM,
      contido: null,
      medido_em: timestampOuNulo(ocorrencia.verificadoEm),
      coletado_em: null,
      qualidade: 'verificada',
      desatualizado: false,
      detalhes: {
        bairro: ocorrencia.bairro,
        tipo: ocorrencia.tipo,
      },
    })
  }

  return lista
}

/**
 * Monta o payload aceito por `registrar_avaliacao_preventiva`. Lança erro se
 * não houver regra compatível publicada — a interface não deve oferecer o
 * botão de registro nesse caso.
 */
export function montarPayloadRegistro(
  avaliacao: AvaliacaoPreventiva,
): PayloadRegistro {
  if (!avaliacao.regra) {
    throw new Error(
      'Não há regra experimental publicada e vigente para registrar a avaliação.',
    )
  }
  if (avaliacao.regra.motorVersao !== MOTOR_VERSAO) {
    throw new Error(
      'A regra publicada não é compatível com esta versão do motor.',
    )
  }

  const evidencias = montarEvidenciasRegistro(avaliacao)
  const resultado = avaliacao.resultado

  const base = {
    origem: avaliacao.origem,
    municipio: avaliacao.municipio,
    bairro: avaliacao.bairro,
    regiao: avaliacao.regiao,
    regra_versao: avaliacao.regra.versao,
    motor_versao: MOTOR_VERSAO,
    gerado_em: avaliacao.geradoEm,
    dimensoes: resultado.dimensoes,
    metadados: {
      app: 'alerta-chuva-cajamar',
      motor_versao: MOTOR_VERSAO,
      regra_versao: avaliacao.regra.versao,
      previsao_em_cache: avaliacao.previsaoEmCache,
      diagnostico: resultado.diagnostico ?? null,
      area_nao_mapeada: resultado.areaNaoMapeada,
      nivel: resultado.nivel,
    },
    evidencias,
    resultado: {
      nivel: resultado.nivel,
      nivel_ordem: resultado.nivelOrdem,
      titulo: resultado.titulo,
      resumo: resultado.resumo,
      explicacao: resultado.explicacao,
      motivos: resultado.motivos,
      dados_ausentes: resultado.dadosAusentes,
      dados_desatualizados: resultado.dadosDesatualizados,
      limitacoes: resultado.limitacoes,
    },
  } satisfies Omit<PayloadRegistro, 'hash_entrada'>

  return {
    ...base,
    hash_entrada: sha256Hex(canonicalJson(base)),
  }
}
