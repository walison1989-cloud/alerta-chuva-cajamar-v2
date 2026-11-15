import json
from typing import Optional, Tuple, Dict, Any, List
from shapely import wkt
from shapely.errors import GEOSException
from shapely.geometry import Point, Polygon, MultiPolygon, mapping, shape

# Áreas notáveis e pontos históricos de alagamento em Cajamar para exibição no mapa
PONTOS_HISTORICOS_ALAGAMENTO = [
    {
        "id": 1,
        "nome": "Av. Tenente Marques - Rio Juqueri (Polvilho)",
        "bairro": "Polvilho",
        "latitude": -23.4192,
        "longitude": -46.8375,
        "nivel_suscetibilidade": "ALTO",
        "descricao": "Ponto com histórico de transbordamento do Rio Juqueri e acúmulo em pista durante chuvas fortes."
    },
    {
        "id": 2,
        "nome": "Av. Alfonso Bovero / Trevo Jordanésia",
        "bairro": "Jordanésia",
        "latitude": -23.3325,
        "longitude": -46.8621,
        "nivel_suscetibilidade": "MODERADO",
        "descricao": "Ponto crítico de escoamento pluvial próximo à Rodovia Anhanguera km 38."
    },
    {
        "id": 3,
        "nome": "Centro Histórico / Baixada do Córrego (Anhanguera)",
        "bairro": "Anhanguera",
        "latitude": -23.3540,
        "longitude": -46.8790,
        "nivel_suscetibilidade": "MODERADO",
        "descricao": "Região de confluência de águas pluviais do relevo acentuado central."
    },
    {
        "id": 4,
        "nome": "Portal dos Ipês - Av. das Palmeiras (Polvilho)",
        "bairro": "Polvilho",
        "latitude": -23.4110,
        "longitude": -46.8420,
        "nivel_suscetibilidade": "BAIXO",
        "descricao": "Monitoramento preventivo de galerias de águas pluviais."
    }
]

def identificar_bairro_por_coordenadas(latitude, longitude, bairros_lista):
    """Apenas cobertura real do polígono; nunca associa bairro adjacente por aproximação."""
    import math
    if not all(isinstance(v,(float,int)) and math.isfinite(v) for v in (latitude,longitude)):
        return None, "Coordenadas inválidas", None
    if not -90<=latitude<=90 or not -180<=longitude<=180:
        return None, "Coordenadas inválidas", None
    ponto=Point(longitude,latitude)
    for b in bairros_lista:
        try:
            geom=wkt.loads(b["geometria"]) if b.get("geometria") else shape(b.get("geojson"))
            if geom.is_valid and geom.covers(ponto):
                return b.get("id_bairro"),b.get("nome_bairro"),0.0
        except (TypeError,ValueError,GEOSException):
            continue
    return None,"Fora da cobertura de bairros",None

def wkt_para_geojson(wkt_str: str) -> Optional[Dict[str, Any]]:
    """
    Converte geometria WKT em GeoJSON para renderização direta no mapa Leaflet.
    """
    if not wkt_str:
        return None
    try:
        geom = wkt.loads(wkt_str)
        return mapping(geom)
    except Exception:
        return None
