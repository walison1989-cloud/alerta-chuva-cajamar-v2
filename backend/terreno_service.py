#!/usr/bin/env python3
"""
Serviço de consulta de variáveis topográficas do terreno de Cajamar.

Reutiliza backend/altitude_service.py para obtenção de altitude e adiciona:
- declividade em graus
- elevação relativa em metros (janela espacial de 150 m)
- identificação de área topograficamente baixa (limiar -5 m)
- qualidade dos dados e fonte

Todos os rasters são carregados em memória uma única vez (pré-processados)
para evitar recálculos a cada consulta.
"""

import os
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer

from altitude_service import obter_altitude, _carregar_dataset as _carregar_altitude, _carregar_transformador as _carregar_transformador_alt

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROCESSED_DIR = os.path.join(_PROJECT_ROOT, "data", "processed")

# Caminhos dos rasters pré-processados
_DECLIVIDADE_PATH = os.path.join(_PROCESSED_DIR, "declividade_graus.tif")
_ELEVACAO_RELATIVA_PATH = os.path.join(_PROCESSED_DIR, "elevacao_relativa.tif")
_AREA_BAIXA_PATH = os.path.join(_PROCESSED_DIR, "area_topograficamente_baixa.tif")

# Cache de datasets e transformador
_ds_declividade = None
_ds_elevacao_relativa = None
_ds_area_baixa = None
_transformador = None
_transformador_inverso = None


def _carregar_transformador():
    global _transformador
    if _transformador is None:
        ds_alt = _carregar_altitude()
        _transformador = Transformer.from_crs("EPSG:4326", ds_alt.crs, always_xy=True)
    return _transformador


def _carregar_ds(caminho, cache_var_nome):
    globals_dict = globals()
    if globals_dict.get(cache_var_nome) is None:
        globals_dict[cache_var_nome] = rasterio.open(caminho)
    return globals_dict[cache_var_nome]


def _ler_pixel(ds, x, y):
    """Lê um valor de pixel nas coordenadas (x, y) do CRS do raster."""
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


def _ponto_dentro_limites(ds, x, y):
    return (ds.bounds.left <= x <= ds.bounds.right) and (ds.bounds.bottom <= y <= ds.bounds.top)


def consultar_terreno(latitude, longitude):
    """
    Consulta variáveis topográficas para um ponto (latitude, longitude) em WGS84.

    Retorna dicionário com:
      - altitude_m: altitude em metros (ou None)
      - declividade_graus: declividade em graus (ou None)
      - elevacao_relativa_m: elevação relativa à média da janela de 150 m (ou None)
      - qualidade_dados: 'boa' | 'limitada' | 'sem_dados' | 'fora_cobertura'
      - fonte: string descritiva da origem dos dados

    Regras de qualidade:
      - 'boa': todos os valores válidos
      - 'limitada': altitude válida mas algum derivado NoData
      - 'sem_dados': ponto dentro da cobertura mas valor é NoData
      - 'fora_cobertura': ponto fora dos limites do MDT
    """
    trans = _carregar_transformador()
    x, y = trans.transform(longitude, latitude)

    ds_alt = _carregar_altitude()
    dentro = _ponto_dentro_limites(ds_alt, x, y)

    if not dentro:
        return {
            "altitude_m": None,
            "declividade_graus": None,
            "elevacao_relativa_m": None,
            "qualidade_dados": "fora_cobertura",
            "fonte": "MDT Cajamar (SGB/CPRM+IPT, 2017) - recorte 5 m",
        }

    # Altitude (reusa altitude_service)
    altitude = obter_altitude(latitude, longitude)

    # Declividade
    ds_dec = _carregar_ds(_DECLIVIDADE_PATH, "_ds_declividade")
    declividade = _ler_pixel(ds_dec, x, y) if _ponto_dentro_limites(ds_dec, x, y) else None

    # Elevação relativa
    ds_elev = _carregar_ds(_ELEVACAO_RELATIVA_PATH, "_ds_elevacao_relativa")
    elevacao_relativa = _ler_pixel(ds_elev, x, y) if _ponto_dentro_limites(ds_elev, x, y) else None

    # Determina qualidade
    if altitude is None:
        qualidade = "sem_dados"
    elif declividade is None or elevacao_relativa is None:
        qualidade = "limitada"
    else:
        qualidade = "boa"

    return {
        "altitude_m": altitude,
        "declividade_graus": declividade,
        "elevacao_relativa_m": elevacao_relativa,
        "qualidade_dados": qualidade,
        "fonte": "MDT Cajamar (SGB/CPRM+IPT, 2017) - recorte 5 m",
    }


def consultar_terreno_lote(pontos):
    """
    Consulta múltiplos pontos. pontos: lista de (latitude, longitude).
    Retorna lista de dicionários.
    """
    return [consultar_terreno(lat, lon) for lat, lon in pontos]


def area_eh_topograficamente_baixa(latitude, longitude):
    """
    Retorna True se o ponto estiver em área topograficamente baixa
    (elevação relativa < -5 m), False caso contrário, None se sem dados.
    """
    trans = _carregar_transformador()
    x, y = trans.transform(longitude, latitude)

    ds_alt = _carregar_altitude()
    if not _ponto_dentro_limites(ds_alt, x, y):
        return None

    ds_baixa = _carregar_ds(_AREA_BAIXA_PATH, "_ds_area_baixa")
    if not _ponto_dentro_limites(ds_baixa, x, y):
        return None

    valor = _ler_pixel(ds_baixa, x, y)
    if valor is not None:
        return valor == 1.0
    # The shipped mask encodes both non-low terrain and missing data as NoData.
    # Use the relative-elevation raster to distinguish those cases.
    ds_elev = _carregar_ds(_ELEVACAO_RELATIVA_PATH, "_ds_elevacao_relativa")
    elevacao = _ler_pixel(ds_elev, x, y) if _ponto_dentro_limites(ds_elev, x, y) else None
    return None if elevacao is None else elevacao < -5.0


if __name__ == "__main__":
    # Teste rápido
    testes = [
        (-23.3561, -46.8769),  # centro Cajamar
        (-23.3800, -46.8500),
        (-23.5000, -47.0000),  # fora
    ]
    for lat, lon in testes:
        resultado = consultar_terreno(lat, lon)
        print(f"lat={lat}, lon={lon} -> {resultado}")
