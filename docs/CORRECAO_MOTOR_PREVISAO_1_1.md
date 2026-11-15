# Correção do motor preventivo v1.1.0 — 15/11/2026

## Diagnóstico concreto

O alerta forte do print (0,0 mm observados nas últimas 24 h, 25,0 mm previstos para 24 h, área **Média a 457 m** do ponto) era produzido pela configuração `exp-2026.11-v1`:

- `10,1 a 30 mm/24 h` previstos ⇒ nível de chuva 2;
- suscetibilidade territorial média ⇒ nível espacial 2;
- regra `min_suscetibilidade = 2` e `min_chuva = 2` ⇒ **atenção forte**, sem exigir chuva real, elevação relativa ou conectividade do lote.

O código anterior à primeira correção também podia elevar a classe do imóvel por uma área vizinha. Mesmo depois da correção espacial, a regra v1 ainda emitia "atenção forte" para um ponto **dentro** de polígono oficial com chuva prevista moderada e terreno não analisado. O print com `a 457m` sugere que o navegador estava executando uma versão anterior da correção espacial, ou que o servidor não havia publicado o bundle mais novo: sem logs/versão deployada não é possível concluir qual ocorreu.

## Alterações feitas

- Motor preparado **1.1.0** e nova regra **exp-2026.11-v2** (pendentes de implantação); regras incompatíveis são rejeitadas em vez de reinterpretadas silenciosamente.
- Áreas vizinhas são só contexto; se não há interseção com o ponto, **não conferem risco** ao imóvel. O resultado fica inconclusivo, salvo caso de sinal meteorológico regional extremo (que ainda não afirma risco para o lote).
- Carta que contém o ponto identifica suscetibilidade territorial, **não** exposição hidrológica confirmada.
- Classificação **forte** exige **todos**: interseção com polígono, fonte e qualidade topográfica verificadas, posição topográfica baixa, conectividade hidrológica confirmada, chuva **medida** relevante e forte intensidade horária prevista ou chuva observada extrema.
- Previsões passam a disponibilizar máximos móveis de **3 h** e **6 h** calculados da série horária completa, sem somar observado com previsto.
- A tela separa exposição física, sinal meteorológico e picos previstos; uma área próxima é rotulada explicitamente como **somente área vizinha**.
- Quando a consulta de altimetria não retornar evidência confiável, **não inventar** desnível local com a elevação da grade do Open-Meteo; reter estado **indeterminado**. A proteção é consciente e conservadora, não uma medição de risco real.

## Escopo e limitações

O usuário informou que o **Supabase de produção já contém altimetria** e recebe os dados das estações e pluviômetros. O ZIP, por si só, não identifica o nome/contrato das tabelas ou RPCs topográficas existentes nem contém os GeoTIFF `data/processed/*.tif`. Isso NÃO significa que faltem dados no banco. O frontend já consulta as medições via Supabase e agora também interpreta `terreno` no JSONB de evidências retornado pela RPC. O endpoint experimental de terreno atualmente exige autorização de administrador e depende de habilitação explícita. Assim, a leitura dos campos da RPC foi preparada, mas a ligação da fonte topográfica real à RPC, sem conhecer o schema implantado, **não foi concluída**: o motor aceita evidências opcionais de terreno confiáveis, porém não as fabrica. Isso limita a emissão de classificação forte até existir infraestrutura geoespacial validada.

O sistema continua **experimental**. Faixas de chuva e referência de 20 mm/3 h são parâmetros de demonstração: não são limiares oficiais ou calibrados para Cajamar. Nem "sem sinal" nem "dados insuficientes" significam ausência de perigo. Chuva a montante, níveis fluviométricos, falha de drenagem e acúmulo local requerem novos sensores/dados e modelagem.

## Passos de implantação (sem atualizar produção automaticamente)

1. Executar testes locais e homologação do Supabase. Conferir `git diff` e o `.gitignore` antes de publicar.
2. Fazer backup da configuração `regras_avaliacao`, especialmente `exp-2026.11-v1` e histórico.
3. Aplicar em **homologação** a migration `supabase/migrations/20261115190000_regra_exposicao_meteorologia_v2.sql` e verificar que a view pública entrega `exp-2026.11-v2` / `motor_versao = 1.1.0`.
4. Publicar frontend da versão 1.1.0 após conferir compatibilidade, validar com caso regressivo do print e monitorar logs. Se frontend v1.1 for publicado sem migration, exibirá **Dados insuficientes** por incompatibilidade (comportamento seguro).
5. Só então aplicar migration na produção e publicar o frontend na sequência coordenada. Não há disparo automático de notificações pelo patch.
6. Para verificar não estar vendo bundle antigo, atualizar PWA/service worker e conferir versão em artefato/deploy, **não** tomar Ctrl+F5 como correção estrutural.

## Próxima etapa real de terreno e hidrologia

Verificar as tabelas/rasters de MDT já existentes no Supabase e publicar consulta autenticada de terreno por coordenada privada sem armazenar a coordenada em logs, calcular posição relativa ao talvegue, identificar bacia e conectividade, incorporar níveis hidrométricos e estações a montante, validar com ocorrências históricas e definir limiares calibrados por bacia. A altitude absoluta por si só não determina o potencial de inundação.

## Integração com o Supabase existente (sem recriar dados)

As medições continuam nas estruturas `estacoes` e `medicoes_chuva`, lidas pela RPC `evidencias_avaliacao_do_morador` e por `vw_estacoes_publicas`. Para a topografia, o frontend passou a aceitar o campo **`terreno`** como objeto JSONB no retorno de `evidencias_avaliacao_do_morador` e `evidencias_avaliacao_no_ponto`, sem alterar assinaturas nem exigir tabela nova.

Formato esperado (somente dados validados no ponto):

```json
{
  "terreno": {
    "fonte": "Identificação real do modelo e data",
    "qualidade": "boa",
    "elevacao_relativa_m": 12.3,
    "declividade_graus": 3.2,
    "posicao_topografica": "elevada",
    "conectividade_hidrologica": "descartada"
  }
}
```

A origem pode ter também `altitude_m`, mas altitude absoluta não determina exposição e não é usada como `elevacao_relativa_m`. Os valores `posicao_topografica` e `conectividade_hidrologica` não devem ser preenchidos por suposição. Evidência parcial mantém qualidade `limitada` e não habilita atenção forte. A função/consulta que inclui esse objeto no JSONB precisa ser adaptada **aos nomes reais do banco** antes de utilizar o recurso operacionalmente.

Execute **somente leitura** o arquivo `supabase/scripts/diagnostico_fontes_terreno_read_only.sql` para descobrir as tabelas, colunas e RPCs de terreno já criadas. Não publique as coordenadas residenciais ou saídas que contenham dados pessoais. Depois mapeie a fonte real para o objeto `terreno` na RPC existente, com RLS/isolamento do usuário.
