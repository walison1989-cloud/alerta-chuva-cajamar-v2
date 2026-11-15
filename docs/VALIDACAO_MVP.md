# Entrega MVP 0.3.0 — 08/11/2026

As correções de código dos 26 achados foram implementadas ou tiveram seu contrato corrigido para falhar de forma segura. A entrega está organizada para revisão e versionamento no GitHub. Não significa que o serviço esteja publicado ou aprovado em produção.

## Escopo entregue

Clima, previsão, mapa, estação CEMADEN sincronizada, cadastro/login, endereço e contatos privados. Sem envio de mensagens ou probabilidade calibrada. Na revisão base, a análise experimental estava desativada por padrão. Na atualização de 08/11/2026, a triangulação TypeScript ficou acessível por padrão, com opção de ocultar; consulte `TRIANGULACAO_MOTOR.md`. Histórico opcional explicitamente declarado pelo navegador nunca é evidência de treinamento validada. Ocorrências e administração incompletas foram retiradas dos menus do MVP.

## Evidência local

- Frontend: **282/282 testes**, tipos, lint e build passaram.
- Python: **83 testes passaram**. Após regenerar o terreno, mais **39 verificações relevantes passaram**; são uma repetição parcial, não 39 testes novos.
- Edge Functions: **11 testes de handlers/parser passaram** com serviços simulados, sem acessar o Supabase remoto.
- Rasters: regenerados a partir do MDT original; hashes e estado de NoData conferidos. Dados grandes entregues separadamente do Git.
- Foram adicionados cinco testes SQL de privacidade e vinte de proveniência, contatos, hash e cotas, além dos noventa existentes.

## Validação que depende do ambiente de destino

**Antes de abrir a usuários reais, é obrigatório a CI terminar verde e validar Auth/SMTP e RLS em homologação.** PostgreSQL/PostGIS/pgTAP, Deno e seis testes HTTP não foram executados com sucesso neste ambiente restrito. As tentativas HTTP ficaram bloqueadas na criação do socket local. A rede de pacotes retornou ENOTFOUND; instalação limpa e auditoria atualizada de CVEs não puderam ser feitas aqui. A CI foi preparada para essas verificações e não faz deploy.

O Python do ambiente emitiu aviso de depreciação do cliente HTTP e mensagens de sys.excepthook no encerramento de bibliotecas geográficas. Os testes locais terminaram com código 0; não foi apresentado isso como instalação limpa ou execução HTTP aprovada. A base PostgreSQL do protótipo legado permanece fora do escopo de publicação do MVP web.

## Situação dos achados

| ID | Problema | Correção/contrato atual |
|---|---|---|
| 01 | Acesso ao legado | Token administrativo, CORS restrito e consultas externas protegidas. |
| 02 | Verificação de contato | Migration limpa verificação/canais ao trocar o destino; pgTAP preparado. |
| 03 | Coordenadas em JSON | Validação recursiva e limite de payload; pgTAP preparado. |
| 04 | Data da ocorrência | ocorrido_em separado; sem backfill por verificação ou cadastro. |
| 05 | Vazamento temporal | Registro guarda disponibilidade/emissão/janelas; detector rejeita futuro e ausência de proveniência. |
| 06 | Elegibilidade da chuva | Filtro estrito de fonte, janela, unidade, qualidade, disponibilidade e distância. |
| 07 | Meteorologia inventada | Fallback removido; 24h fechadas em UTC; ausência fica indisponível. |
| 08 | NoData | Correção preservada e rasters regenerados; máscara com três estados. |
| 09 | Troca de conta | Árvore privada remontada; testes A/B, logout e leitura inicial atrasada. |
| 10 | Previsão de outro ponto | Estado vinculado à chave; dados privados somente em memória. |
| 11 | Horários futuros | Leitura/consulta futura rejeitada como evidência recente. |
| 12 | Histórico e hash | Digest calculado no servidor; classificação explicitamente declarada pelo cliente e não validada. |
| 13 | Geocodificação | JSON validado, falhas controladas, logs sem resposta privada e cotas persistentes. |
| 14 | Área/UF | Limites espaciais obrigatórios e metadados contraditórios rejeitados. |
| 15 | Leitura de raster | Janela 1x1 e índices validados. |
| 16 | Área baixa | False separado de desconhecido; derivados corrigidos. |
| 17 | Valores inválidos | NaN, infinito, chuva negativa e coordenadas inválidas rejeitados. |
| 18 | Entrada/configuração | Validação 422; ordenação dos limiares antes de persistir. |
| 19 | Modo/suscetibilidade | Estado recarregado da persistência; suscetivel=False impede emissão. |
| 20 | Limpeza de simulação | Origem e UUID próprios; transação única; demais alertas preservados. |
| 21 | Consulta da apostila | Cálculo por timestamps tipados em fuso SP; teste dos valores. |
| 22 | Ponto inventado | Sem fallback por CEP/centro/bairro adjacente; confirmação necessária. |
| 23 | JSONP | Desabilitado por padrão e proibido no build de produção; CSP restritiva. |
| 24 | Pacote para Git | Fontes limpas, ignore, verificador e exemplos sem configurações privadas. |
| 25 | Credenciais em log | URL e exceção de conexão não são interpoladas nos logs. |
| 26 | Reprodução/integração | Dependências diretas fixadas, CI, testes descobertos e rota administrativa experimental desativada por padrão. |

As migrations novas foram apenas preparadas localmente. Elas não recalculam evidências históricas, não completam datas desconhecidas e não transformam resultados do cliente em verdade científica. A calibração de um modelo requer dados reais e validação independente; isso não pode ser resolvido inventando percentuais.

## Arquivos e publicação

- `mvp-cajamar-github.zip`: fontes limpas, CI, testes, exemplos e instruções; sem configurações privadas, bancos, dependências, builds ou rasters.
- `alerta-chuva-cajamar-mvp/`: a mesma árvore de fontes para abrir no editor e preparar o Git.
- `dados-terreno-mvp.zip`: dados geográficos gerais do município, sem cadastros, para a pesquisa opcional; não enviar ao Git comum.
- `docs/PUBLICACAO.md`: instruções para commit/push e publicação após validação.

Nenhum repositório remoto foi criado, nenhum push foi executado e o Supabase remoto não foi alterado. Não havia endereço de repositório ou identidade Git configurada nesta sessão; a pasta local pode ser revisada e receber o primeiro commit com a identidade do proprietário.
