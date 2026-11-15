# Correção da interpretação de suscetibilidade — revisão de segurança

## Escopo implementado nesta cópia

- A classe territorial usada na matriz experimental passa a corresponder **somente** a um polígono oficial que contém o ponto analisado. Uma área próxima é contexto cartográfico, não evidência de exposição do lote.
- Se nenhuma área contém o ponto, a avaliação por imóvel retorna **dados insuficientes** em vez de converter proximidade ou ausência de polígono em conclusão de risco.
- Quando vários polígonos estão próximos, a seleção prioriza aqueles que contêm o ponto; dentro do conjunto, usa a maior classe. A área próxima ainda é exibida e explicada.
- A estação representativa da matriz deixa de ser a que mais choveu e passa a ser a mais próxima entre as elegíveis. **Essa mudança não transforma chuva na estação em chuva no imóvel**; a triangulação independente tem salvaguardas adicionais de cobertura geométrica.
- A página de análise solicita novamente dados em intervalos de 10 minutos, apenas enquanto aberta/visível e conectada. Não há monitoramento remoto ininterrupto, notificações automáticas ou promessa de atualização em tempo real em segundo plano.
- A interface inclui ressalva explícita de que topografia relativa e conectividade hidrológica ainda não são entradas da regra da matriz.

## O que ainda NÃO foi implementado

Este ZIP não contém um modelo digital de terreno georreferenciado, determinação de bacia para cada lote, HAND (Height Above Nearest Drainage), caminhos de escoamento, vazão/nível dos córregos, previsão por hora integrada à regra nem calibração local de limiares. Portanto, a matriz experimental não pode ser chamada de previsão validada de alagamento do imóvel. É necessário obter dados oficiais adequados e validar desempenho com episódios reais antes de ativar alertas operacionais.

### Próxima evolução segura

1. Registrar fonte, precisão horizontal/vertical, resolução e data dos dados altimétricos; rejeitar geometria sem precisão conhecida.
2. Derivar altitude relativa/HAND, declividade e conectividade à drenagem em serviço geoespacial. Não inferir ausência de risco de alagamento urbano apenas porque o ponto está fora de polígonos mapeados.
3. Vincular chuva observada de estações a áreas de contribuição/bacias, levando em conta lag temporal, qualidade e atualização; preservar ausência de dados como desconhecido.
4. Usar previsão horária (não só acumulado de 24h) e separar janelas passadas/futuras para evitar dupla contagem. Manter dados usados e momento de emissão da previsão.
5. Produzir níveis por mecanismo (inundação de córrego, enxurrada, drenagem urbana), acompanhados de confiança e explicação.
6. Calibrar limiares contra ocorrências e **períodos verificados sem ocorrência**. Comparar falsos alarmes e eventos não detectados por região e tempestade.
7. Rodar avaliação em servidor agendado, com idempotência, regras versionadas e auditoria, antes de oferecer avisos automáticos.

## Implantação

Sem alteração de banco nesta entrega. Não aplicar migrations remotas. Validar `npm ci`, `npm run typecheck`, `npm test` e `npm run build` com Node compatível com `frontend/package.json` (>=24 <27) antes de criar release/merge. Nada foi publicado em produção.
