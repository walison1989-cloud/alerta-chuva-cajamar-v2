#!/usr/bin/env python3
"""
Processamento do MDT oficial de Cajamar (SGB/CPRM + IPT, 2017).

Etapas:
1. Abre o ArcGrid extraído de 01.MDT/mdt/
2. Confirma CRS, resolução, dimensões, limites, NoData e valores de altitude
3. Transforma o limite GeoJSON (WGS84) para o CRS do MDT (UTM 23S)
4. Recorta o MDT para Cajamar com margem de desenvolvimento
5. Salva como GeoTIFF comprimido (LZW) em data/processed/
6. Verifica os testes existentes sem reescrever código-fonte
"""

import json
import os
import sys
import zipfile
import numpy as np
import rasterio
from rasterio.mask import mask
from rasterio.warp import transform_geom
from rasterio.transform import from_bounds
from pyproj import Transformer
from shapely.geometry import shape, mapping, box

# ---------------------------------------------------------------------------
# Caminhos
# ---------------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP_PATH = os.path.join(PROJECT_ROOT, "data", "raw", "mde_cajamar_sp_suscet.zip")
ARCGRID_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "mdt_arcgrid", "01.MDT", "mdt")
LIMIT_GEOJSON = os.path.join(PROJECT_ROOT, "data", "processed", "limite_cajamar.geojson")
OUT_DIR = os.path.join(PROJECT_ROOT, "data", "processed")
OUT_TIFF = os.path.join(OUT_DIR, "mde_cajamar_recortado.tif")
MODULE_PATH = os.path.join(PROJECT_ROOT, "backend", "altitude_service.py")
TEST_PATH = os.path.join(PROJECT_ROOT, "backend", "tests", "test_altitude_service.py")

# Margem em metros ao redor do município (para microbacias contribuintes)
BUFFER_M = 2000


def extrair_mdt():
    """Garante que o ArcGrid do MDT está extraído (já extraído anteriormente)."""
    if not os.path.exists(os.path.join(ARCGRID_DIR, "hdr.adf")):
        print("Extraindo ArcGrid do MDT do ZIP...")
        with zipfile.ZipFile(ZIP_PATH) as z:
            for info in z.infolist():
                if info.filename.startswith("01.MDT/mdt/"):
                    z.extract(info, os.path.join(PROJECT_ROOT, "data", "raw", "mdt_arcgrid"))
    print("ArcGrid MDT disponível em:", ARCGRID_DIR)


def inspecionar_mdt():
    """Abre o dataset com rasterio e imprime metadados."""
    print("\n=== INSPEÇÃO DO MDT ===")
    with rasterio.open(ARCGRID_DIR) as src:
        print("Driver:", src.driver)
        print("CRS:", src.crs)
        print("Dimensões: largura=%d, altura=%d" % (src.width, src.height))
        print("Contagem de bandas:", src.count)
        print("Dtype:", src.dtypes)
        print("Resolução: %.6f x %.6f" % (src.res[0], src.res[1]))
        print("Limites (bounds):", src.bounds)
        print("NoData:", src.nodata)
        print()

        # Lê uma amostra para verificar valores de altitude
        data = src.read(1)
        valid = data[data != src.nodata]
        print("Valores de altitude:")
        print("  Mínimo: %.4f m" % valid.min())
        print("  Máximo: %.4f m" % valid.max())
        print("  Médio:  %.4f m" % valid.mean())
        print("  Pixels válidos: %d de %d" % (valid.size, data.size))
        print("  Pixels NoData: %d" % int((data == src.nodata).sum()))

        return {
            "crs": str(src.crs),
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "dtype": str(src.dtypes[0]),
            "resolution_x": src.res[0],
            "resolution_y": src.res[1],
            "bounds": {
                "left": src.bounds.left,
                "bottom": src.bounds.bottom,
                "right": src.bounds.right,
                "top": src.bounds.top,
            },
            "nodata": src.nodata,
            "altitude_min": float(valid.min()),
            "altitude_max": float(valid.max()),
            "altitude_mean": float(valid.mean()),
            "valid_pixels": int(valid.size),
            "total_pixels": int(data.size),
            "nodata_pixels": int((data == src.nodata).sum()),
        }


def carregar_limite():
    """Carrega o limite GeoJSON e retorna a geometria."""
    print("\n=== CARREGANDO LIMITE ===")
    with open(LIMIT_GEOJSON) as f:
        dados = json.load(f)

    # O Nominatim retorna uma lista; pega o primeiro elemento
    if isinstance(dados, list):
        item = dados[0]
    else:
        item = dados

    geom = item["geojson"]
    print("Tipo de geometria:", geom["type"])
    print("Bounding box do limite (WGS84):", item.get("boundingbox"))
    return geom


def recortar_mdt(meta):
    """Transforma o limite para o CRS do MDT, aplica buffer e recorta."""
    print("\n=== RECORTE DO MDT ===")

    geom_wgs84 = carregar_limite()

    # Transforma a geometria de WGS84 para o CRS do MDT
    with rasterio.open(ARCGRID_DIR) as src:
        crs_dest = src.crs
        transformador = Transformer.from_crs("EPSG:4326", crs_dest, always_xy=True)

        # Transforma o GeoJSON
        geom_mdt = transform_geom("EPSG:4326", crs_dest, geom_wgs84)
        print("Geometria transformada para CRS:", crs_dest)

        # Aplica buffer em metros
        from shapely.geometry import shape as shapely_shape
        from shapely.ops import transform as shapely_transform

        geom_shapely = shapely_shape(geom_mdt)
        geom_buffered = shapely_transform(
            lambda x, y: transformador.transform(x, y), geom_shapely
        )
        # O transform acima já está em metros (UTM). Aplica buffer de BUFFER_M metros.
        geom_buffered = geom_shapely.buffer(BUFFER_M)
        print("Buffer aplicado: %.0f metros" % BUFFER_M)

        # Recorta
        print("Recortando MDT com morecara...")
        out_image, out_transform = mask(
            src, [mapping(geom_buffered)], crop=True, nodata=src.nodata
        )

        print("Dimensões do recorte: largura=%d, altura=%d" % (out_image.shape[2], out_image.shape[1]))
        print("Transform do recorte:", out_transform)

        # Meta para saída
        out_meta = src.meta.copy()
        out_meta.update({
            "driver": "GTiff",
            "height": out_image.shape[1],
            "width": out_image.shape[2],
            "transform": out_transform,
            "compress": "lzw",
            "nodata": src.nodata,
        })

        # Salva
        os.makedirs(OUT_DIR, exist_ok=True)
        with rasterio.open(OUT_TIFF, "w", **out_meta) as dest:
            dest.write(out_image)

        print("GeoTIFF salvo em:", OUT_TIFF)
        tamanho = os.path.getsize(OUT_TIFF)
        print("Tamanho final: %d bytes (%.2f MB)" % (tamanho, tamanho / (1024 * 1024)))

        # Estatísticas do recorte
        data_rec = out_image[0]
        valido = data_rec[data_rec != src.nodata]
        print("Altitude no recorte:")
        print("  Mínimo: %.4f m" % valido.min())
        print("  Máximo: %.4f m" % valido.max())
        print("  Médio:  %.4f m" % valido.mean())

        return {
            "arquivo": OUT_TIFF,
            "largura": out_image.shape[2],
            "altura": out_image.shape[1],
            "tamanho_bytes": tamanho,
            "tamanho_mb": round(tamanho / (1024 * 1024), 2),
            "crs": str(crs_dest),
            "resolucao_x": out_meta["transform"].a,
            "resolucao_y": abs(out_meta["transform"].e),
            "nodata": src.nodata,
            "altitude_min": float(valido.min()),
            "altitude_max": float(valido.max()),
            "altitude_mean": float(valido.mean()),
        }


def executar_testes():
    """Executa os testes automatizados."""
    print("\n=== EXECUTANDO TESTES ===")
    import subprocess
    resultado = subprocess.run(
        [sys.executable, TEST_PATH, "-v"],
        capture_output=True,
        text=True,
    )
    print(resultado.stdout)
    if resultado.stderr:
        print("ERROS:", resultado.stderr)
    print("Código de saída:", resultado.returncode)
    return resultado.returncode


def main():
    extrair_mdt()
    meta = inspecionar_mdt()
    info_recorte = recortar_mdt(meta)
    codigo_saida = executar_testes()

    print("\n" + "=" * 60)
    print("RESUMO FINAL")
    print("=" * 60)
    print("MDT original (ZIP):", ZIP_PATH)
    print("ArcGrid extraído:", ARCGRID_DIR)
    print("GeoTIFF recortado:", OUT_TIFF)
    print("Dimensões recorte: %d x %d" % (info_recorte["largura"], info_recorte["altura"]))
    print("Resolução: %.6f x %.6f m" % (info_recorte["resolucao_x"], info_recorte["resolucao_y"]))
    print("CRS:", info_recorte["crs"])
    print("NoData:", info_recorte["nodata"])
    print("Altitude mínima recorte: %.2f m" % info_recorte["altitude_min"])
    print("Altitude máxima recorte: %.2f m" % info_recorte["altitude_max"])
    print("Altitude média recorte:  %.2f m" % info_recorte["altitude_mean"])
    print("Tamanho GeoTIFF: %.2f MB" % info_recorte["tamanho_mb"])
    print("Módulo altitude:", MODULE_PATH)
    print("Testes:", TEST_PATH)
    print("Código de saída dos testes:", codigo_saida)
    print("ZIP original preservado:", os.path.exists(ZIP_PATH))

    return 0 if codigo_saida == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
