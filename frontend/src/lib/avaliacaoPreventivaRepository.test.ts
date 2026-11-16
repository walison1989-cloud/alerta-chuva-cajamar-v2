import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  AvaliacaoPreventivaRepositoryError,
  fetchHistoricoAvaliacoes,
  fetchRegraAvaliacaoPublica,
  fetchTerrenoComDiagnosticoNoPonto,
  diagnosticarRespostaTerreno,
  mapRegraAvaliacaoRow,
  normalizePacoteEvidencias,
  parseEvidenciaTerreno,
} from '@/lib/avaliacaoPreventivaRepository'
import {
  makeEvidencias,
  makePrevisao,
  makeRegra,
} from '@/test/fixtures/avaliacao'

function regraRow() {
  const regra = makeRegra()
  return {
    id: regra.id,
    versao: regra.versao,
    motor_versao: regra.motorVersao,
    titulo: regra.titulo,
    descricao: regra.descricao,
    parametros: {
      frescor_max_horas: regra.parametros.frescorMaxHoras,
      raio_suscetibilidade_m: regra.parametros.raioSuscetibilidadeM,
      raio_estacoes_km: regra.parametros.raioEstacoesKm,
      raio_preferencial_estacoes_km:
        regra.parametros.raioPreferencialEstacoesKm,
      limite_estacoes: regra.parametros.limiteEstacoes,
      faixas_observado_24h_mm: regra.parametros.faixasObservado24hMm,
      faixas_previsao_24h_mm: regra.parametros.faixasPrevisao24hMm,
      suscetibilidade_niveis: regra.parametros.suscetibilidadeNiveis,
      regras: regra.parametros.regras.map((item) => ({
        id: item.id,
        min_suscetibilidade: item.minSuscetibilidade,
        min_chuva: item.minChuva,
        nivel: item.nivel,
        aviso_area_nao_mapeada: item.avisoAreaNaoMapeada,
      })),
      limitacoes: regra.parametros.limitacoes,
    },
    aviso: regra.aviso,
    vigente_de: regra.vigenteDe,
    vigente_ate: null,
    criada_em: regra.criadaEm,
  }
}

describe('mapRegraAvaliacaoRow', () => {
  it('converte o formato do banco para o contrato do motor', () => {
    const regra = mapRegraAvaliacaoRow(regraRow())

    expect(regra?.versao).toBe('exp-2026.11-v1')
    expect(regra?.parametros.frescorMaxHoras).toBe(6)
    expect(regra?.parametros.regras[0].minSuscetibilidade).toBe(2)
    expect(regra?.parametros.faixasObservado24hMm).toHaveLength(4)
  })

  it('rejeita regra com parâmetros incompatíveis', () => {
    const row = regraRow()
    row.parametros.regras = []

    expect(mapRegraAvaliacaoRow(row)).toBeNull()
  })

  it('rejeita nível de regra desconhecido', () => {
    const row = regraRow()
    ;(row.parametros.regras[0] as { nivel: string }).nivel = 'risco_oficial'

    expect(mapRegraAvaliacaoRow(row)).toBeNull()
  })
})

describe('normalizePacoteEvidencias', () => {
  it('normaliza o JSONB das RPCs e preserva listas vazias', () => {
    const evidencias = makeEvidencias()
    const pacote = normalizePacoteEvidencias({
      tem_endereco: evidencias.temEndereco,
      localizacao_valida: evidencias.localizacaoValida,
      municipio: evidencias.municipio,
      bairro: evidencias.bairro,
      precisao: evidencias.precisao,
      cartografia: {
        id: evidencias.cartografia?.id,
        slug: evidencias.cartografia?.slug,
        titulo: evidencias.cartografia?.titulo,
        fonte: evidencias.cartografia?.fonte,
        editor: evidencias.cartografia?.editor,
        escala: evidencias.cartografia?.escala,
        ano_publicacao: evidencias.cartografia?.anoPublicacao,
        url_item: evidencias.cartografia?.urlItem,
      },
      suscetibilidade_disponivel: true,
      suscetibilidade: [],
      estacoes: [],
      resumo_chuva: {
        total_estacoes: 0,
        com_leitura: 0,
        frescas: 0,
        frescas_ate_10km: 0,
        max_24h_mm: null,
        max_ate_10km_mm: null,
        mediana_24h_mm: null,
        estacao_referencia: null,
      },
      coleta: null,
      ocorrencias: [],
      gerado_em: evidencias.geradoEm,
    })

    expect(pacote?.temEndereco).toBe(true)
    expect(pacote?.localizacaoValida).toBe(true)
    expect(pacote?.cartografia?.escala).toBe('1:25.000')
    expect(pacote?.suscetibilidade).toEqual([])
    expect(pacote?.estacoes).toEqual([])
    expect(pacote?.resumoChuva.totalEstacoes).toBe(0)
  })

  it('aceita JSON serializado e normaliza estações e áreas', () => {
    const evidencias = makeEvidencias()
    const pacote = normalizePacoteEvidencias(
      JSON.stringify({
        tem_endereco: true,
        localizacao_valida: true,
        municipio: 'Cajamar',
        bairro: 'Polvilho',
        precisao: 'geocodificado',
        cartografia: null,
        suscetibilidade_disponivel: true,
        suscetibilidade: [
          {
            id: 10,
            cartografia_slug: 'carta',
            tipo: 'inundacao',
            classe: 'Alta',
            classe_ordem: 3,
            processo: 'Planície',
            area_ha: 12.5,
            contem_ponto: true,
            distancia_m: 0,
          },
        ],
        estacoes: [
          {
            id_estacao: 1,
            nome: 'Estação Teste',
            codigo: 'TESTE-1',
            municipio: 'Cajamar',
            distancia_km: 5,
            chuva_24h_mm: 15,
            data_hora: '2026-11-07T14:00:00Z',
            coletado_em: '2026-11-07T14:00:00Z',
            tipo_medicao: 'acumulado_24h',
            janela_horas: 24,
            qualidade: 'oficial',
            fonte: 'CEMADEN',
            tem_leitura: true,
            idade_horas: 1,
            desatualizada: false,
          },
        ],
        resumo_chuva: {},
        coleta: null,
        ocorrencias: [],
        gerado_em: evidencias.geradoEm,
      }),
    )

    expect(pacote?.suscetibilidade[0].classe).toBe('Alta')
    expect(pacote?.estacoes[0].chuva24hMm).toBe(15)
    expect(pacote?.estacoes[0].temLeitura).toBe(true)
  })

  it('rejeita payload que não é objeto', () => {
    expect(normalizePacoteEvidencias('não é json')).toBeNull()
    expect(normalizePacoteEvidencias([])).toBeNull()
  })
})

describe('terreno_motor2_no_ponto — formato efetivo Supabase', () => {
  it('interpreta altitude, declividade e elevação relativa da RPC existente', () => {
    const terreno = parseEvidenciaTerreno({
      qualidade: 'boa',
      fonte: 'MDT Cajamar SGB/CPRM e IPT (2017)',
      perfilId: 'cajamar-mdt5m-08f0aa34b0811713375e',
      altitudeM: 831.2,
      declividadeGraus: 3.4,
      elevacaoRelativaM: 8.5,
      limiarRelevoBaixoM: -6.6195,
      limiarDeclividadeLocalGraus: 5.7288,
      calibracaoProbabilistica: false,
    })
    expect(terreno?.qualidade).toBe('boa')
    expect(terreno?.altitudeM).toBe(831.2)
    expect(terreno?.posicaoTopografica).toBe('elevada')
    // A RPC não afirma conectividade hidráulica: não inventar confirmação.
    expect(terreno?.conectividadeHidrologica).toBe('desconhecida')
  })

  it('não inventa terreno quando o endereço está fora da cobertura do MDT', () => {
    const terreno = parseEvidenciaTerreno({ qualidade: 'fora_cobertura', perfilId: 'cajamar-mdt5m' })
    expect(terreno?.qualidade).toBe('sem_dados')
    expect(terreno?.elevacaoRelativaM).toBeNull()
  })
})

describe('fetchRegraAvaliacaoPublica', () => {
  it('traduz ausência da view para instrução de migration', async () => {
    const client = {
      from: () => ({
        select: () => ({
          limit: () =>
            Promise.resolve({
              data: null,
              error: {
                message:
                  'Could not find the function public.vw_regras_avaliacao_publicas',
              },
            }),
        }),
      }),
    } as unknown as SupabaseClient

    await expect(fetchRegraAvaliacaoPublica(client)).rejects.toThrow(
      AvaliacaoPreventivaRepositoryError,
    )
    await expect(fetchRegraAvaliacaoPublica(client)).rejects.toThrow(
      'migration da Etapa 5.2',
    )
  })

  it('retorna null quando não há regra publicada', async () => {
    const client = {
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    } as unknown as SupabaseClient

    await expect(fetchRegraAvaliacaoPublica(client)).resolves.toBeNull()
  })

  it('mapeia a regra retornada', async () => {
    const client = {
      from: () => ({
        select: () => ({
          limit: () =>
            Promise.resolve({ data: [regraRow()], error: null }),
        }),
      }),
    } as unknown as SupabaseClient

    const regra = await fetchRegraAvaliacaoPublica(client)
    expect(regra?.motorVersao).toBe('1.0.0')
  })
})

describe('fetchHistoricoAvaliacoes', () => {
  it('normaliza o histórico do próprio usuário', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          iniciada_em: '2026-11-07T14:55:00Z',
          origem: 'imovel',
          municipio: 'Cajamar',
          bairro: 'Polvilho',
          regiao: null,
          regra_versao: 'exp-2026.11-v1',
          motor_versao: '1.0.0',
          nivel: 'atencao_experimental',
          nivel_ordem: 2,
          titulo: 'Atenção experimental',
          resumo: 'Resumo experimental.',
          motivos: [
            {
              codigo: 'criterio_atingido',
              dimensao: 'qualidade_dado',
              descricao: 'Critério atingido.',
              evidencias: [],
            },
          ],
          dados_ausentes: [],
          dados_desatualizados: [
            {
              codigo: 'previsao_desatualizada',
              descricao: 'Previsão antiga.',
              fonte: 'Open-Meteo',
              idadeHoras: 9,
              limiteHoras: 6,
              referenciaEm: '2026-11-07T04:00:00Z',
            },
          ],
          total_evidencias: 5,
        },
      ],
      error: null,
    })
    const client = { rpc } as unknown as SupabaseClient

    const historico = await fetchHistoricoAvaliacoes(client, 12)

    expect(rpc).toHaveBeenCalledWith('historico_avaliacoes_preventivas', {
      p_limite: 12,
    })
    expect(historico[0].nivel).toBe('atencao_experimental')
    expect(historico[0].dadosDesatualizados[0].idadeHoras).toBe(9)
    expect(historico[0].totalEvidencias).toBe(5)
  })

  it('ignora linhas inválidas sem quebrar o restante', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ id: 'sem-nivel' }, { nivel: 'invalido' }],
        error: null,
      }),
    } as unknown as SupabaseClient

    await expect(fetchHistoricoAvaliacoes(client)).resolves.toEqual([])
  })
})

describe('previsão como evidência', () => {
  it('mantém probabilidade de precipitação sem convertê-la em risco', () => {
    const previsao = makePrevisao()
    expect(previsao.probabilidadeMaxPct).toBe(70)
    expect(previsao.precipMm24h).toBe(20)
  })
})


describe('integração de terreno existente no Supabase', () => {
  it('preserva evidência topográfica completa do pacote RPC', () => {
    const base = makeEvidencias()
    const pacote = normalizePacoteEvidencias({
      tem_endereco: true,
      localizacao_valida: true,
      suscetibilidade_disponivel: true,
      estacoes: [],
      suscetibilidade: [],
      gerado_em: base.geradoEm,
      terreno: {
        fonte: 'MDT publicamente documentado', qualidade: 'boa',
        altitude_m: 785, elevacao_relativa_m: 17,
        declividade_graus: 4, posicao_topografica: 'elevada',
        conectividade_hidrologica: 'descartada',
      },
    })
    expect(pacote?.terreno).toEqual({
      fonte: 'MDT publicamente documentado', qualidade: 'boa',
      elevacaoRelativaM: 17, declividadeGraus: 4,
      posicaoTopografica: 'elevada', conectividadeHidrologica: 'descartada',
    })
  })

  it('não converte altitude absoluta isolada em exposição confirmada', () => {
    expect(parseEvidenciaTerreno({fonte: 'MDT', qualidade: 'boa', altitude_m: 780})).toMatchObject({
      qualidade: 'limitada', elevacaoRelativaM: null,
      posicaoTopografica: 'indefinida', conectividadeHidrologica: 'desconhecida',
    })
  })

  it('recusa declarar confiabilidade boa sem conexão hidráulica demonstrada', () => {
    expect(parseEvidenciaTerreno({
      fonte: 'MDT', qualidade: 'boa', elevacao_relativa_m: -4,
      declividade_graus: 2, posicao_topografica: 'baixa',
    })?.qualidade).toBe('limitada')
  })

  it('ignora dados topográficos sem origem', () => {
    expect(parseEvidenciaTerreno({qualidade: 'boa', elevacao_relativa_m: -10})).toBeNull()
  })
})


describe('diagnóstico de cobertura e acesso ao MDT existente', () => {
  it('informa falta de cobertura sem classificar o endereço como seguro', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { qualidade: 'fora_cobertura', perfilId: 'cajamar-mdt5m' },
        error: null,
      }),
    } as unknown as SupabaseClient
    const result = await fetchTerrenoComDiagnosticoNoPonto(client, -23.4, -46.8)
    expect(result.terreno?.elevacaoRelativaM).toBeNull()
    expect(result.diagnostico).toContain('fora da cobertura')
    expect(client.rpc).toHaveBeenCalledWith('terreno_motor2_no_ponto', {
      p_latitude: -23.4, p_longitude: -46.8,
    })
  })

  it('não exibe aviso quando a leitura tem elevação relativa válida', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          qualidade: 'boa', fonte: 'MDT', altitudeM: 812.1,
          declividadeGraus: 4.3, elevacaoRelativaM: 9.2,
        },
        error: null,
      }),
    } as unknown as SupabaseClient
    const result = await fetchTerrenoComDiagnosticoNoPonto(client, -23.34, -46.85)
    expect(result.terreno?.elevacaoRelativaM).toBe(9.2)
    expect(result.diagnostico).toBeNull()
  })

  it('não oculta acesso negado à RPC', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for function' } }),
    } as unknown as SupabaseClient
    await expect(fetchTerrenoComDiagnosticoNoPonto(client, -23.34, -46.85))
      .rejects.toThrow('permissão')
  })

  it('distingue célula sem dados de perfil não instalado', () => {
    expect(diagnosticarRespostaTerreno({qualidade: 'sem_dados'})).toContain('não possui leitura válida')
    expect(diagnosticarRespostaTerreno({qualidade: 'nao_instalado'})).toContain('perfil de terreno ativo')
  })
})
