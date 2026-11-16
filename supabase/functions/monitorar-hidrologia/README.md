# Monitorar Hidrologia (experimental)

Função protegida por `x-job-secret` e `PUSH_JOB_SECRET`.
Sem `MONITOR_HIDRO_ENABLED=true` retorna `enabled:false` e não lê endereços.
Sem `MONITOR_HIDRO_WRITE_ENABLED=true` calcula mas não grava avaliações.
Nunca envia push nem cria eventos de alagamento confirmados.
Ver `docs/MOTOR_HIDROLOGICO_V01_VALIDACAO.md`.
