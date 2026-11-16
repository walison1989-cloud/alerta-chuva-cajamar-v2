import { describe, expect, it } from 'vitest'
import { resumirRiscoEndereco } from '@/lib/statusRiscoEndereco'
import { avaliarPreventivamente } from '@/lib/avaliacaoPreventiva'
import { AGORA, makeEntrada, makeEvidencias, makePrevisao } from '@/test/fixtures/avaliacao'

const base = avaliarPreventivamente(makeEntrada())

describe('resumo seguro para o morador', () => {
  it('não conclui ausência de risco se não houver avaliação', () => {
    expect(resumirRiscoEndereco(null).status).toBe('indeterminado')
  })
  it('não considera uma prévia regional como estado do imóvel', () => {
    expect(resumirRiscoEndereco({ ...base, origem: 'regiao' }).status).toBe('indeterminado')
  })
  it('não dispara alerta em caso de atenção forte sem confirmação física', () => {
    const result = { ...base.resultado, nivel: 'atencao_forte_experimental' as const,
      dadosAusentes: [], dadosDesatualizados: [],
      diagnostico: { exposicao: 'indeterminada' as const, sinalMeteorologico: 'ambos' as const, pico3hMm: 30, pico6hMm: 45, justificativa: '' } }
    expect(resumirRiscoEndereco({ ...base, resultado: result }).podeAcionarAlerta).toBe(false)
  })
  it('não envia risco por área suscetível a 457m, chuva medida 0 e previsão 25mm', () => {
    const baseEvidencias = makeEvidencias()
    const avaliacao = avaliarPreventivamente(makeEntrada({
      evidencias: makeEvidencias({
        suscetibilidade: [{...baseEvidencias.suscetibilidade[0], contemPonto: false, distanciaM: 457}],
        estacoes: baseEvidencias.estacoes.map(estacao => ({...estacao, chuva24hMm: 0})),
        terreno: { fonte: 'MDT local 5m', qualidade: 'boa', altitudeM: 845, elevacaoRelativaM: 9,
          declividadeGraus: 4, posicaoTopografica: 'elevada', conectividadeHidrologica: 'desconhecida' },
      }),
      previsao: makePrevisao({precipMm24h: 25, pico3hMm: 10}),
    }))
    expect(resumirRiscoEndereco(avaliacao).podeAcionarAlerta).toBe(false)
    expect(resumirRiscoEndereco(avaliacao).status).not.toBe('risco')
  })

  it('não declara seguro quando dados faltam', () => {
    const result = { ...base.resultado, nivel: 'sem_sinal_experimental' as const,
      dadosAusentes: [{ codigo: 'sensor', descricao: 'offline', fonte: 'estacao' }] }
    expect(resumirRiscoEndereco({ ...base, resultado: result }).status).toBe('indeterminado')
  })
  it('exibe sem indícios somente com pacote completo e resultado sem sinal', () => {
    const result = { ...base.resultado, nivel: 'sem_sinal_experimental' as const,
      dadosAusentes: [], dadosDesatualizados: [] }
    expect(resumirRiscoEndereco({ ...base, resultado: result }).status).toBe('sem_indicios')
  })
  it('habilita candidato a alerta só com exposição e chuva observada', () => {
    const result = { ...base.resultado, nivel: 'atencao_forte_experimental' as const,
      dadosAusentes: [], dadosDesatualizados: [],
      diagnostico: { exposicao: 'confirmada' as const, sinalMeteorologico: 'ambos' as const, pico3hMm: 30, pico6hMm: 45, justificativa: '' } }
    expect(resumirRiscoEndereco({ ...base, resultado: result }).podeAcionarAlerta).toBe(true)
  })
})


describe('painel meteorológico com triangulação', () => {
  const options = (mmObservada: number | null, mmPrevista: number | null) => ({
    chuvaTriangulada: { suporteEspacial: mmObservada !== null, chuvaObservadaMm: mmObservada },
    previsao: makePrevisao({ precipMm24h: mmPrevista }),
    agora: AGORA,
  })
  it('mostra acompanhamento com 0,8mm observados e 18,5mm previstos apesar da exposição não confirmada', () => {
    const result = resumirRiscoEndereco(base, options(0.8, 18.5))
    expect(result.status).toBe('acompanhamento')
    expect(result.titulo).toContain('Chuva prevista')
    expect(result.riscoAlagamento).toContain('Não há confirmação')
    expect(result.podeAcionarAlerta).toBe(false)
  })
  it('exibe ausência de sinal meteorológico sem declarar imóvel seguro', () => {
    const result = resumirRiscoEndereco(base, options(0.2, 0.5))
    expect(result.status).toBe('sem_indicios')
    expect(result.riscoAlagamento).toContain('não elimina')
  })
  it('não transforma previsão forte sozinha em risco de alagamento confirmado', () => {
    const result = resumirRiscoEndereco(base, options(0.8, 45))
    expect(result.status).toBe('acompanhamento')
    expect(result.podeAcionarAlerta).toBe(false)
  })
  it('não classifica com previsão ou triangulação ausente', () => {
    expect(resumirRiscoEndereco(base, options(null, 15)).status).toBe('indeterminado')
    expect(resumirRiscoEndereco(base, options(1, null)).status).toBe('indeterminado')
  })
})
