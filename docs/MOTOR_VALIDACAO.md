# Motor: primeira etapa de validação

O motor 2.0 atual descreve entradas e mantém percentual nulo. A nova camada
`motor_probabilistico/validacao.py` permite avaliar probabilidades de um futuro
modelo candidato, sem ativá-lo no aplicativo e sem inventar precisão.

## Contrato

Cada `CasoValidacao` representa uma região/ponto e uma janela identificada por
`janela_id`. Os campos exigem: decisão, encerramento da janela, disponibilidade
das entradas, fim do treino, confirmação do desfecho, fonte do desfecho,
acompanhamento completo, versão do modelo e probabilidade entre 0 e 1.

Use apenas janelas com acompanhamento capaz de confirmar presença **ou ausência**
de alagamento. Falta de ocorrência cadastrada não equivale a ausência de alagamento.
Os identificadores devem representar janelas únicas, sem dados pessoais.

O módulo rejeita datas sem fuso, entradas futuras, treino posterior ou coincidente
com a decisão, desfechos confirmados antes do encerramento, duplicatas, horizontes
ou versões misturadas. São verificações do contrato declarado: não autenticam a
fonte nem detectam todos os vazamentos de um treinamento externo.

## Uso local

Importe `CasoValidacao` e `avaliar_previsoes` de `motor_probabilistico.validacao`.
Passe a lista de casos, `limiar` e `probabilidade_referencia` explicitamente.
Ambos devem ser escolhidos com os dados de treino, antes de consultar os resultados
de teste. Não ajuste o limiar repetidamente no mesmo conjunto de teste.

O relatório contém matriz de confusão, precisão dos alertas, sensibilidade,
taxa de falsos positivos, acurácia, Brier, comparação com referência constante
e dez faixas de calibração. Divisões sem denominador retornam nulo.
Uma amostra com apenas uma classe é explicitamente sinalizada.

As métricas são por janela: várias janelas da mesma tempestade não são episódios
independentes. Acurácia isolada pode esconder eventos perdidos. Esta etapa não
inclui intervalos de confiança, agrupamento por tempestade ou ajuste de modelo.

## Próxima etapa com dados reais

1. Inventariar datas e posições confiáveis das ocorrências, leituras CEMADEN e
   previsões arquivadas com data de emissão e coleta. Previsão consultada hoje
   não reconstitui o que o sistema sabia no passado.
2. Definir alvo: alagamento em qual área, nas próximas quantas horas, e como se
   confirma um período sem alagamento. Separar transbordamento e deslizamento.
3. Montar janelas regulares sem escolher instantes a partir das ocorrências futuras.
   Separar treino, calibração e teste no tempo, impedindo que a mesma tempestade
   apareça nos dois lados; eliminar sobreposição dos horizontes na fronteira.
4. Comparar um candidato simples com referência constante e regra de chuva.
   Avaliar resultados por bairro, estação e episódio antes de decidir pelo piloto.
5. Registrar previsões antecipadamente em modo de acompanhamento, sem disparar
   mensagens. Só depois avaliar calibração, falsos alarmes e antecedência útil.

Não houve acesso ao Supabase remoto, treino com dados reais nem habilitação
de alertas nesta entrega. Fixtures dos testes são sintéticas e servem apenas
para verificar as contas e rejeições do contrato.
