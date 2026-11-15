# Revisão de UI e UX — MVP

Revisão local da interface. Nenhum deploy, push ou alteração no Supabase remoto.

## Alterações implementadas

| Fluxo | Melhoria | Arquivos em frontend/src |
| --- | --- | --- |
| Início | Clima, previsão e chuva observada recebem prioridade. Fontes e privacidade ficam em seção expansível; endereço privado e canais oficiais permanecem acessíveis. | pages/HomePage.tsx, components/home/* |
| Navegação | Quatro destinos principais, cabeçalho compacto, menos ruído sobre fases do projeto e área da conta identificável. | components/layout/{Sidebar,BottomNav,TopBar,AppShell}.tsx |
| Menu móvel | Foco inicial, contenção de Tab, Escape, retorno ao botão e fundo inativo enquanto aberto. | components/layout/MobileMenu.tsx |
| Mapa | Busca na lista por nome, código ou cidade sem exigir acentos; limpar busca; camadas junto ao mapa em painel expansível. A busca mantém os marcadores e informa esse comportamento. | pages/MapPage.tsx, components/map/StationList.tsx |
| Formulários | Rótulos associados aos campos, mensagens vinculadas, foco no primeiro campo inválido, indicação de salvamento e bloqueio de edição durante a gravação do contato. | components/contatos/ContatoForm.tsx, components/address/AddressForm.tsx, lib/formFocus.ts |
| Conta | Mostrar/ocultar senha; indisponibilidade da conta explicada com acesso alternativo ao clima e mapa. | pages/LoginPage.tsx, components/auth/SupabaseSetupNotice.tsx |
| Leitura | Textos pequenos ampliados, controles principais de 44 px, campos móveis de 16 px, foco visível, rolagem da previsão perceptível e respeito à redução de movimento. | index.css, components/ui/* |

A interface mantém a distinção entre previsão e observação. Ausência de leitura não significa chuva zero. Não há promessa de notificações ativas nem de probabilidade calibrada de alagamento.

## Evidência e limites

- TypeScript, oxlint e geração da versão de produção passaram.
- Suíte completa: 286 testes aprovados. Depois, os dois novos testes de busca e senha passaram junto aos testes das respectivas páginas (16 aprovados). Total atual: 288 casos; os dois últimos foram executados em rodada direcionada.
- Os testes de menu verificam foco, Tab/Shift+Tab, Escape, retorno ao botão, fundo inativo e fechamento por navegação. Os de contato verificam associação de rótulos, foco de erro, preservação de valores e bloqueio durante salvamento.
- A prévia local não abriu no navegador deste ambiente. Não houve inspeção visual por captura nem testes em aparelho real; não se declara conformidade WCAG.
- Backend, SQL e Edge Functions não foram modificados nesta revisão. Os resultados da auditoria anterior permanecem documentados separadamente.

## Conferência antes da publicação

| Cenário | Verificar manualmente | Estado |
| --- | --- | --- |
| 320, 390, 768 e 1440 px | Sem corte horizontal, ações visíveis, menu e mapa utilizáveis, rodapé não encoberto | Pendente |
| Zoom 200% e texto ampliado | Refluxo de textos, cabeçalho e formulários | Pendente |
| Teclado e leitor de tela reais | Ordem de leitura, navegação de rotas e menus, anúncio de erros | Pendente |
| Contraste medido | Todos os estados e pares de cores; foco e sobreposições no mapa | Pendente |
| Rede lenta/offline | Carregamento, atualização, ausência de dados e recuperação | Pendente |
| Conta de teste em ambiente próprio | Entrar, recuperar senha, cadastrar/editar endereço e contato sem perda de dados | Pendente |
| Mapa móvel | Gestos, zoom, popup, camadas e lista com dados reais | Pendente |

Referências de implementação: [tamanho de alvos WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [diálogo modal WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [notificações de formulários](https://www.w3.org/WAI/tutorials/forms/notifications/). Essas referências orientam a revisão; não substituem avaliação visual e assistiva.
