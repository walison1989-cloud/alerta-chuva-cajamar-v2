# Cruzamento espacial experimental — módulo Python local

O módulo novo `motor_probabilistico/cruzamento_espacial.py` estima chuva em um
ponto e cruza evidências para um índice ordinal de 0 a 3. **Não é uma previsão
validada de alagamento, percentual de probabilidade ou serviço de alerta.**
Este módulo Python continua sem conexão com a página Vercel estática. A página
tem uma implementação TypeScript separada, descrita em
`docs/TRIANGULACAO_MOTOR.md`; ela não executa nem substitui este cruzamento Python.

## Chuva estimada

- Aceita apenas `MedicaoChuva` com fonte CEMADEN, qualidade oficial, unidade mm,
  acumulado de 24h e coordenadas válidas. Outras redes ainda não têm observações
  integradas e ficam fora do cálculo. Catálogo e ausência de leitura não são zero.
- Exige leitura e disponibilidade anteriores à decisão, com leitura até 6h atrás.
  Usa a leitura mais recente por código e descarta conflitos na mesma data.
- Alinha o fim dos acumulados: diferença máxima de 1h entre leituras usadas.
  Essa tolerância não torna as janelas idênticas; é uma aproximação registrada.
- Usa até dez posições distintas num raio de 30 km. Postos coincidentes não
  acrescentam suporte geométrico. Identificadores físicos equivalentes ainda
  exigem curadoria externa; coordenadas arredondadas não resolvem todos os casos.
- A até 5 m de uma estação usa a leitura no ponto. Nos demais casos, calcula
  média com pesos proporcionais a 1/distância² (IDW), normalizados para somar 1.
- Distingue interpolação de extrapolação verificando se o ponto está dentro de
  algum triângulo não colinear dos postos selecionados. Fora desse suporte,
  informa estimativa parcial e não atribui índice geral.
- Retorna código, fonte, leitura, disponibilidade, peso, distância e amplitude
  dos valores. Não atribui erro estatístico nem confiança percentual ao IDW.

## Cruzamento

Exige observação com suporte espacial, previsão Open-Meteo conhecida na decisão
para as próximas 24h, terreno no ponto e cobertura cartográfica confirmada.
Previsão deve estar emitida há até 6h e seu ponto até 10 km do local avaliado.
Terreno deve ter declividade, elevação relativa e qualidade declaradas, em ponto
até 10 m do avaliado. Esses filtros são hipóteses operacionais, não validação local.

Não soma chuva das 24h passadas com a previsão futura. Usa a maior magnitude,
em faixas 0, até 10, até 30 e acima de 30 mm, adaptadas da regra experimental
existente. Sem dado, o fator permanece ausente.

| Condição com todas as bases válidas | Índice |
| --- | --- |
| Suscetibilidade média/alta e chuva acima de 10 mm | 3 |
| Suscetibilidade média/alta com alguma chuva; suscetibilidade baixa com chuva acima de 10 mm; chuva acima de 30 mm; ou terreno baixo/plano com chuva acima de 10 mm | 2 |
| Terreno baixo/plano com alguma chuva, sem condição anterior | 1 |
| Nenhuma condição anterior | 0: sem sinal nesta regra, nunca “seguro” |
| Base obrigatória ausente ou suporte espacial insuficiente | Índice nulo |

“Terreno baixo/plano” é uma hipótese: elevação relativa menor que -5 m, conforme
o limiar já usado no serviço de terreno, e declividade até 5°. Elevação relativa
é em relação à média local de 150 m, não altura sobre rio ou drenagem. O acréscimo
da condição de declividade e as combinações desta regra precisam de validação.
Não cobre adequadamente todos os mecanismos de enxurrada ou transbordamento.

Cartografia fora de cobertura é diferente de consulta completa sem polígono.
O módulo exige que o chamador declare essa distinção com fonte verificável;
ele não consulta polígonos nem autentica a origem declarada.

## Executar

Na raiz, com as dependências Python do projeto instaladas:

```powershell
python -m motor_probabilistico.executar_cruzamento --entrada data/training/entrada-cruzamento.json --saida models/resultado-cruzamento.json --usar-mdt-local
```

O JSON privado deve conter `schema:1`, `latitude`, `longitude`, `decisao_em`,
`medicoes`, `previsao`, `cartografia`. Datas usam ISO 8601 com fuso. `medicoes`
usa os nomes de `MedicaoChuva`; `previsao` usa `mm`, `emitida_em`, `disponivel_em`,
`inicio`, `fim`, `latitude`, `longitude`, `fonte`. `cartografia` usa
`cobertura_confirmada`, `contem_ponto`, `classe`, `tipo`, `fonte`.

Com `--usar-mdt-local`, reutiliza `consultar_terreno` e os rasters opcionais
documentados em `DADOS.md`. Sem o sinalizador, recebe também `terreno` com os
campos de `VariavelTopografica`. Se uma base não estiver disponível, informe
nulo em vez de inventar valor. Não sobrescreve um arquivo de saída existente.
As pastas de entrada e saída acima são ignoradas pelo Git.

Também pode chamar `avaliar_cruzamento_ponto` em `integracao_etapa5_2.py` com os
objetos estruturados. Isso não busca chuva ou previsão automaticamente nem grava
no Supabase. Para levar ao site, ainda falta um serviço autenticado que reúna as
fontes reais e os rasters sem expor dados privados. Não colocar token de admin
ou chave service_role no frontend. A página experimental permanece desativada.

## Limites e validação necessária

A qualidade máxima é `limitada_sem_validacao_local`. Não estima capacidade de
bueiro, impermeabilização, nível de rio, bacia ou drenagem, nem executa modelo
hidráulico. Precisamos retrospectiva e acompanhamento prospectivo com ocorrências
reais para calibrar limiares, cobertura e falhas por região. Os testes geométricos
e numéricos são sintéticos e não demonstram precisão em Cajamar.

Referências: [IDW — Esri](https://pro.arcgis.com/en/pro-app/3.6/tool-reference/spatial-analyst/how-idw-works.htm),
[escoamento e topografia — USGS](https://www.usgs.gov/water-science-school/science/surface-runoff-and-water-cycle).
