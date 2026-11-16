import type { AvaliacaoPreventiva, PrevisaoResumo } from '@/types/avaliacaoPreventiva'
import type { ChuvaTriangulada24h } from '@/lib/triangulacaoChuva'

/**
 * Mensagem para moradores. A situação de CHUVA não é uma confirmação de
 * alagamento. Não prometer segurança quando a exposição do lote é desconhecida.
 */
export type StatusRiscoEndereco = 'risco' | 'acompanhamento' | 'sem_indicios' | 'indeterminado'

export interface StatusRiscoResumo {
  status: StatusRiscoEndereco
  titulo: string
  mensagem: string
  riscoAlagamento: string
  podeAcionarAlerta: boolean
  observadaMm: number | null
  previstaMm: number | null
  avisoDados: string | null
}

interface OpcoesResumo {
  chuvaTriangulada?: Pick<ChuvaTriangulada24h, 'chuvaObservadaMm' | 'suporteEspacial'> | null
  previsao?: PrevisaoResumo | null
  agora?: number
}

const formatMm = (value: number) => `${value.toFixed(1).replace('.', ',')} mm`

export function resumirRiscoEndereco(
  avaliacao: AvaliacaoPreventiva | null,
  opcoes: OpcoesResumo = {},
): StatusRiscoResumo {
  const observada = opcoes.chuvaTriangulada?.suporteEspacial &&
    typeof opcoes.chuvaTriangulada.chuvaObservadaMm === 'number' &&
    Number.isFinite(opcoes.chuvaTriangulada.chuvaObservadaMm) &&
    opcoes.chuvaTriangulada.chuvaObservadaMm >= 0
      ? opcoes.chuvaTriangulada.chuvaObservadaMm : null
  const now = opcoes.agora ?? Date.now()
  const p = opcoes.previsao
  const previsaoValida = Boolean(p && typeof p.precipMm24h === 'number' &&
    Number.isFinite(p.precipMm24h) && p.precipMm24h >= 0 &&
    typeof p.fetchedAt === 'number' && p.fetchedAt <= now &&
    now - p.fetchedAt <= 6 * 3_600_000)
  const prevista = previsaoValida ? p!.precipMm24h : null
  const pico3h = previsaoValida && typeof p?.pico3hMm === 'number' &&
    Number.isFinite(p.pico3hMm) ? p.pico3hMm : null
  const dados = { observadaMm: observada, previstaMm: prevista }
  const inconclusivo = (mensagem: string, avisoDados: string | null = null): StatusRiscoResumo => ({
    ...dados,
    status: 'indeterminado',
    titulo: 'Avaliação incompleta',
    mensagem,
    riscoAlagamento: 'Não foi possível avaliar o risco de alagamento deste imóvel com os dados disponíveis.',
    podeAcionarAlerta: false,
    avisoDados,
  })

  if (!avaliacao || avaliacao.origem !== 'imovel' || !avaliacao.evidencias?.localizacaoValida) {
    return inconclusivo('Confirme a localização do seu endereço para iniciar a análise.')
  }
  const resultado = avaliacao.resultado
  const erroDeIntegracao = resultado.dadosAusentes.some((dado) => [
    'regra_publicada', 'motor_incompativel', 'evidencias', 'localizacao', 'endereco',
  ].includes(dado.codigo))
  if (erroDeIntegracao) return inconclusivo('O sistema não conseguiu validar a regra ou a localização. Verifique os detalhes da análise.')

  const riscoFisicoConfirmado = resultado.nivel === 'atencao_forte_experimental' &&
    resultado.diagnostico?.exposicao === 'confirmada' &&
    ['observado', 'ambos'].includes(resultado.diagnostico.sinalMeteorologico) &&
    resultado.dadosAusentes.filter((dado) => ![
      'coleta_cemaden', 'exposicao_espacial_nao_confirmada',
    ].includes(dado.codigo)).length === 0
  if (riscoFisicoConfirmado) {
    return {
      ...dados, status: 'risco',
      titulo: 'Indícios de risco de alagamento',
      mensagem: 'Há chuva relevante registrada e exposição física do imóvel confirmada nesta avaliação experimental. Siga os avisos da Defesa Civil.',
      riscoAlagamento: 'Indícios de risco identificados; não é confirmação de inundação nem alerta oficial.',
      podeAcionarAlerta: true,
      avisoDados: null,
    }
  }

  // Compatibilidade com chamadas que ainda não recebem a triangulação/previsão.
  // A tela nova sempre informa opcoes; não promover dados ausentes a "seguro".
  if (opcoes.chuvaTriangulada === undefined && opcoes.previsao === undefined &&
      resultado.nivel === 'sem_sinal_experimental' && resultado.dadosAusentes.length === 0) {
    return {
      ...dados, status: 'sem_indicios',
      titulo: 'Sem indícios de alagamento no momento',
      mensagem: 'A regra experimental não identificou sinais de alerta. Isto não é garantia de segurança.',
      riscoAlagamento: 'Ausência de sinal não significa impossibilidade de alagamento.',
      podeAcionarAlerta: false, avisoDados: null,
    }
  }

  if (observada === null || prevista === null) {
    return inconclusivo(
      'A análise meteorológica precisa de três estações recentes ao redor do endereço e de uma previsão atualizada.',
      'A ausência de medições confiáveis não significa ausência de chuva.',
    )
  }

  // Limiares de COMUNICAÇÃO meteorológica experimentais, não calibração
  // hidrológica. Nunca dizer que o endereço está "livre de alagamento".
  const chuvaForte = prevista >= 30 || observada >= 30 || (pico3h !== null && pico3h >= 20)
  const chuvaAcompanhar = prevista >= 5 || observada >= 5 || (pico3h !== null && pico3h >= 5)
  const exposicaoConfirmada = resultado.diagnostico?.exposicao === 'confirmada'
  const avisoDados = exposicaoConfirmada
    ? null
    : 'A exposição hidrológica do imóvel não foi confirmada. Chuva e topografia isoladas não garantem segurança nem comprovam inundação.'

  if (chuvaForte) {
    return {
      ...dados, status: 'acompanhamento',
      titulo: 'Chuva forte: atenção no endereço',
      mensagem: `Há chuva forte registrada ou prevista (24 h: ${formatMm(observada)} observados e ${formatMm(prevista)} previstos). Acompanhe a Defesa Civil e evite áreas alagáveis.`,
      riscoAlagamento: 'Risco de alagamento não confirmado para este imóvel; mantenha atenção às condições locais.',
      podeAcionarAlerta: false,
      avisoDados,
    }
  }
  if (chuvaAcompanhar) {
    return {
      ...dados, status: 'acompanhamento',
      titulo: 'Chuva prevista: acompanhamento',
      mensagem: `Chuva estimada nas últimas 24 h: ${formatMm(observada)}. Previsão para as próximas 24 h: ${formatMm(prevista)}. Os dados indicam acompanhamento, não alagamento confirmado.`,
      riscoAlagamento: 'Não há confirmação de risco de alagamento neste imóvel com as evidências atuais.',
      podeAcionarAlerta: false,
      avisoDados,
    }
  }
  return {
    ...dados, status: 'sem_indicios',
    titulo: 'Sem sinais meteorológicos relevantes agora',
    mensagem: `Chuva estimada: ${formatMm(observada)} nas últimas 24 h; prevista: ${formatMm(prevista)} nas próximas 24 h. Não há sinal meteorológico relevante pelos critérios experimentais.`,
    riscoAlagamento: 'Isso não elimina o risco de alagamento por drenagem, córregos ou mudanças rápidas do tempo.',
    podeAcionarAlerta: false,
    avisoDados,
  }
}
