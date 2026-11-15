"""Consultas sem coordenadas inventadas. A localização deve ser confirmada pelo usuário."""
import re
import math
import httpx
from fastapi import HTTPException

def limpar_cep(cep): return re.sub(r"\D","",cep or "")

async def buscar_cep_viacep(cep):
    cep=limpar_cep(cep)
    if len(cep)!=8: raise HTTPException(422,"CEP deve conter oito dígitos.")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response=await client.get(f"https://viacep.com.br/ws/{cep}/json/")
            response.raise_for_status();data=response.json()
        if data.get("erro"): return None
        return {key:data.get(key) for key in ("cep","logradouro","complemento","bairro","localidade","uf")}
    except (httpx.HTTPError,ValueError,TypeError):
        raise HTTPException(503,"Consulta de CEP indisponível.") from None

async def geocodificar_endereco(endereco,cep=None,numero=None):
    if not endereco or not endereco.strip(): raise HTTPException(422,"Informe o endereço.")
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            response=await client.get("https://nominatim.openstreetmap.org/search",
                headers={"User-Agent":"AlertaChuvaCajamar/1.0 (consulta acadêmica de endereço)"},
                params={"q":", ".join(filter(None,[endereco,numero,limpar_cep(cep),"Cajamar, SP, Brasil"])),
                    "format":"json","limit":1,"countrycodes":"br","viewbox":"-47.002,-23.2179,-46.7597,-23.4906","bounded":1})
            response.raise_for_status();results=response.json()
        if not results: raise HTTPException(404,"Localização não encontrada. Marque e confirme o ponto no mapa.")
        lat,lon=float(results[0]["lat"]),float(results[0]["lon"])
        if not math.isfinite(lat) or not math.isfinite(lon) or not (-23.4906<=lat<=-23.2179 and -47.002<=lon<=-46.7597):
            raise HTTPException(422,"Resultado fora da área atendida.")
        return {"latitude":lat,"longitude":lon,"origem_geocodificacao":"NOMINATIM_OSM_APROXIMADO",
            "display_name":results[0].get("display_name"),"exige_confirmacao":True}
    except (httpx.HTTPError,ValueError,KeyError,TypeError):
        raise HTTPException(503,"Geocodificação indisponível. Marque e confirme o ponto no mapa.") from None
