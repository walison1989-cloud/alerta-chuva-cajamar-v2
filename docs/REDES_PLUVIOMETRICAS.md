# Redes pluviométricas — inclusão local e limites

Esta atualização acrescenta fontes complementares ao mapa sem mudar o banco
remoto, a coleta CEMADEN ou o motor. **Não conecta quatro redes de chuva em tempo
real.** As integrações e pendências são identificadas na interface.

## Situação verificada

| Rede | Acesso constatado | O que esta versão entrega |
| --- | --- | --- |
| CEMADEN | Já consumido pelas views e sincronização do projeto | Camada principal existente, acumulado de 24h quando disponível |
| INMET | Catálogo JSON oficial consultado na pesquisa; consulta Node local falhou por conexão. Endpoint de observações não pôde ser validado | Consulta de catálogo no servidor da Vercel; estações INMET operantes até 30 km do centro de Cajamar, sem valores de chuva. Mostra indisponibilidade se a origem recusar a conexão |
| SP Águas | Catálogo público contém Ponunduva, E3-233, Cajamar, 23°21'00" S / 46°56'00" W | Metadados transcritos do catálogo oficial em 08/11/2026. Posição aproximada, sem confirmação de operação ou leitura atual; não é coleta automática SP Águas |
| ANA | API automática exige cadastro/autorização na fonte | Referência oficial e estado “Acesso pendente”; não recebe leituras nesta versão |

Não foi confirmada nesta tarefa uma interface pública estável para automatizar
as leituras do SP Águas. A ausência de acesso neste ambiente não prova que o
serviço inexista. A mesma estação pode aparecer em várias redes: não somar
leituras entre elas nem afirmar independência sem confrontar seus identificadores.

## Implementação

- `frontend/api/rain-sources.mjs`: endpoint GET público, somente metadados.
- `frontend/server/rain-sources.mjs`: catálogo INMET com URL fixa, sem credenciais,
  timeout de 8s, limite de 3 MB, cache de 30 min e compartilhamento de requisições
  simultâneas na mesma instância. Falhas são reapuradas após 1 min.
- A consulta não recebe coordenadas do imóvel, token ou conta. O centro é fixo
  em Cajamar e o raio é 30 km. A resposta não contém distância ao morador.
- A mesclagem usa fonte + código. Registro já sincronizado prevalece sobre
  metadado de catálogo. Não elimina postos de redes diferentes por proximidade.
- `useRainCatalog` carrega a fonte complementar separadamente: falhas não apagam
  os dados CEMADEN. O painel tem links oficiais e estados por rede.
- O filtro de rede afeta mapa e lista. A busca textual continua afetando apenas
  a lista, como informa a interface.
- Postos de catálogo mantêm leitura, horário, janela, status operacional e
  distância privada nulos. Eles não alimentam o motor, o treino ou alertas.
- O rewrite da SPA exclui `/api/`; o service worker também não usa o HTML da SPA
  como resposta de navegação para essa rota.

## Instalar a atualização

1. Guarde uma cópia da pasta atual. Extraia o ZIP de atualização em
   `D:\alerta-chuva-cajamar`, mantendo `frontend`, `docs` e `.github` nessa raiz.
   O ZIP não contém `.env.local`, `.git`, banco, moradores ou credenciais.
2. Não apague o `.env.local` que já funciona. Não altere os secrets do Supabase
   por causa desta atualização. Em especial, mantenha `ALLOWED_ORIGINS` configurado
   com o domínio que resolveu a busca do endereço.
3. No PowerShell, na pasta do projeto:

```powershell
git add .
git status
git commit -m "Adiciona catalogos e status das redes pluviometricas"
git push
```

O push em repositório conectado pode iniciar uma publicação automática na Vercel.
Esta entrega não executou nenhum desses comandos no repositório remoto.

Na Vercel, manter **Root Directory = frontend** e Node 24.x. A pasta `api` precisa
ser publicada junto do frontend; copiar apenas `dist` para hospedagem estática
não inclui o endpoint. Nenhuma variável secreta nova é necessária para estes
catálogos. As variáveis existentes do Supabase continuam necessárias para a conta.

`npm run dev` é apenas Vite e não executa a função da Vercel. Nesse modo a consulta
complementar pode ficar indisponível. Para a execução completa, usar o ambiente
de desenvolvimento da Vercel (`vercel dev`) ou uma publicação de homologação.

## Conferência após a publicação

1. Abrir `/api/rain-sources`: deve responder JSON com `schema: 1`, `stations` e
   `sources`, nunca HTML nem pedido de login.
2. Abrir `/mapa`: conferir painel de redes, filtro, Ponunduva com “Somente catálogo”
   e leituras CEMADEN que já existiam. Não tratar marcador cinza como chuva zero.
3. Se o INMET ficar indisponível, conferir logs da função. O acesso pelo servidor
   publicado ainda precisa ser confirmado; não remover controles de acesso da fonte.
4. Fazer login e conferir endereço e distâncias existentes. Os novos catálogos
   não acrescentam cálculo de distância do imóvel.

Ainda falta validação visual no navegador/celular e execução real do endpoint na
Vercel. O build local não confirma acesso externo ou a infraestrutura publicada.

## Próximas integrações de medições

- INMET: validar endpoint autorizado de observações e sua semântica horária antes
  de calcular acumulados; exigir todas as parcelas, sem substituir lacunas por zero.
- SP Águas: confirmar API/exportação automatizada e condições de acesso; incluir
  timestamps de leitura, janela e operação real antes de publicar valores.
- ANA: solicitar acesso pelo canal oficial atual, depois configurar credenciais
  somente no servidor e validar as permissões e estações disponíveis. Esta entrega
  não enviou mensagens à agência e não solicita CPF ou senha no frontend.
- Redes compartilhadas: mapear identificadores equivalentes com evidência oficial.
  A inclusão dos catálogos não fornece histórico suficiente para treinar alagamento.

## Fontes primárias

- [INMET — catálogo JSON](https://apitempo.inmet.gov.br/estacoes/T)
- [INMET — mapa oficial](https://portal.inmet.gov.br/servicos/mapa-de-esta%C3%A7%C3%B5es-meteorol%C3%B3gicas)
- [SP Águas — catálogo pluviométrico](https://ph.spaguas.sp.gov.br/Pluviometricos)
- [SP Águas — monitoramento e acesso ao Chuva Agora](https://hub.spaguas.sp.gov.br/monitoramento_hidrologico)
- [ANA — instruções de acesso à API](https://www.gov.br/ana/pt-br/assuntos/monitoramento-e-eventos-criticos/monitoramento-hidrologico/orientacoes-manuais/manuais/manual-hidrowebservice_publica.pdf)
- [Vercel — funções Node](https://vercel.com/docs/functions/runtimes/node-js)
