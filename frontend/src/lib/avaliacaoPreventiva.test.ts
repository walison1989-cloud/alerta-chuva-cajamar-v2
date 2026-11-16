import { describe, expect, it } from 'vitest'
import {
  MOTOR_VERSAO,
  avaliarPreventivamente,
  classificarFaixaExperimental,
  montarPayloadRegistro,
} from '@/lib/avaliacaoPreventiva'
import {
  AGORA,
  LEITURA_ANTIGA,
  makeEntrada,
  makeEvidencias,
  makePrevisao,
  makeRegra,
} from '@/test/fixtures/avaliacao'

describe('integração da triangulação à decisão do endereço', () => {
  it('não conclui perigo para o imóvel com dados espaciais de chuva insuficientes', () => {
    const result = avaliarPreventivamente(makeEntrada({
      chuvaTriangulada: { chuvaObservadaMm: null, suporteEspacial: false, estacoes: [] },
    }))
    expect(result.resultado.nivel).toBe('dados_insuficientes')
    expect(result.resultado.dadosAusentes.map((dado) => dado.codigo)).toContain('chuva_sem_triangulo')
  })

  it('usa a chuva triangulada na classificação, não a medida isolada mais alta', () => {
    const result = avaliarPreventivamente(makeEntrada({
      chuvaTriangulada: { chuvaObservadaMm: 0, suporteEspacial: true, estacoes: ['A', 'B', 'C'] },
    }))
    expect(result.resultado.dimensoes.chuvaObservada).toBe(0)
    expect(result.resultado.motivos.map((item) => item.codigo)).toContain('chuva_triangulada_3_estacoes')
  })
})

describe('avaliarPreventivamente', () => {
  it('limita à atenção previsão moderada mesmo em área Alta sem terreno verificado', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada())

    expect(avaliacao.resultado.nivel).toBe('atencao_experimental')
    expect(avaliacao.resultado.nivelOrdem).toBe(2)
    expect(avaliacao.resultado.classificacao.regraId).toBeNull()
    expect(avaliacao.resultado.dimensoes).toEqual({
      suscetibilidade: 3,
      chuvaObservada: 2,
      previsao: 2,
      chuvaCombinada: 2,
    })
    expect(avaliacao.resultado.motivos.map((item) => item.codigo)).toContain(
      'forte_bloqueada_sem_corroboração',
    )
  })

  it('mantém chuva observada e previsão como dimensões separadas', () => {
    const base = makeEvidencias()
    const avaliacao = avaliarPreventivamente(
      makeEntrada({
        evidencias: makeEvidencias({
          suscetibilidade: [],
          suscetibilidadeDisponivel: true,
          estacoes: [{ ...base.estacoes[0], chuva24hMm: 0 }],
        }),
        previsao: makePrevisao({ precipMm24h: 40 }),
      }),
    )

    expect(avaliacao.resultado.dimensoes.chuvaObservada).toBe(0)
    expect(avaliacao.resultado.dimensoes.previsao).toBe(3)
    expect(avaliacao.resultado.dimensoes.chuvaCombinada).toBe(3)
    expect(avaliacao.resultado.areaNaoMapeada).toBe(true)
    expect(avaliacao.resultado.nivel).toBe('atencao_experimental')
    expect(avaliacao.resultado.dadosAusentes.map((item) => item.codigo)).toContain(
      'exposicao_espacial_nao_confirmada',
    )
    expect(avaliacao.resultado.limitacoes.join(' ')).toContain('não são somados')
    expect(avaliacao.resultado.explicacao).toContain('sem somá-las')
  })

  it('não transforma área próxima de alta suscetibilidade em exposição do imóvel', () => {
    const area = makeEvidencias().suscetibilidade[0]
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({
        suscetibilidade: [{ ...area, contemPonto: false, distanciaM: 80 }],
      }),
    }))
    expect(avaliacao.resultado.areaPrincipal?.classe).toBe('Alta')
    expect(avaliacao.resultado.dimensoes.suscetibilidade).toBe(0)
    expect(avaliacao.resultado.nivel).toBe('dados_insuficientes')
    expect(avaliacao.resultado.dadosAusentes.map((item) => item.codigo)).toContain('exposicao_espacial_nao_confirmada')
    expect(avaliacao.resultado.explicacao).toContain('a 80 m do ponto')
  })

  it('prefere área que contém o imóvel a uma área próxima mais suscetível', () => {
    const area = makeEvidencias().suscetibilidade[0]
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({
        suscetibilidade: [
          { ...area, id: 11, classe: 'Alta', contemPonto: false, distanciaM: 20 },
          { ...area, id: 12, classe: 'Baixa', contemPonto: true, distanciaM: 0 },
        ],
      }),
    }))
    expect(avaliacao.resultado.areaPrincipal?.id).toBe(12)
    expect(avaliacao.resultado.dimensoes.suscetibilidade).toBe(1)
    expect(avaliacao.resultado.nivel).toBe('atencao_experimental')
  })

  it('reproduz o print: 457m de área Média, 0mm observado e 25mm previstos NÃO dão atenção forte', () => {
    const base = makeEvidencias()
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({
        suscetibilidade: [{ ...base.suscetibilidade[0], classe: 'Media', contemPonto: false, distanciaM: 457 }],
        estacoes: [{ ...base.estacoes[0], chuva24hMm: 0 }],
      }),
      previsao: makePrevisao({ precipMm24h: 25, pico3hMm: 25 }),
    }))
    expect(avaliacao.resultado.nivel).toBe('dados_insuficientes')
    expect(avaliacao.resultado.dimensoes.suscetibilidade).toBe(0)
    expect(avaliacao.resultado.diagnostico?.exposicao).toBe('indeterminada')
    expect(avaliacao.resultado.resumo).toContain('Não há evidências suficientes')
    expect(avaliacao.resultado.explicacao).toContain('a 457 m do ponto')
  })

  it('não ativa atenção forte com 0mm medidos, mesmo dentro de polígono Alta e com terreno verificado', () => {
    const base = makeEvidencias()
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({
        estacoes: [{ ...base.estacoes[0], chuva24hMm: 0 }],
        terreno: {fonte: 'MDT verificado', qualidade: 'boa', elevacaoRelativaM: -6,
          declividadeGraus: 1, posicaoTopografica: 'baixa', conectividadeHidrologica: 'confirmada'},
      }),
      previsao: makePrevisao({ precipMm24h: 25, pico3hMm: 22 }),
    }))
    expect(avaliacao.resultado.nivel).toBe('atencao_experimental')
  })

  it('permite atenção forte apenas com terreno baixo, conectividade e chuva observada convergentes', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({
        terreno: {fonte: 'MDT e conectividade verificados', qualidade: 'boa', elevacaoRelativaM: -6,
          declividadeGraus: 1, posicaoTopografica: 'baixa', conectividadeHidrologica: 'confirmada'},
      }),
      previsao: makePrevisao({precipMm24h: 25, pico3hMm: 24}),
    }))
    expect(avaliacao.resultado.nivel).toBe('atencao_forte_experimental')
    expect(avaliacao.resultado.diagnostico?.exposicao).toBe('confirmada')
    expect(avaliacao.resultado.classificacao.regraId).toBe('suscetibilidade_alta_chuva_moderada_ou_mais')
  })

  it('não converte altitude absoluta do modelo meteorológico em exposição do imóvel', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada({
      previsao: makePrevisao({ precipMm24h: 25, pico3hMm: 24 }),
    }))
    expect(avaliacao.resultado.diagnostico?.exposicao).toBe('indeterminada')
    expect(avaliacao.resultado.nivel).toBe('atencao_experimental')
  })

  it('não considera 0mm observado e 0mm previsto sinal de perigo forte', () => {
    const base = makeEvidencias()
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({estacoes: [{...base.estacoes[0], chuva24hMm: 0}]}),
      previsao: makePrevisao({precipMm24h: 0, pico3hMm: 0}),
    }))
    expect(avaliacao.resultado.nivel).toBe('sem_sinal_experimental')
  })

  it('chuva regional extrema sem conexão espacial produz no máximo atenção simples', () => {
    const base = makeEvidencias()
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({suscetibilidade: [{...base.suscetibilidade[0], contemPonto: false, distanciaM: 457}]}),
      previsao: makePrevisao({precipMm24h: 70, pico3hMm: 30}),
    }))
    expect(avaliacao.resultado.nivel).toBe('atencao_experimental')
    expect(avaliacao.resultado.diagnostico?.exposicao).toBe('indeterminada')
  })

  it('retorna dados insuficientes quando a única leitura está desatualizada', () => {
    const avaliacao = avaliarPreventivamente(
      makeEntrada({
        evidencias: makeEvidencias({
          estacoes: [
            {
              ...makeEvidencias().estacoes[0],
              dataHora: LEITURA_ANTIGA,
              idadeHoras: 11,
              desatualizada: true,
            },
          ],
        }),
      }),
    )

    expect(avaliacao.resultado.nivel).toBe('dados_insuficientes')
    expect(avaliacao.resultado.dadosAusentes.map((item) => item.codigo)).toContain(
      'chuva_observada_fresca',
    )
    expect(
      avaliacao.resultado.dadosDesatualizados.map((item) => item.codigo),
    ).toContain('chuva_observada_desatualizada')
    expect(avaliacao.resultado.estacaoReferencia).toBeNull()
  })

  it('retorna dados insuficientes quando falta a regra publicada', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada({ regra: null }))

    expect(avaliacao.resultado.nivel).toBe('dados_insuficientes')
    expect(avaliacao.resultado.dadosAusentes.map((item) => item.codigo)).toContain(
      'regra_publicada',
    )
    expect(avaliacao.regra).toBeNull()
    expect(avaliacao.resultado.explicacao).toContain('não publicada')
  })

  it('retorna dados insuficientes quando falta previsão', () => {
    const avaliacao = avaliarPreventivamente(
      makeEntrada({
        previsao: null,
        previsaoErro: 'Open-Meteo indisponível',
      }),
    )

    expect(avaliacao.resultado.nivel).toBe('dados_insuficientes')
    expect(avaliacao.resultado.dadosAusentes.map((item) => item.codigo)).toContain(
      'previsao',
    )
    expect(avaliacao.resultado.explicacao).toContain('Open-Meteo indisponível')
  })

  it('recusa classificar quando a regra exige outro motor', () => {
    const avaliacao = avaliarPreventivamente(
      makeEntrada({ regra: makeRegra({ motorVersao: '2.0.0' }) }),
    )

    expect(avaliacao.resultado.nivel).toBe('dados_insuficientes')
    expect(avaliacao.resultado.dadosAusentes.map((item) => item.codigo)).toContain(
      'motor_incompativel',
    )
  })

  it('não classifica imóvel sem endereço válido', () => {
    const avaliacao = avaliarPreventivamente(
      makeEntrada({
        evidencias: makeEvidencias({
          temEndereco: false,
          localizacaoValida: false,
        }),
      }),
    )

    expect(avaliacao.resultado.nivel).toBe('dados_insuficientes')
    expect(avaliacao.resultado.dadosAusentes.map((item) => item.codigo)).toEqual(
      expect.arrayContaining(['localizacao', 'endereco']),
    )
  })

  it('marca coleta CEMADEN desatualizada sem bloquear a classificação', () => {
    const evidencias = makeEvidencias()
    const avaliacao = avaliarPreventivamente(
      makeEntrada({
        evidencias: makeEvidencias({
          coleta: {
            ...evidencias.coleta!,
            idadePayloadHoras: 9,
          },
        }),
      }),
    )

    expect(
      avaliacao.resultado.dadosDesatualizados.map((item) => item.codigo),
    ).toContain('coleta_cemaden_desatualizada')
    expect(avaliacao.resultado.nivel).toBe('atencao_experimental')
  })

  it('explica localização, fontes, versões e limitações no texto', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada())
    const explicacao = avaliacao.resultado.explicacao

    expect(explicacao).toContain('Avaliação experimental de imóvel do morador')
    expect(explicacao).toContain('Suscetibilidade: Alta')
    expect(explicacao).toContain('Chuva observada: 15,0 mm em 24 h')
    expect(explicacao).toContain('Previsão: 20,0 mm')
    expect(explicacao).toContain('Regra exp-2026.11-v2')
    expect(explicacao).toContain(`motor ${MOTOR_VERSAO}`)
    expect(explicacao).toContain('não é alerta oficial')
  })
})

describe('classificarFaixaExperimental', () => {
  const faixas = [
    { nivel: 0, min: 0, max: 0 },
    { nivel: 1, min: 0.1, max: 10 },
    { nivel: 2, min: 10.1, max: 30 },
    { nivel: 3, min: 30.1, max: null },
  ]

  it.each([
    [0, 0],
    [0.1, 1],
    [10, 1],
    [10.1, 2],
    [30, 2],
    [30.1, 3],
    [100, 3],
  ])('classifica %s mm como nível %s', (valor, esperado) => {
    expect(classificarFaixaExperimental(valor, faixas)).toBe(esperado)
  })

  it('trata valor ausente ou negativo como nível 0', () => {
    expect(classificarFaixaExperimental(null, faixas)).toBe(0)
    expect(classificarFaixaExperimental(-1, faixas)).toBe(0)
  })
})

describe('montarPayloadRegistro', () => {
  it('gera hash SHA-256 e evidências sem coordenadas', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada())
    const payload = montarPayloadRegistro(avaliacao)

    expect(payload.hash_entrada).toMatch(/^[0-9a-f]{64}$/)
    expect(payload.regra_versao).toBe('exp-2026.11-v2')
    expect(payload.motor_versao).toBe(MOTOR_VERSAO)
    expect(payload.evidencias.length).toBeGreaterThan(0)
    expect(JSON.stringify(payload)).not.toContain('"latitude":')
    expect(JSON.stringify(payload)).not.toContain('"longitude":')
    expect(JSON.stringify(payload)).not.toContain('"localizacao":')
  })

  it('recusa payload sem regra publicada', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada({ regra: null }))

    expect(() => montarPayloadRegistro(avaliacao)).toThrow(
      'Não há regra experimental publicada e vigente',
    )
  })

  it('recusa payload quando a regra exige outro motor', () => {
    const avaliacao = avaliarPreventivamente(
      makeEntrada({ regra: makeRegra({ motorVersao: '9.9.9' }) }),
    )

    expect(() => montarPayloadRegistro(avaliacao)).toThrow(
      'não é compatível com esta versão do motor',
    )
  })

  it('associa o endereço apenas por bairro e município', () => {
    const avaliacao = avaliarPreventivamente(makeEntrada())
    const payload = montarPayloadRegistro(avaliacao)
    const localizacao = payload.evidencias.find(
      (item) => item.tipo === 'localizacao',
    )

    expect(localizacao?.valor_texto).toBe('Polvilho · Cajamar')
    expect(localizacao?.detalhes).not.toHaveProperty('latitude')
    expect(localizacao?.detalhes).not.toHaveProperty('longitude')
    expect(avaliacao.geradoEm).toBe(new Date(AGORA).toISOString())
  })
})
