-- ONLY for the independent legacy PostgreSQL backend, never Supabase.
BEGIN;
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS origem VARCHAR(40) NOT NULL DEFAULT 'LEGADO_NAO_CLASSIFICADO';
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS execucao_simulacao VARCHAR(36);
CREATE INDEX IF NOT EXISTS idx_alertas_simulacao ON alertas(execucao_simulacao);
CREATE TABLE IF NOT EXISTS configuracao_motor(id INTEGER PRIMARY KEY, parametros TEXT NOT NULL);
COMMIT;
