# Triangulação experimental de chuva no ponto

## O que foi conectado

A página `/analise-preventiva` agora usa a camada existente `vw_estacoes_publicas` (por `fetchRainSnapshot`) junto da localização que a própria página já consulta, da previsão Open-Meteo e da suscetibilidade consultada pela RPC da Etapa 5.2. A nova leitura aparece no cartão **Triangulação das estações**. Não é necessário cadastrar novamente estações nem alterar o banco remoto.

O cálculo roda no navegador. A localização privada do imóvel permanece no fluxo atual: vem de `getMyAddress` sob a sessão do usuário e não é enviada ao RPC de estações. O snapshot público contém apenas as estações e leituras que já são públicas.

## Critérios de entrada

- Origem exata `CEMADEN`; estações de catálogo, inclusive SP Águas/INMET, não entram sem telemetria.
- Leitura `acumulado_24h`, janela de 24 h, qualidade `oficial`, valor finito não negativo e horário da leitura com até 6 horas.
- Raio máximo de 30 km, limite de 10 estações, alinhamento dos horários em até uma hora e deduplicação por código/posição.
- Interpolação IDW com potência 2. A classificação exige leitura direta no próprio ponto ou pelo menos três estações recentes cujo triângulo contenha o ponto. Fora dessa cobertura, a estimativa numérica é mostrada apenas como referência e não classifica.
- Também exige previsão Open-Meteo recente e uma área oficial de suscetibilidade que contenha exatamente o ponto. Áreas próximas não são tratadas como cobertura do ponto.
- Aplica a matriz da regra publicada somente se sua versão de motor for `1.0.0`. As faixas de chuva observada e prevista permanecem separadas; não se somam as duas janelas.

Os limites são salvaguardas experimentais, não limiares hidrológicos calibrados. Não se apresenta percentual de alagamento, não se envia notificação e essa leitura nova não é gravada no histórico. A classificação existente da Etapa 5.2 permanece separada.

## Limitações

As estações podem estar distantes, ter janelas de observação que não representam a mesma chuva local ou ser afetadas por falhas de telemetria. O teste geométrico confirma cobertura geométrica das estações, não que chuva seja espacialmente uniforme. A carta tem escala e ano próprios; não substitui topografia local, drenagem, nível de rios ou observação de campo. Não há validação retrospectiva local que justifique chamar o resultado de previsão operacional.

O módulo Python `motor_probabilistico` continua sendo um módulo local/offline; a hospedagem Vercel estática não executa Python. A nova leitura do navegador é uma implementação TypeScript separada para usar os dados disponíveis no MVP.
