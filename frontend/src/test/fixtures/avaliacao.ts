import { MOTOR_VERSAO } from '@/lib/avaliacaoPreventiva'
import type {
  EntradaMotor,
  PacoteEvidencias,
  PrevisaoResumo,
  RegraAvaliacaoPublica,
} from '@/types/avaliacaoPreventiva'

export const AGORA = Date.parse('2026-11-07T15:00:00Z')
export const LEITURA_FRESCA = '2026-11-07T14:00:00Z'
export const LEITURA_ANTIGA = '2026-11-07T04:00:00Z'

export function makeRegra(
  overrides: Partial<RegraAvaliacaoPublica> = {},
): RegraAvaliacaoPublica {
  return {
    id: 1,
    versao: 'exp-2026.11-v2',
    motorVersao: MOTOR_VERSAO,
    titulo: 'Análise preventiva experimental — versão 2',
    descricao:
      'Regra experimental que combina suscetibilidade oficial do terreno, chuva observada em 24 h e previsão de chuva para as próximas 24 h.',
    parametros: {
      pico3hCriticoMm: 20,
      frescorMaxHoras: 6,
      raioSuscetibilidadeM: 500,
      raioEstacoesKm: 30,
      raioPreferencialEstacoesKm: 10,
      limiteEstacoes: 10,
      faixasObservado24hMm: [
        { nivel: 0, min: 0, max: 0 },
        { nivel: 1, min: 0.1, max: 10 },
        { nivel: 2, min: 10.1, max: 30 },
        { nivel: 3, min: 30.1, max: null },
      ],
      faixasPrevisao24hMm: [
        { nivel: 0, min: 0, max: 0 },
        { nivel: 1, min: 0.1, max: 10 },
        { nivel: 2, min: 10.1, max: 30 },
        { nivel: 3, min: 30.1, max: null },
      ],
      suscetibilidadeNiveis: {
        Alta: 3,
        Media: 2,
        Baixa: 1,
        Enxurrada: 3,
      },
      regras: [
        {
          id: 'suscetibilidade_alta_chuva_moderada_ou_mais',
          minSuscetibilidade: 2,
          minChuva: 2,
          nivel: 'atencao_forte_experimental',
          avisoAreaNaoMapeada: false,
        },
        {
          id: 'suscetibilidade_alta_qualquer_chuva',
          minSuscetibilidade: 2,
          minChuva: 1,
          nivel: 'atencao_experimental',
          avisoAreaNaoMapeada: false,
        },
        {
          id: 'suscetibilidade_media_ou_baixa_chuva_moderada',
          minSuscetibilidade: 1,
          minChuva: 2,
          nivel: 'atencao_experimental',
          avisoAreaNaoMapeada: false,
        },
        {
          id: 'chuva_forte_sem_area_mapeada',
          minSuscetibilidade: 0,
          minChuva: 3,
          nivel: 'atencao_experimental',
          avisoAreaNaoMapeada: true,
        },
      ],
      limitacoes: [
        'A classificação é experimental e não representa probabilidade de alagamento.',
        'A carta de suscetibilidade é de 2017 e não reage à chuva do momento.',
      ],
    },
    aviso:
      'Resultado experimental para leitura preventiva. Não é alerta oficial e não substitui a Defesa Civil (199).',
    vigenteDe: '2026-11-01T00:00:00Z',
    vigenteAte: null,
    criadaEm: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

export function makeEvidencias(
  overrides: Partial<PacoteEvidencias> = {},
): PacoteEvidencias {
  return {
    temEndereco: true,
    localizacaoValida: true,
    municipio: 'Cajamar',
    bairro: 'Polvilho',
    precisao: 'geocodificado',
    cartografia: {
      id: 1,
      slug: 'suscetibilidade-cajamar-2017',
      titulo: 'Suscetibilidade a inundação e enxurrada — Cajamar',
      fonte: 'SGB/CPRM',
      editor: 'IPT',
      escala: '1:25.000',
      anoPublicacao: 2017,
      urlItem: 'https://rigeo.sgb.gov.br/items/exemplo',
    },
    suscetibilidadeDisponivel: true,
    suscetibilidade: [
      {
        id: 10,
        cartografiaSlug: 'suscetibilidade-cajamar-2017',
        tipo: 'inundacao',
        classe: 'Alta',
        classeOrdem: 3,
        processo: 'Planície de inundação',
        areaHa: 12.5,
        contemPonto: true,
        distanciaM: 0,
      },
    ],
    estacoes: [
      {
        idEstacao: 1,
        nome: 'Estação Teste',
        codigo: 'TESTE-1',
        municipio: 'Cajamar',
        distanciaKm: 5,
        chuva24hMm: 15,
        dataHora: LEITURA_FRESCA,
        coletadoEm: LEITURA_FRESCA,
        tipoMedicao: 'acumulado_24h',
        janelaHoras: 24,
        qualidade: 'oficial',
        fonte: 'CEMADEN',
        temLeitura: true,
        idadeHoras: 1,
        desatualizada: false,
      },
    ],
    resumoChuva: {
      totalEstacoes: 1,
      comLeitura: 1,
      frescas: 1,
      frescasAte10km: 1,
      max24hMm: 15,
      maxAte10kmMm: 15,
      mediana24hMm: 15,
      estacaoReferencia: {
        codigo: 'TESTE-1',
        nome: 'Estação Teste',
        distanciaKm: 5,
        chuva24hMm: 15,
        dataHora: LEITURA_FRESCA,
      },
    },
    coleta: {
      fonte: 'CEMADEN',
      status: 'sucesso',
      ultimaTentativaEm: '2026-11-07T14:50:00Z',
      ultimaConclusaoEm: '2026-11-07T14:50:00Z',
      ultimoSucessoEm: '2026-11-07T14:50:00Z',
      payloadAtualizadoEm: '2026-11-07T14:40:00Z',
      estacoesNoRaio: 1,
      medicoesGravadas: 1,
      mensagemPublica: null,
      idadePayloadHoras: 0.33,
    },
    ocorrencias: [],
    geradoEm: '2026-11-07T14:55:00Z',
    ...overrides,
  }
}

export function makePrevisao(
  overrides: Partial<PrevisaoResumo> = {},
): PrevisaoResumo {
  return {
    fonte: 'Open-Meteo',
    precipMm24h: 20,
    pico3hMm: 3,
    pico6hMm: 6,
    probabilidadeMaxPct: 70,
    fetchedAt: Date.parse('2026-11-07T14:30:00Z'),
    referenciaEm: '2026-11-07T14:00:00Z',
    timezone: 'America/Sao_Paulo',
    ...overrides,
  }
}

export function makeEntrada(
  overrides: Partial<EntradaMotor> = {},
): EntradaMotor {
  return {
    agora: AGORA,
    origem: 'imovel',
    municipio: 'Cajamar',
    bairro: 'Polvilho',
    regiao: null,
    regra: makeRegra(),
    evidencias: makeEvidencias(),
    previsao: makePrevisao(),
    previsaoErro: null,
    previsaoEmCache: false,
    motorVersao: MOTOR_VERSAO,
    ...overrides,
  }
}
