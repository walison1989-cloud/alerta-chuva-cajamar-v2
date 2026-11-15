# Dados de terreno e cartografia

Os rasters grandes e os arquivos oficiais brutos ficam fora do Git. O frontend MVP não depende desses rasters; são dados do módulo de pesquisa Python. A carta de suscetibilidade no Supabase é uma importação distinta e exige fonte oficial verificada.

Para repetir os testes de terreno, restaure os quatro GeoTIFFs em data/processed a partir do pacote separado de dados revisados. Confira SHA-256 em data/processed/manifesto-mvp.json. Para gerar novamente a partir do MDT recortado original:

```text
python -m pip install -r requirements-geo.txt
python scripts/preprocessar_topografia.py
```

A declividade usa diferenças finitas e preserva NoData (inclusive vizinhos sem gradiente). A máscara de área baixa usa 1 para baixa, 0 para não baixa e NoData para desconhecido. Fonte/CRS/escala do dado original continuam sendo suas limitações; o processamento não é calibração hidrológica. As métricas foram verificadas apenas na cópia local fornecida.
