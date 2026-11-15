-- Optional manual scheduling template. Never executed by migrations or CI.
-- Set real values only in a private administrator SQL Editor, never in Git.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
DECLARE
    v_secret TEXT := '<SEGREDO>';
    v_url TEXT := '<URL_DO_PROJETO>';
    v_id UUID;
BEGIN
    IF length(v_secret) < 32 OR v_secret ~ '[<>]' THEN
        RAISE EXCEPTION 'Defina um segredo forte em uma sessão privada antes de agendar';
    END IF;
    IF v_url !~ '^https://[a-z0-9]+[.]supabase[.]co$' THEN
        RAISE EXCEPTION 'Defina a URL do projeto correto, sem barra final';
    END IF;
    SELECT id INTO v_id FROM vault.secrets WHERE name='cemaden_sync_secret';
    IF v_id IS NULL THEN PERFORM vault.create_secret(v_secret,'cemaden_sync_secret');
    ELSE PERFORM vault.update_secret(v_id,v_secret); END IF;
    SELECT id INTO v_id FROM vault.secrets WHERE name='cemaden_project_url';
    IF v_id IS NULL THEN PERFORM vault.create_secret(v_url,'cemaden_project_url');
    ELSE PERFORM vault.update_secret(v_id,v_url); END IF;
    IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='sync-cemaden-10min') THEN
        PERFORM cron.unschedule('sync-cemaden-10min');
    END IF;
    PERFORM cron.schedule('sync-cemaden-10min','*/10 * * * *',$job$
        SELECT net.http_post(
            url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cemaden_project_url') || '/functions/v1/sync-cemaden',
            headers := jsonb_build_object('Content-Type','application/json','x-sync-secret',
                (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cemaden_sync_secret')),
            body := '{}'::jsonb, timeout_milliseconds := 30000
        ) WHERE NOT EXISTS(
            SELECT 1 FROM public.coletas_fonte WHERE fonte='CEMADEN' AND status='em_andamento'
              AND iniciado_em>now()-interval '5 minutes'
        );
    $job$);
END;
$$;
