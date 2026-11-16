# Correção: triangulação pelas estações ativas com leituras válidas mais próximas do GPS

## Regra exata

1. Usa a latitude e longitude **confirmadas** do endereço do morador.
2. Só considera estações CEMADEN com `ativa=true` e `validada=true` no Supabase.
3. Exige acumulado oficial de 24 horas, leitura recente (até 6 horas), valor não negativo e coordenadas válidas.
4. Ordena pela distância do GPS; desconsidera estações além de 30 km. Busca até 18 candidatas próximas.
5. Escolhe as três estações que **formam um triângulo contendo o ponto GPS**, minimizando a distância da estação mais distante; desempata pela soma das distâncias.
6. Restringe o triângulo a estações a no máximo 15 km, com leituras dentro de uma hora entre si.
7. Se não for possível formar triângulo, retorna **dados insuficientes**. Uma estação a até 100 m é reportada como **medição direta** (não triangulação).
8. Preserva o bloqueio de decisão quando as três leituras divergem muito. A interpolação não confirma alagamento.

## Aplicação no projeto existente (Windows PowerShell)

O ZIP deve ser extraído e COPIADO sobre a raiz do repositório (não substituir o projeto todo):

```powershell
Expand-Archive "$env:USERPROFILE\Downloads\patch-triangulacao-gps-ativas-v2.zip" "$env:TEMP\triangulacao-gps-v2" -Force
robocopy "$env:TEMP\triangulacao-gps-v2" "D:\alerta-chuva-cajamar-v2" /E
cd D:\alerta-chuva-cajamar-v2\frontend
npm ci
npm test
npm run build
```

## Implantação no Supabase

1. Aplicar `supabase/migrations/20261116090000_triangulacao_gps_ativas_v2.sql` no **SQL Editor** do projeto correto; é uma atualização idempotente da view, sem alterações de cadastro.
2. Publicar `sync-cemaden`, `push-alertas` e `monitorar-hidrologia` com as configurações e secrets existentes, pois as funções selecionam os novos campos `ativa,validada`. Exemplo, na raiz do projeto:

```powershell
npx supabase functions deploy sync-cemaden --no-verify-jwt --project-ref csobfhhvvqqhqinfllri
npx supabase functions deploy push-alertas --no-verify-jwt --project-ref csobfhhvvqqhqinfllri
npx supabase functions deploy monitorar-hidrologia --no-verify-jwt --project-ref csobfhhvvqqhqinfllri
```

3. `git add .`, `git commit`, `git push` (somente quando `npm test` e `npm run build` passarem). Conferir Vercel. **Não habilitar alertas de alagamento confirmados** sem calibração/homologação hidrológica.

**Atenção à ordem:** publicar SQL antes das funções: elas solicitarão `ativa` e `validada` na view.

## Verificação de dados no Supabase

```sql
SELECT COUNT(*) AS estacoes_expostas,
       COUNT(*) FILTER (WHERE ativa IS DISTINCT FROM true OR validada IS DISTINCT FROM true) AS inativas_ou_nao_validadas,
       COUNT(*) FILTER (WHERE tem_leitura AND ultima_leitura_em >= now() - interval '6 hours'
         AND tipo_medicao='acumulado_24h' AND janela_horas=24
         AND unidade='mm' AND qualidade_dado='oficial') AS leituras_elegiveis
FROM public.vw_estacoes_publicas;
```

Nunca usar ausência de triangulação como confirmação de segurança do imóvel.
