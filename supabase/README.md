# Supabase — MVP

Migrations incrementais, RLS, PostGIS e duas Edge Functions. Não há credenciais reais nem acesso remoto implícito.

## Testar localmente

Com Docker ativo e Supabase CLI:

```text
supabase start
supabase db reset --local
supabase test db
```

O reset é destrutivo somente para o banco local; não use `--linked` ou `--db-url` em produção. A CI inicia banco descartável e não tem secrets de produção. Aplique a sequência completa em ambiente isolado antes de habilitar acesso público.

As migrations novas incluem: invalidação da verificação ao alterar contato; rejeição recursiva de chaves de coordenadas; limite de payload; digest do conteúdo calculado pelo servidor; marcação imutável de histórico como declaração do cliente; momento real da ocorrência separado da verificação; cota distribuída de geocodificação. Dados históricos sem data real continuam desconhecidos. Nenhuma data é inferida ou preenchida automaticamente.

## Edge Functions

Copie `functions/.env.example` para um arquivo local privado. `geocode-address` valida o token em `auth.getUser` e chama a RPC de cota. Sem a migration da cota, retorna indisponibilidade em vez de consumir a API sem limite. Limites: 10 consultas/minuto e 100/dia por conta; 100/minuto e 5000/dia por projeto. São limites operacionais ajustáveis na migration, não critérios hidrológicos.

`sync-cemaden` usa `x-sync-secret` configurado no servidor e service_role apenas internamente. Ambas têm `verify_jwt=false` porque usam os mecanismos explícitos descritos; isso não dispensa sua autenticação própria.

```text
supabase functions serve --env-file supabase/functions/.env.local
node --test supabase/functions/tests/handlers.test.mjs
```

Os testes Node cobrem handlers com Auth/fetch simulados e parser compartilhado; não substituem validação do runtime Deno ou teste integrado em homologação.

## Dados oficiais

Não existem estações nem polígonos de teste inseridos nas migrations. Configure a sincronização CEMADEN para a fonte oficial e importe a carta via `scripts/import_suscetibilidade.mjs` após verificar arquivo e checksum oficiais. O importador gera SQL para inspeção; não execute arquivos não verificados em banco hospedado. Sem importação, o app deve informar indisponibilidade. Operações de publicação/agendamento remoto são manuais e ficam fora desta entrega.

## Segurança do histórico

`execucoes_avaliacao.validado_servidor` é sempre falso e `natureza_registro` é sempre `declaracao_cliente`. O SHA-256 de JSONB é calculado a partir do conteúdo realmente armazenado, excluindo o próprio campo de hash. Esse digest verifica integridade do conteúdo, não a verdade das evidências ou o resultado do motor do navegador. Não alimentar treino ou notificações com esses registros.
