# Treinamento offline — estado real da entrega

**Não foi possível treinar um modelo real de Cajamar nesta execução.** As duas
bases SQLite locais têm zero medições de chuva e não possuem tabela de ocorrências.
A consulta de leitura ao Supabase falhou por conexão. Isso não informa o conteúdo
do banco remoto. A rotina de treino foi implementada e testada com fixtures,
que não foram salvas como um modelo nem usadas para afirmar precisão real.

## Fontes verificadas

- [CEMADEN: pluviômetros e séries históricas](https://www2.cemaden.gov.br/pluviometros-automatico/).
- [Mapa CEMADEN](https://mapainterativo.cemaden.gov.br/): baixar dados de SP,
  depois filtrar Cajamar, código IBGE 3509205. O acesso ao histórico não forneceu
  um CSV nesta execução; o endpoint antigo apresentou redirecionamento em ciclo.
- [Manual do mapa](https://mapainterativo.cemaden.gov.br/arquivos/MapaInterativo.pdf):
  descreve o download por estado, mês e ano. Os horários de dados devem ser
  interpretados em UTC, não como horário local.
- [Atlas Digital: base completa](https://atlasdigital.mdr.gov.br/paginas/downloads.xhtml):
  fonte potencial de ocorrências municipais, não comprova ausência de alagamento
  em um endereço ou dá automaticamente a hora exata de cada evento.
- [ARTESP OC21508](https://ccm.artesp.sp.gov.br/rodovias/oc21508): candidato a
  ocorrência em Cajamar encontrado na pesquisa. A página retornou 403 no acesso;
  não foi inserida como rótulo, posição ou instante confirmado no treino.
- [Open-Meteo Single Runs](https://open-meteo.com/en/docs/single-runs-api): fonte
  possível de previsões por emissão. Reanálise meteorológica não substitui uma
  previsão disponível na data da decisão. Data de inicialização não comprova
  sozinha o horário em que o sistema teve acesso à previsão.

## O que foi implementado

`importar_cemaden.importar_csv` lê o formato CSV com separador ponto e vírgula,
filtra Cajamar/SP, preserva valores brutos, hash do arquivo e data real de download.
Não converte automaticamente a coluna `valorMedida` em acumulado de 24 horas,
não preenche leituras ausentes com zero e não inventa disponibilidade histórica.
É preciso verificar a semântica dos valores e a cobertura temporal antes de somar.
Um arquivo baixado hoje não prova que os mesmos valores foram recebidos no passado.

`treinamento.py` ajusta um candidato de regressão logística L2, normaliza com
estatísticas apenas do treino e ajusta uma calibração sigmoide em um período
posterior separado. O teste final fica separado dos dois ajustes. Não há seleção
de hiperparâmetros no teste. A implementação usa NumPy já listado no projeto;
não depende de downloads de pacotes novos.

Os cortes são datas explícitas. Janelas cujo desfecho só ficou conhecido depois
do corte são retiradas daquela etapa; episódios compartilhados entre partições
são rejeitados. O modelo fica candidato offline, sem conexão com o motor da UI,
sem notificações e sem ativação automática. O JSON contém pesos e métricas,
nunca código executável ou pickle.

## Arquivo de treino

Salvar em `data/training/cajamar.jsonl` (ignorado pelo Git), um objeto JSON por
linha com os campos:

| Campo | Significado |
| --- | --- |
| janela_id | Região/ponto + instante únicos, sem nome de morador |
| episodio_id | Identificador da mesma tempestade/episódio; também agrupar controles correlacionados |
| decisao_em, fim_janela | ISO 8601 com fuso; horizonte exatamente de 24h |
| entradas_disponiveis_em | Última disponibilidade real entre todas as entradas |
| desfecho_confirmado_em | Quando se confirmou o acompanhamento da janela inteira |
| ocorreu_alagamento | Booleano confirmado; ausência de relato não é falso |
| acompanhamento_completo | Booleano verdadeiro, com evidência auditável |
| fonte_desfecho, fonte_entradas | Referências verificáveis de origem |
| chuva_observada_24h_mm | Acumulado anterior à decisão, sem misturar intervalo ou leitura ausente |
| chuva_prevista_24h_mm | Previsão emitida e disponível antes da decisão, para a janela futura |
| declividade_graus, elevacao_relativa_m | Terreno no ponto avaliado; cobertura válida |

Não inclui coordenadas ou dados pessoais no artefato. O preparo do conjunto deve
manter localização e proveniência em registro privado separado para auditoria.
Não fabricar janelas negativas a partir de um catálogo incompleto de desastres.

## Executar quando houver os dados

Na raiz do projeto com as dependências instaladas:

```powershell
python -m motor_probabilistico.treinamento --dados data/training/cajamar.jsonl --inicio-calibracao 2024-01-01T00:00:00Z --inicio-teste 2025-01-01T00:00:00Z --saida models/candidato-v1.json
```

As datas são exemplos de comando, não datas escolhidas para os dados de Cajamar.
Defina-as depois de inventariar a cobertura, antes de olhar resultados do teste.
São exigidas no mínimo 20 janelas e 2 casos de cada classe em cada partição,
apenas como piso técnico contra ajustes degenerados; isso não garante validade
estatística. O comando rejeita dados ausentes e não cria modelo nesse caso.
O comando não sobrescreve saída existente.

`prever_candidato` permite inferência local com um artefato compatível, os mesmos
quatro fatores e datas de decisão/disponibilidade. Exige treino anterior à decisão.
Ausência de cobertura, atraso de dados ou mudança de distribuição precisam de
avaliação adicional antes de integrar ao aplicativo.

## Limites

Nenhuma porcentagem real de acerto foi obtida. Não há estimativa de incerteza por
episódio, validação espacial, avaliação hidrológica ou aprovação operacional.
Um calibrador ajustado não garante que a probabilidade esteja calibrada em campo.
O contrato verifica consistência declarada, não autentica documentos externos.
Veja também `MOTOR_VALIDACAO.md`.

Referências: [calibração de probabilidades](https://scikit-learn.org/stable/modules/calibration.html)
e [prevenção de vazamento e normalização consistente](https://scikit-learn.org/stable/common_pitfalls.html).
Essas referências orientam o método; o código usa uma implementação NumPy local.
