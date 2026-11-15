import type { AvaliacaoPreventiva } from '@/types/avaliacaoPreventiva'

/**
 * Estado exibido para o cidadão. Não confundir uma regra experimental com
 * probabilidade calibrada, e nunca transformar falha de coleta em "seguro".
 * Usado também para decidir se uma notificação seria sequer candidata.
 */
export type StatusRiscoEndereco = 'risco' | 'sem_indicios' | 'indeterminado'

export interface StatusRiscoResumo {
  status: StatusRiscoEndereco
  titulo: string
  mensagem: string
  podeAcionarAlerta: boolean
}

export function resumirRiscoEndereco(
  avaliacao: AvaliacaoPreventiva | null,
): StatusRiscoResumo {
  const indeterminado = (mensagem: string): StatusRiscoResumo => ({
    status: 'indeterminado',
    titulo: 'Não foi possível determinar',
    mensagem,
    podeAcionarAlerta: false,
  })

  if (!avaliacao || avaliacao.origem !== 'imovel' || !avaliacao.evidencias?.localizacaoValida) {
    return indeterminado('Entre na sua conta e confirme a localização do endereço cadastrado.')
  }
  const { resultado } = avaliacao
  // O pacote também registra ausências não bloqueantes: por exemplo,
  // metadados de coleta não disponíveis, embora haja leituras frescas.
  const ausenciasCriticas = resultado.dadosAusentes.filter((dado) =>
    !['coleta_cemaden', 'exposicao_espacial_nao_confirmada'].includes(dado.codigo),
  )
  if (resultado.nivel === 'dados_insuficientes' || ausenciasCriticas.length > 0) {
    return indeterminado('Faltam medições atualizadas ou informações para avaliar com segurança esse endereço.')
  }
  if (resultado.nivel === 'atencao_forte_experimental' &&
      resultado.diagnostico?.exposicao === 'confirmada' &&
      ['observado', 'ambos'].includes(resultado.diagnostico.sinalMeteorologico)) {
    return {
      status: 'risco',
      titulo: 'Indícios de risco de alagamento',
      mensagem: 'Chuva observada e exposição física convergiram. Adote medidas preventivas e acompanhe os avisos da Defesa Civil.',
      podeAcionarAlerta: true,
    }
  }
  if (resultado.nivel === 'sem_sinal_experimental') {
    return {
      status: 'sem_indicios',
      titulo: 'Sem indícios de alagamento no momento',
      mensagem: 'Os dados analisados não apontam condição de alerta nesta avaliação. Isso não garante ausência de risco.',
      podeAcionarAlerta: false,
    }
  }
  return indeterminado('Há sinais meteorológicos em acompanhamento, mas ainda não existem evidências para confirmar alagamento nesse imóvel.')
}
