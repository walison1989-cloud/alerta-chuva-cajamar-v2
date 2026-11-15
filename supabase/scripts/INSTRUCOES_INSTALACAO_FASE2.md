# INSTRUÇÕES — Instalação Segura da Migration Fase 2

**Projeto:** `D:\alerta cajamara 1`
**Supabase:** `csobfhhvvqqhqinfllri`
**Migration:** `supabase/migrations/20261107200000_etapa6_contatos_morador.sql`
**Script de teste:** `supabase/scripts/test_contatos_fase2.sql`

---

## 1. Verificação de Ferramentas (executar no terminal Windows)

Execute os comandos abaixo no PowerShell para verificar se as ferramentas estão disponíveis:

```powershell
# Verificar Docker
docker --version
docker info

# Verificar Supabase CLI
supabase --version

# Verificar Git
git --version
```

**Resultado esperado:** Cada comando deve exibir a versão instalada. Se algum comando falhar com "não reconhecido", a ferramenta não está instalada e precisa ser instalada manualmente antes de prosseguir.

**Situação atual (verificada em 08/11/2026):**
- Docker: **não instalado**
- Supabase CLI: **não instalado**
- Git: **não instalado**

Essas ferramentas são necessárias para executar testes SQL reais em ambiente isolado e para aplicar a migration no Supabase hospedado.

---

## 2. Preparação de Ambiente Isolado (PostgreSQL + PostGIS)

Para testar a migration antes de aplicar no banco hospedado, você precisa de um PostgreSQL com PostGIS localmente.

### Opção A: Docker (recomendado)

```powershell
# Criar container PostgreSQL com PostGIS
docker run --name alerta-chuva-postgis-test \
  -e POSTGRES_PASSWORD=senha_teste_local \
  -e POSTGRES_DB=alerta_chuva_cajamar \
  -p 5432:5432 \
  -d postgis/postgis:15-3.3

# Aguardar o container iniciar
docker ps

# Executar o script de teste
psql -h localhost -U postgres -d alerta_chuva_cajamar -f supabase/scripts/test_contatos_fase2.sql
```

### Opção B: PostgreSQL nativo (Windows)

```powershell
# Baixar e instalar PostgreSQL com PostGIS de:
# https://postgis.net/windows_downloads/

# Após instalação, executar:
psql -h localhost -U postgres -d alerta_chuva_cajamar -f supabase/scripts/test_contatos_fase2.sql
```

---

## 3. Script de Teste SQL Revisado

O arquivo `supabase/scripts/test_contatos_fase2.sql` foi revisado e cobre:

| Teste | Cenário Validador |
|-------|-------------------|
| TESTE 1 | Inserção válida com `endereco_id` do mesmo usuário |
| TESTE 2 | Inserção com `endereco_id` de OUTRO usuário (deve falhar via trigger) |
| TESTE 3 | Tentativa de definir `verificado_em` pelo cliente (deve falhar via trigger) |
| TESTE 4 | Tentativa de definir `revogado_em` pelo cliente (deve falhar via trigger) |
| TESTE 5 | Tentativa de alterar `usuario_id` (deve falhar via trigger) |
| TESTE 6 | `canal_email=true` sem `verificado_em` (deve falhar via constraint) |
| TESTE 7 | Revogação preenche `revogado_em` automaticamente |
| TESTE 8 | Reativação limpa `revogado_em` e exige `versao_consentimento` |
| TESTE 9 | Reativação sem `versao_consentimento` (deve falhar via constraint) |
| TESTE 10 | RLS: usuário 2 não vê contatos do usuário 1 |
| TESTE 11 | Exclusão de contato próprio |
| TESTE 12 | Compatibilidade com registros antigos (sem `tipo_contato`) |

### Como executar os testes SQL:

```powershell
# No ambiente isolado (Docker ou PostgreSQL nativo):
psql -h localhost -U postgres -d alerta_chuva_cajamar -f supabase/scripts/test_contatos_fase2.sql
```

**Resultado esperado:** Todos os testes devem exibir "SUCESSO" nas NOTICE messages. Nenhum teste deve permitir operações que violem as regras de segurança.

---

## 4. Consultas Somente Leitura para o Supabase Hospedado

As consultas abaixo são **somente leitura** e podem ser executadas no **SQL Editor** do projeto `csobfhhvvqqhqinfllri` no painel do Supabase. Elas não alteram dados.

### 4.1 Verificar se a tabela `contatos_alerta` existe e suas colunas

```sql
-- Estrutura atual da tabela contatos_alerta
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'contatos_alerta'
ORDER BY ordinal_position;
```

### 4.2 Verificar dados legados existentes

```sql
-- Contar registros existentes
SELECT count(*) AS total_contatos FROM public.contatos_alerta;

-- Verificar registros com consentimento mas sem versão
SELECT id, nome, consentimento, versao_consentimento
FROM public.contatos_alerta
WHERE consentimento = TRUE
  AND versao_consentimento IS NULL;

-- Verificar registros com canais ativos mas sem consentimento
SELECT id, nome, consentimento, canal_interno, canal_email, canal_sms
FROM public.contatos_alerta
WHERE consentimento = FALSE
  AND (canal_interno = TRUE OR canal_email = TRUE OR canal_sms = TRUE);

-- Verificar usuários distintos com contatos
SELECT usuario_id, count(*) AS total
FROM public.contatos_alerta
GROUP BY usuario_id;
```

### 4.3 Verificar constraints existentes

```sql
-- Constraints de checagem na tabela contatos_alerta
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.contatos_alerta'::regclass
  AND contype = 'c';
```

### 4.4 Verificar índices existentes

```sql
-- Índices na tabela contatos_alerta
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'contatos_alerta';
```

### 4.5 Verificar políticas RLS existentes

```sql
-- Políticas RLS na tabela contatos_alerta
SELECT
    polname AS policy_name,
    polcmd AS command,  -- r=SELECT, a=INSERT, w=UPDATE, d=DELETE
    polqual AS using_expression,
    polwithcheck AS with_check_expression
FROM pg_policy
WHERE polrelid = 'public.contatos_alerta'::regclass;
```

### 4.6 Verificar se RLS está habilitado

```sql
-- Verificar se RLS está ativado na tabela
SELECT
    relname AS table_name,
    relrowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'contatos_alerta'
  AND relnamespace = 'public'::regnamespace;
```

### 4.7 Verificar grants na tabela

```sql
-- Privilégios na tabela contatos_alerta
SELECT
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'contatos_alerta'
ORDER BY grantee, privilege_type;
```

### 4.8 Verificar se a tabela enderecos existe e sua estrutura

```sql
-- Estrutura da tabela enderecos (necessária para a FK)
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'enderecos'
ORDER BY ordinal_position;
```

### 4.9 Verificar contas de usuário existentes (somente leitura)

```sql
-- Usuários com contatos cadastrados (sem expor PII sensível)
SELECT
    u.id,
    u.email,
    count(c.id) AS total_contatos
FROM public.usuarios u
LEFT JOIN public.contatos_alerta c ON c.usuario_id = u.id
GROUP BY u.id, u.email;
```

---

## 5. Comandos Exatos — Resumo

### Terminal (PowerShell) — Verificar ferramentas

```powershell
docker --version
supabase --version
git --version
```

### Terminal (PowerShell) — Ambiente isolado com Docker

```powershell
docker run --name alerta-chuva-postgis-test `
  -e POSTGRES_PASSWORD=senha_teste_local `
  -e POSTGRES_DB=alerta_chuva_cajamar `
  -p 5432:5432 `
  -d postgis/postgis:15-3.3

docker ps

psql -h localhost -U postgres -d alerta_chuva_cajamar -f supabase/scripts/test_contatos_fase2.sql
```

### SQL Editor do Supabase (apenas leitura)

Execute cada consulta da seção 4 acima no SQL Editor do projeto `csobfhhvvqqhqinfllri`.

---

## 6. Próximos Passos (após confirmação dos testes)

Quando:
1. ✅ Testes SQL executados com sucesso em ambiente isolado
2. ✅ Consultas somente leitura confirmam estado atual do banco hospedado
3. ✅ Backup do banco confirmado

Então solicitar autorização para aplicar a migration no Supabase hospedado.

**A migration NÃO foi aplicada. Nenhum dado foi alterado.**
