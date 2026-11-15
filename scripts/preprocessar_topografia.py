#!/usr/bin/env python3
"""
Pré-processamento topográfico do MDT de Cajamar.

Calcula:
1. Declividade (graus) a partir do MDT de 5 m (diferença finita central via np.gradient)
2. Elevação relativa (m) em relação à média de uma janela espacial (150 m)
3. Máscara de áreas topograficamente baixas (elevação relativa < -5 m)

Os resultados são salvos como GeoTIFFs pré-processados em data/processed/
para evitar recálculos a cada consulta do motor.

Correções da v2:
- Elevação relativa: média local considera somente pixels válidos na janela.
- NãoData, bordas e janelas incompletas tratados corretamente.
- Declividade documentada como diferença finita central (não Horn).
"""

import os
import sys
import numpy as np
import rasterio
from rasterio.transform import from_bounds

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MDT_PATH = os.path.join(PROJECT_ROOT, "data", "processed", "mde_cajamar_recortado.tif")
OUT_DIR = os.path.join(PROJECT_ROOT, "data", "processed")

# Janela espacial para elevação relativa: 150 m (30 pixels a 5 m de resolução)
JANELA_METROS = 150
# Limiar para considerar ponto topograficamente baixo (m)
LIMIAR_AREA_BAIXA_M = -5.0


def abrir_mdt():
    print("Abrindo MDT:", MDT_PATH)
    ds = rasterio.open(MDT_PATH)
    print("CRS:", ds.crs)
    print("Dimensões:", ds.width, "x", ds.height)
    print("Resolução:", ds.res)
    print("NoData:", ds.nodata)
    return ds


def calcular_declividade(altitude, transform, nodata):
    """
    Calcula declividade em graus usando diferença finita central (np.gradient).

    NOTA: np.gradient NÃO implementa o método de Horn (que usa pesos específicos
    em matrizes 3x3). Aqui usamos diferença finita central simples com
    edge_order=1 nas bordas.
    """
    dx = transform.a  # resolução em x (m)
    dy = abs(transform.e)  # resolução em y (m)

    # Máscara de dados válidos
    valida = altitude != nodata
    altitude_f = altitude.astype(np.float64)
    altitude_f[~valida] = np.nan

    # Gradiente em x e y (m/m) via diferença finita central
    dzdx, dzdy = np.gradient(altitude_f, dy, dx, edge_order=1)

    # Declividade em graus: atan(sqrt(dzdx^2 + dzdy^2))
    declividade = np.degrees(np.arctan(np.sqrt(dzdx**2 + dzdy**2)))

    # Aplica máscara: onde era NoData, continua NoData
    declividade[~valida] = nodata
    declividade[np.isnan(declividade)] = nodata

    return declividade.astype(np.float32)


def calcular_elevacao_relativa(altitude, transform, nodata, janela_m=JANELA_METROS):
    """
    Calcula elevação relativa = altitude_pixel - media_altitude_janela.

    Janela quadrada de janela_m metros de lado, centrada no pixel.
    Resultado positivo = ponto mais alto que o entorno; negativo = ponto baixo.

    A média local considera SOMENTE pixels válidos dentro da janela.
    Pixels NoData e fora da imagem não entram nem na soma nem na contagem.
    """
    from scipy.ndimage import uniform_filter

    dx = transform.a
    dy = abs(transform.e)
    raio_px = int(round(janela_m / 2.0 / dx))  # raio em pixels
    k = 2 * raio_px + 1  # tamanho da janela (ímpar)
    kernel_size = k * k

    valida = altitude != nodata
    altitude_f = altitude.astype(np.float64)
    altitude_f[~valida] = 0.0  # zeros para pixels inválidos (não afetam soma)

    # uniform_filter retorna a MÉDIA local (soma / kernel_size), não a soma bruta.
    # Para obter a soma local de valores válidos, multiplicamos de volta por kernel_size.
    soma_local = uniform_filter(altitude_f, size=(k, k), mode="constant", cval=0.0) * kernel_size
    contagem_local = (
        uniform_filter(valida.astype(np.float64), size=(k, k), mode="constant", cval=0.0)
        * kernel_size
    )

    # Média local considerando somente pixels válidos na janela
    media_local = np.full_like(soma_local, np.nan)
    mask_valida_contagem = contagem_local > 0
    media_local[mask_valida_contagem] = (
        soma_local[mask_valida_contagem] / contagem_local[mask_valida_contagem]
    )

    # Elevação relativa
    elevacao_relativa = altitude_f - media_local

    # Aplica máscara NoData
    elevacao_relativa[~valida] = nodata
    elevacao_relativa[np.isnan(elevacao_relativa)] = nodata

    return elevacao_relativa.astype(np.float32)


def salvar_geotiff(caminho, dados, perfil, nodata, descricao):
    """Salva array como GeoTIFF comprimido."""
    perfil_saida = perfil.copy()
    perfil_saida.update({
        "driver": "GTiff",
        "dtype": "float32",
        "nodata": nodata,
        "compress": "lzw",
        "count": 1,
    })
    with rasterio.open(caminho, "w", **perfil_saida) as dst:
        dst.write(dados, 1)
        dst.set_band_description(1, descricao)
    tamanho = os.path.getsize(caminho)
    print(f"Salvo: {caminho} ({tamanho / (1024*1024):.2f} MB)")


def main():
    ds = abrir_mdt()
    altitude = ds.read(1)
    transform = ds.transform
    nodata = ds.nodata
    perfil = ds.profile

    # 1. Declividade
    print("\nCalculando declividade...")
    declividade = calcular_declividade(altitude, transform, nodata)
    salvar_geotiff(
        os.path.join(OUT_DIR, "declividade_graus.tif"),
        declividade,
        perfil,
        nodata,
        "Declividade (graus)",
    )

    # 2. Elevação relativa
    print(f"\nCalculando elevação relativa (janela {JANELA_METROS} m)...")
    elev_rel = calcular_elevacao_relativa(altitude, transform, nodata, JANELA_METROS)
    salvar_geotiff(
        os.path.join(OUT_DIR, "elevacao_relativa.tif"),
        elev_rel,
        perfil,
        nodata,
        "Elevação relativa (m)",
    )

    # 3. Áreas topograficamente baixas
    print("\nIdentificando áreas topograficamente baixas...")
    area_baixa = (elev_rel < LIMIAR_AREA_BAIXA_M) & (elev_rel != nodata)
    area_baixa = area_baixa.astype(np.float32)
    area_baixa[(elev_rel == nodata) | ~np.isfinite(elev_rel)] = nodata
    salvar_geotiff(
        os.path.join(OUT_DIR, "area_topograficamente_baixa.tif"),
        area_baixa,
        perfil,
        nodata,
        "Área topograficamente baixa (1=baixa, 0=não baixa, NoData=desconhecido)",
    )

    # Estatísticas
    print("\n=== ESTATÍSTICAS ===")
    dec_validos = declividade[declividade != nodata]
    elev_validos = elev_rel[elev_rel != nodata]
    alt_validos = altitude[altitude != nodata]
    print(f"Altitude: min={alt_validos.min():.2f}, max={alt_validos.max():.2f}, media={alt_validos.mean():.2f} m")
    print(f"Declividade: min={dec_validos.min():.2f}, max={dec_validos.max():.2f}, media={dec_validos.mean():.2f} graus")
    print(f"Elevação relativa: min={elev_validos.min():.2f}, max={elev_validos.max():.2f}, media={elev_validos.mean():.2f} m")
    print(f"Áreas baixas: {int((area_baixa == 1).sum())} pixels "
          f"({100.0 * (area_baixa == 1).sum() / (altitude != nodata).sum():.2f}% da área válida)")

    # Verificação de consistência: elev_rel não pode exceder amplitude do terreno
    amplitude = alt_validos.max() - alt_validos.min()
    print(f"\nAmplitude do terreno: {amplitude:.2f} m")
    print(f"Elevação relativa dentro da amplitude? {elev_validos.max() <= amplitude and elev_validos.min() >= -amplitude}")

    ds.close()
    print("\nPré-processamento concluído.")


if __name__ == "__main__":
    try:
        from scipy.ndimage import uniform_filter
    except ImportError:
        print("ERRO: scipy não está instalado. Instale com: pip install scipy")
        sys.exit(1)
    main()
