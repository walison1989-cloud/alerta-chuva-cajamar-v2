-- Executar somente APÓS gravar no Vault um secret chamado monitor_hidro_job_secret
-- com o MESMO valor que PUSH_JOB_SECRET das Edge Functions.
-- Agendamento de triagem experimental; não gera eventos confirmados e não envia push.
-- O job também respeita os killswitches MONITOR_HIDRO_ENABLED e MONITOR_HIDRO_WRITE_ENABLED.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='monitor_hidro_job_secret') THEN
    RAISE EXCEPTION 'Cadastre monitor_hidro_job_secret no Vault antes do agendamento';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='monitorar-hidrologia-15min') THEN
    PERFORM cron.unschedule('monitorar-hidrologia-15min');
  END IF;
  PERFORM cron.schedule('monitorar-hidrologia-15min', '*/15 * * * *', $job$
    SELECT net.http_post(
      url:='https://csobfhhvvqqhqinfllri.supabase.co/functions/v1/monitorar-hidrologia',
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-job-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='monitor_hidro_job_secret')),
      body:='{}'::jsonb,
      timeout_milliseconds:=30000
    );
  $job$);
END;
$$;
-- Consultar andamento: SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='monitorar-hidrologia-15min';
-- Para interromper: SELECT cron.unschedule('monitorar-hidrologia-15min');
