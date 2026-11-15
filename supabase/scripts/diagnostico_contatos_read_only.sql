-- SOMENTE LEITURA. Não consulta nomes, telefones, e-mails ou dados de moradores.
-- Executar no SQL Editor e enviar os resultados, nunca chaves ou senhas.
SELECT to_regclass('public.contatos_alerta') IS NOT NULL AS tabela_contatos_existe;

WITH esperadas(coluna) AS (
  VALUES ('id_contato'), ('usuario_id'), ('endereco_id'), ('nome'),
    ('tipo_contato'), ('telefone'), ('email'), ('ativo'), ('consentimento'),
    ('verificado_em'), ('versao_consentimento'), ('revogado_em'),
    ('canal_interno'), ('canal_email'), ('canal_sms'), ('data_cadastro')
)
SELECT e.coluna,
  EXISTS (SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema='public' AND c.table_name='contatos_alerta'
          AND c.column_name=e.coluna) AS existe
FROM esperadas e ORDER BY e.coluna;

SELECT c.relrowsecurity AS rls_ativo,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS autenticado_pode_consultar,
       has_table_privilege('anon', c.oid, 'SELECT') AS anonimo_pode_consultar
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='contatos_alerta';

SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='contatos_alerta'
ORDER BY policyname;
