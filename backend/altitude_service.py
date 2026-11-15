#!/usr/bin/env python3
"""
Serviço de consulta de altitude a partir do MDT recortado de Cajamar.

Fornece função para obter a altitude (em metros) dada uma latitude/longitude
(WGS84), usando o GeoTIFF recortado produzido pelo processamento do MDT oficial.
"""

import os
import rasterio
from rasterio.windows import Window
from pyproj import Transformer

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import numpy as np

_TIFF_PATH = os.path.join(_PROJECT_ROOT, "data", "processed", "mde_cajamar_recortado.tif")

_transformador = None
_dataset = None


def _carregar_dataset():
    global _dataset
    if _dataset is None:
        _dataset = rasterio.open(_TIFF_PATH)
    return _dataset


def _carregar_transformador():
    global _transformador
    if _transformador is None:
        ds = _carregar_dataset()
        _transformador = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
    return _transformador


def obter_altitude(latitude, longitude):
    """
    Retorna a altitude em metros para a coordenada (latitude, longitude) em WGS84.

    Retorna None se o ponto estiver fora da área do MDT ou for NoData.
    """
    ds = _carregar_dataset()
    trans = _carregar_transformador()

    # Transforma WGS84 -> CRS do raster
    x, y = trans.transform(longitude, latitude)

    # Verifica se está dentro dos limites
    if not (ds.bounds.left <= x <= ds.bounds.right and ds.bounds.bottom <= y <= ds.bounds.top):
        return None

    # Lê o valor do pixel
    try:
        row, col = ds.index(x, y)
        if not (0 <= row < ds.height and 0 <= col < ds.width):
            return None
        valor = ds.read(1, window=Window(col, row, 1, 1))[0, 0]
    except (IndexError, ValueError):
        return None

    if valor == ds.nodata or np.isnan(valor):
        return None

    return float(valor)


def obter_altitudes(pontos):
    """
    Retorna lista de altitudes para uma lista de (latitude, longitude).
    """
    return [obter_altitude(lat, lon) for lat, lon in pontos]


if __name__ == "__main__":
    import numpy as np
    # Teste rápido
    testes = [
        (-23.3561, -46.8769),  # centro aproximado de Cajamar
        (-23.4306, -46.9420),  # canto SO (provavelmente fora)
        (-23.2779, -46.8197),  # canto NE (provavelmente fora)
    ]
    for lat, lon in testes:
        alt = obter_altitude(lat, lon)
        print(f"lat={lat}, lon={lon} -> altitude={alt}")
