"""Open-Meteo é saída de modelo. Falha da fonte nunca produz valores simulados."""
import datetime
import math
import httpx
from fastapi import HTTPException

_CACHE_METEO = {}
CACHE_TTL_SEGUNDOS = 300

def parse_meteo(data, agora=None):
    agora=agora or datetime.datetime.now(datetime.timezone.utc)
    cutoff=int(agora.timestamp())//3600*3600
    hourly=data.get("hourly",{})
    times,values=hourly.get("time",[]),hourly.get("precipitation",[])
    if len(times)!=len(values) or len(set(times))!=len(times): raise ValueError("Série horária inválida")
    series=[];recent={}
    for t,p in zip(times,values):
        if not isinstance(t,(int,float)) or not math.isfinite(t): raise ValueError("Timestamp inválido")
        valid=isinstance(p,(float,int)) and not isinstance(p,bool) and math.isfinite(p) and p>=0
        series.append({"data_hora":datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat(),
            "precipitacao_mm":float(p) if valid else None,"tipo":"OPEN_METEO_MODELO"})
        if cutoff-24*3600<t<=cutoff: recent[t]=float(p) if valid else None
    expected={cutoff-h*3600 for h in range(24)}
    complete=set(recent)==expected and all(p is not None for p in recent.values())
    current=data.get("current",{})
    return {"origem":"OPEN_METEO_MODELO","temperatura_atual_c":current.get("temperature_2m"),
        "umidade_atual_pct":current.get("relative_humidity_2m"),
        "precipitacao_atual_mm":current.get("precipitation"),
        "precipitacao_atual_intervalo_segundos":current.get("interval"),
        "acumulado_24h_mm":round(sum(recent.values()),2) if complete else None,
        "janela_24h_completa":complete,"referencia_em":agora.isoformat(),
        "series_horarias":series,"status_conexao":"ONLINE",
        "aviso":"Estimativa de modelo; não é medição de estação nem classificação de risco."}

async def consultar_open_meteo(latitude,longitude):
    if not all(isinstance(v,(float,int)) and math.isfinite(v) for v in (latitude,longitude)) or not -90<=latitude<=90 or not -180<=longitude<=180:
        raise HTTPException(422,"Coordenadas inválidas")
    key=(round(latitude,4),round(longitude,4))
    now=datetime.datetime.now(datetime.timezone.utc)
    cached=_CACHE_METEO.get(key)
    if cached and (now-cached[0]).total_seconds()<CACHE_TTL_SEGUNDOS: return cached[1]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response=await client.get("https://api.open-meteo.com/v1/forecast",params={
                "latitude":latitude,"longitude":longitude,"current":"temperature_2m,relative_humidity_2m,precipitation,weather_code",
                "hourly":"precipitation","timezone":"UTC","timeformat":"unixtime","past_hours":25,"forecast_hours":24})
            response.raise_for_status()
            result=parse_meteo(response.json(),now)
    except (httpx.HTTPError,ValueError,TypeError,KeyError,OverflowError):
        raise HTTPException(503,"Dados meteorológicos indisponíveis. Nenhum valor foi estimado pelo aplicativo.") from None
    if len(_CACHE_METEO)>=100: _CACHE_METEO.pop(next(iter(_CACHE_METEO)))
    _CACHE_METEO[key]=(now,result)
    return result
