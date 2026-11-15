# Consulta de contatos falha no site publicado

A imagem enviada mostra uma falha de consulta, não comprova inexistência de
contatos. Não foi possível verificar o banco remoto neste ambiente.

## Corrigido no frontend

- Erros estruturados PostgREST não são mais convertidos indiscriminadamente em
  “verifique a conexão”. Códigos de coluna/tabela ausente, acesso recusado e sessão
  inválida recebem orientação distinta, sem expor a mensagem SQL interna.
- Quando a consulta falha, a página não mostra zero contatos nem “Nenhum contato
  cadastrado”. A criação fica bloqueada até recuperar a consulta, evitando
  cadastrar novamente um contato que já pode existir.
- A descrição deixa claro que o cadastro ainda não envia avisos.

## Para identificar a causa real

No SQL Editor do mesmo projeto Supabase usado pela Vercel, executar o arquivo
`supabase/scripts/diagnostico_contatos_read_only.sql` e conferir os resultados.
São consultas de estrutura e permissões, sem dados de moradores ou alterações.

- Tabela inexistente ou alguma coluna com `existe=false`: verificar migrations
  da Etapa 6. Não executar migrations antigas indiscriminadamente sobre uma base
  em uso; revisar primeiro as diferenças e preservar os dados existentes.
- `autenticado_pode_consultar=false`: conferir concessões e a migration aplicada.
- `rls_ativo=false`, acesso anônimo ou política que não isola o proprietário:
  revisar a proteção antes de liberar a página. Não desabilitar RLS para corrigir.
- Estrutura e permissões corretas: conferir sessão, projeto configurado na Vercel
  e código/resposta da chamada `contatos_alerta` na aba Network do navegador.

Não enviar tokens, cabeçalhos Authorization ou dados pessoais. O código do erro
e a saída desta consulta estrutural são suficientes para a próxima investigação.

Nenhuma correção de banco remoto foi aplicada. A correção visual e diagnóstica
neste pacote não garante que uma coluna ou permissão faltante já tenha sido criada.
