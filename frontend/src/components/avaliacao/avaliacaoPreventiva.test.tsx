import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AvaliacaoAcoesCard } from '@/components/avaliacao/AvaliacaoAcoesCard'
import { AvaliacaoAreasCard } from '@/components/avaliacao/AvaliacaoAreasCard'
import { AvaliacaoCondicoesCard } from '@/components/avaliacao/AvaliacaoCondicoesCard'
import { AvaliacaoDadosCard } from '@/components/avaliacao/AvaliacaoDadosCard'
import { AvaliacaoHistoricoCard } from '@/components/avaliacao/AvaliacaoHistoricoCard'
import { AvaliacaoResultadoCard } from '@/components/avaliacao/AvaliacaoResultadoCard'
import { ExperimentalAnalysisCard } from '@/components/home/ExperimentalAnalysisCard'
import { avaliarPreventivamente } from '@/lib/avaliacaoPreventiva'
import {
  makeEntrada,
  makeEvidencias,
  makePrevisao,
  makeRegra,
} from '@/test/fixtures/avaliacao'

const avaliacao = avaliarPreventivamente(makeEntrada())

function acoesProps() {
  return {
    isConfigured: true,
    isAuthenticated: true,
    avaliacao,
    regra: makeRegra(),
    onRegister: vi.fn().mockResolvedValue(null),
    isRegistering: false,
    registerError: null,
    lastRegisteredId: null,
    onGeneratePrevia: vi.fn().mockResolvedValue(null),
    isCreatingPrevia: false,
    previaError: null,
    previa: null,
    addressError: null,
  }
}

describe('AvaliacaoResultadoCard', () => {
  it('mostra nível, explicação e aviso de que não é probabilidade', () => {
    render(
      <AvaliacaoResultadoCard
        avaliacao={avaliacao}
        isLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('Resultado da análise preventiva')).toBeVisible()
    expect(
      screen.getAllByText('Atenção forte experimental'),
    ).toHaveLength(2)
    expect(screen.getByText(/Nível 3 de 3 desta regra/)).toBeVisible()
    const reasons = screen.getByText(/Por que saiu este resultado/)
    expect(reasons).toBeVisible()
    expect(screen.getByText(/suscetibilidade_alta_chuva_moderada_ou_mais/)).not.toBeVisible()
    fireEvent.click(reasons)
    expect(
      screen.getByText(/suscetibilidade_alta_chuva_moderada_ou_mais/),
    ).toBeVisible()
    expect(
      screen.getByText(/Não são probabilidade, nota de risco nem previsão/),
    ).toBeVisible()
  })

  it('explica quando ainda não há avaliação', () => {
    render(
      <AvaliacaoResultadoCard
        avaliacao={null}
        isLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('Ainda não há avaliação para exibir')).toBeVisible()
    expect(
      screen.getByText(/Nenhuma classificação é inventada quando falta base/),
    ).toBeVisible()
  })

  it('mostra erro de carregamento sem classificar', () => {
    render(
      <AvaliacaoResultadoCard
        avaliacao={null}
        isLoading={false}
        error="A migration da Etapa 5.2 ainda não está disponível."
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A migration da Etapa 5.2 ainda não está disponível.',
    )
  })
})

describe('AvaliacaoCondicoesCard', () => {
  it('separa suscetibilidade, chuva observada e previsão', () => {
    render(
      <AvaliacaoCondicoesCard
        evidencias={avaliacao.evidencias}
        previsao={makePrevisao()}
        previsaoEmCache={false}
        resultado={avaliacao.resultado}
      />,
    )

    expect(screen.getByText('Suscetibilidade')).toBeVisible()
    expect(screen.getByText('Carta oficial')).toBeVisible()
    expect(screen.getByText('Chuva observada')).toBeVisible()
    expect(screen.getByText('Previsão 24 h')).toBeVisible()
    expect(screen.getByText('Modelo')).toBeVisible()
    expect(screen.getByText('15,0 mm')).toBeVisible()
    expect(screen.getByText('20,0 mm')).toBeVisible()
    expect(
      screen.getByText(/Esse percentual é de chuva, não de alagamento/),
    ).toBeVisible()
    expect(
      screen.getByText(/Previsão é resultado de modelo meteorológico/),
    ).toBeVisible()
  })

  it('não apresenta previsão como chuva observada', () => {
    const semEstacao = avaliarPreventivamente(
      makeEntrada({
        evidencias: makeEvidencias({ estacoes: [] }),
        previsao: makePrevisao({ precipMm24h: 40 }),
      }),
    )

    render(
      <AvaliacaoCondicoesCard
        evidencias={semEstacao.evidencias}
        previsao={makePrevisao({ precipMm24h: 40 })}
        previsaoEmCache={true}
        resultado={semEstacao.resultado}
      />,
    )

    expect(screen.getByText('Sem leitura fresca')).toBeVisible()
    expect(
      screen.queryByText(/Previsão indisponível ou desatualizada/),
    ).not.toBeInTheDocument()
    expect(screen.getByText('40,0 mm')).toBeVisible()
    expect(screen.getByText(/Valor vindo do cache local/)).toBeVisible()
  })
})

describe('AvaliacaoDadosCard', () => {
  it('lista dados ausentes e desatualizados com limite e idade', () => {
    const resultado = {
      ...avaliacao.resultado,
      nivel: 'dados_insuficientes' as const,
      dadosAusentes: [
        {
          codigo: 'chuva_observada_fresca',
          descricao: 'Nenhuma estação com leitura fresca.',
          fonte: 'CEMADEN',
        },
      ],
      dadosDesatualizados: [
        {
          codigo: 'previsao_desatualizada',
          descricao: 'Previsão antiga.',
          fonte: 'Open-Meteo',
          idadeHoras: 9,
          limiteHoras: 6,
          referenciaEm: '2026-11-07T04:00:00Z',
        },
      ],
    }

    render(
      <AvaliacaoDadosCard resultado={resultado} evidencias={avaliacao.evidencias} />,
    )

    expect(screen.getByText('Base incompleta')).toBeVisible()
    expect(screen.getByText(/Nenhuma estação com leitura fresca/)).toBeVisible()
    expect(screen.getByText(/Previsão antiga/)).toBeVisible()
    expect(screen.getByText(/idade de 9,0 h/)).toBeVisible()
    expect(screen.getByText(/limite de 6,0 h/)).toBeVisible()
    expect(
      screen.getByText(/A regra não foi aplicada porque faltam dados/),
    ).toBeVisible()
  })
})

describe('AvaliacaoAreasCard', () => {
  it('exibe a classe cartográfica e o aviso de que não é risco atual', () => {
    render(<AvaliacaoAreasCard evidencias={avaliacao.evidencias} />)

    expect(screen.getByText('Áreas de suscetibilidade no raio')).toBeVisible()
    expect(screen.getByText(/Inundação · Alta/)).toBeVisible()
    expect(screen.getByText(/ponto contido/)).toBeVisible()
    expect(
      screen.getByText(/A carta descreve o terreno e não reage à chuva/),
    ).toBeVisible()
  })

  it('trata ausência de área como incerteza, não como segurança', () => {
    render(
      <AvaliacaoAreasCard
        evidencias={makeEvidencias({ suscetibilidade: [] })}
      />,
    )

    expect(screen.getByText(/Nenhuma área mapeada no raio/)).toBeVisible()
    expect(screen.getByText(/não significa ausência de risco/)).toBeVisible()
  })
})

describe('AvaliacaoAcoesCard', () => {
  it('explica que visitante não persiste e oferece login', () => {
    render(
      <MemoryRouter>
        <AvaliacaoAcoesCard {...acoesProps()} isAuthenticated={false} />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(/A prévia pública da região não é salva/),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Entrar para registrar' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /Registrar avaliação/ }),
    ).not.toBeInTheDocument()
  })

  it('habilita registro do usuário autenticado e explica privacidade', () => {
    render(
      <MemoryRouter>
        <AvaliacaoAcoesCard {...acoesProps()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /Registrar avaliação/ })).toBeEnabled()
    expect(
      screen.getByText(/Não guarda\s+coordenadas do imóvel/),
    ).toBeVisible()
    expect(
      screen.getByText(/Nenhum e-mail, SMS, push ou WhatsApp é enviado/),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Gerar prévia interna/ }),
    ).toBeDisabled()
  })

  it('mostra a prévia interna como não enviada', () => {
    render(
      <MemoryRouter>
        <AvaliacaoAcoesCard
          {...acoesProps()}
          lastRegisteredId="00000000-0000-4000-8000-000000000001"
          previa={{
            id: 1,
            titulo: 'Prévia interna — Atenção forte experimental',
            corpo: 'Mensagem de teste. Não é alerta oficial.',
            criadaEm: '2026-11-07T15:00:00Z',
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('Prévia interna · não enviada')).toBeVisible()
    expect(
      screen.getByText('Prévia interna — Atenção forte experimental'),
    ).toBeVisible()
    expect(screen.getByText(/Não é alerta oficial/)).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Gerar prévia interna/ }),
    ).toBeEnabled()
  })
})

describe('AvaliacaoHistoricoCard', () => {
  it('mostra versão, nível e dados ausentes do histórico', () => {
    render(
      <AvaliacaoHistoricoCard
        historico={[
          {
            id: '00000000-0000-4000-8000-000000000001',
            iniciadaEm: '2026-11-07T14:55:00Z',
            origem: 'imovel',
            municipio: 'Cajamar',
            bairro: 'Polvilho',
            regiao: null,
            regraVersao: 'exp-2026.11-v1',
            motorVersao: '1.0.0',
            nivel: 'atencao_experimental',
            nivelOrdem: 2,
            titulo: 'Atenção experimental',
            resumo: 'Resumo experimental.',
            motivos: [],
            dadosAusentes: [
              {
                codigo: 'previsao_fresca',
                descricao: 'Previsão desatualizada.',
                fonte: 'Open-Meteo',
              },
            ],
            dadosDesatualizados: [],
            totalEvidencias: 4,
          },
        ]}
        isLoading={false}
        error={null}
      />,
    )

    expect(screen.getByText('Atenção experimental')).toBeVisible()
    expect(screen.getByText(/Regra exp-2026.11-v1/)).toBeVisible()
    expect(screen.getByText(/1 dado\(s\) ausente\(s\)/)).toBeVisible()
  })
})

describe('ExperimentalAnalysisCard', () => {
  it('aponta para o módulo sem prometer alerta oficial', () => {
    render(
      <MemoryRouter>
        <ExperimentalAnalysisCard />
      </MemoryRouter>,
    )

    expect(screen.getByText('Análise preventiva')).toBeVisible()
    expect(
      screen.getByText(/não é alerta oficial e não estima\s+probabilidade de alagamento/),
    ).toBeVisible()
    expect(
      screen.getByRole('link', {
        name: /(Abrir análise preventiva|Ver detalhes do módulo)/,
      }),
    ).toBeInTheDocument()
  })
})
