# Interpolação de chuva com três estações — atualização 1.4

## Objetivo

Para cada **endereço cadastrado**, combinar a chuva *observada* de pluviômetros CEMADEN com a previsão *futura* da Open-Meteo consultada nas coordenadas do próprio endereço, além da suscetibilidade e dos dados do terreno. A triangulação não é uma probabilidade de alagamento e não estima o nível do rio.

## Dados utilizados (mesmo Supabase, sem novas tabelas)

- `vw_estacoes_publicas`, alimentada por `estacoes` e `medicoes_chuva`, para coordenadas e acumulados válidos das últimas **24 horas**.
- RPCs existentes de evidências (suscetibilidade do ponto) e `terreno_motor2_no_ponto` (altitude absoluta, elevação relativa, declividade).
- Open-Meteo: previsão nas coordenadas do endereço; acumulado das próximas **24 horas** e concentração prevista em 3/6 horas.

## Seleção dos três pluviômetros

1. Aceitar apenas estação CEMADEN com leitura oficial, unidade **mm**, tipo `acumulado_24h`, janela **24 h**, data de até **6 h** e não futura.
2. Ignorar entradas repetidas pelo código/coordenadas, sem telemetria, janelas diferentes ou fontes sem equivalência de medição.
3. Examinar até 18 estações próximas, e procurar **exatamente três** formando triângulo não degenerado que contenha o ponto. O maior afastamento permitido entre imóvel e uma estação do triângulo é **15 km**. As três leituras devem estar separadas no tempo em até **60 minutos**.
4. Escolher o triângulo envolvente mais compacto dentre os candidatos, não apenas as três estações mais próximas se elas estiverem no mesmo lado do imóvel.
5. Interpolar o acumulado de 24 h por pesos **baricêntricos** da posição do endereço dentro do triângulo. Os pesos são mostrados ao usuário; o resultado é **estimativa espacial**, não leitura direta do imóvel.
6. Se existir estação a até **100 m** do endereço, utilizar essa medição diretamente, marcando o método corretamente.
7. Se não houver geometria válida, leituras alinhadas ou as diferenças entre os três acumulados forem excessivas, classificar a cobertura como **insuficiente**. A estimativa não pode sustentar uma decisão conclusiva de risco/segurança.

Os limites de distância, idade, divergência e geometria são salvaguardas de engenharia *experimentais*, não parâmetros hidrológicos validados para Cajamar.

## Como entra no motor

- O hook `useAvaliacaoPreventiva` consulta a view existente, monta a triangulação e a passa a `avaliarPreventivamente`.
- Quando a triangulação é válida, o motor usa **essa chuva observada interpolada** em lugar do acumulado de uma única estação, preservando os códigos das estações nos motivos/auditoria da avaliação.
- Quando não existe cobertura confiável, a avaliação do endereço retorna **dados insuficientes**; não presume que a chuva no imóvel é zero.
- A chuva **prevista** continua sendo a previsão Open-Meteo diretamente no ponto, e **não** é calculada a partir dos pluviômetros. Estações medem o passado; extrapolar essas leituras para afirmar a chuva futura seria incorreto sem um modelo meteorológico validado.
- A previsão futura e a chuva já observada continuam **separadas**; o motor não soma 24 h passadas com 24 h futuras para disparar alertas. A regra de exposição física e de bloqueio de alerta forte permanece.

## Interface

A página `/analise-preventiva` passa a mostrar um cartão **Chuva estimada entre estações** com três estações, seus acumulados, distâncias e pesos da interpolação; mostra também a previsão futura ao lado. A tela principal mostra o acumulado espacial interpolado quando válido.

## Implantação e restrições

- Atualização apenas do **frontend React/TypeScript**, sem migrations para esta mudança. O banco e os cadastros existentes são preservados.
- Fazer upload do código ao GitHub (preferencialmente em branch), executar os testes e **Redeploy** da Vercel com `Root Directory=frontend` e Node 24.x.
- Nenhuma notificação push/e-mail é ativada por este código; o envio real ainda requer rotina no servidor, permissões e validação hidrológica.
- O uso no frontend não garante que o sistema monitore continuamente com a aba fechada; isso exige servidor/agendamento independente.
- Não dispensa alertas da Defesa Civil. A estimativa é uma aproximação sem calibração espacial para as chuvas convectivas e o relevo complexo de Cajamar.

## Diagnóstico do terreno

A página também exibe o diagnóstico da RPC `terreno_motor2_no_ponto` implementado na revisão 1.3. Ausência de cota não deve apagar o resultado meteorológico nem gerar falsa segurança.
