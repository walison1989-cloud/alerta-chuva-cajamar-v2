from datetime import datetime,timedelta,timezone
from unittest.mock import Mock
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from models import Base,Bairro,Estacao,Alerta,ConfiguracaoMotor
from services.meteo_service import parse_meteo
from services.simulation_service import executar_simulacao_chuva,limpar_dados_simulacao
from services import alert_engine
from schemas import ConfiguracaoLimiares
from fastapi import HTTPException

T=datetime(2026,11,8,18,30,tzinfo=timezone.utc)

def test_meteo_window_is_24_hours_and_modelled():
    end=int(T.timestamp())//3600*3600
    data={"hourly":{"time":[end-h*3600 for h in range(40,-10,-1)],"precipitation":[1]*50}}
    r=parse_meteo(data,T)
    assert r["acumulado_24h_mm"]==24 and r["janela_24h_completa"]
    assert all(p["tipo"]=="OPEN_METEO_MODELO" for p in r["series_horarias"])
    data["hourly"]["precipitation"][30]=None
    assert parse_meteo(data,T)["acumulado_24h_mm"] is None

@pytest.fixture
def db():
    engine=create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        b=Bairro(nome_bairro="Fixture",municipio="Cajamar")
        session.add(b);session.flush()
        session.add(Estacao(nome_estacao="Fixture",codigo_estacao="FIX",id_bairro=b.id_bairro))
        session.commit();yield session
    engine.dispose()

def test_simulation_cleanup_preserves_non_simulation_alerts(db):
    b=db.query(Bairro).first()
    real=Alerta(id_bairro=b.id_bairro,nivel="ALERTA",status="EMITIDO",origem="EXPERIMENTAL")
    unknown=Alerta(id_bairro=b.id_bairro,nivel="ALERTA",status="EMITIDO",origem="LEGADO_NAO_CLASSIFICADO")
    db.add_all([real,unknown]);db.commit()
    r=executar_simulacao_chuva(db,b.id_bairro,"tempestade_extrema")
    assert r["envio_realizado"] is False and r["total_moradores_notificados_lgpd"]==0
    limpar_dados_simulacao(db)
    assert db.get(Alerta,real.id_alerta).status=="EMITIDO"
    assert db.get(Alerta,unknown.id_alerta).status=="EMITIDO"
    simulated=db.query(Alerta).filter(Alerta.origem=="SIMULACAO").one()
    assert simulated.status=="RESOLVIDO" and simulated.execucao_simulacao

def test_invalid_partial_threshold_update_does_not_change_storage(db):
    with pytest.raises(HTTPException) as error:
        alert_engine.salvar_configuracao(db,ConfiguracaoLimiares(THRESHOLD_ATENCAO_MM_H=1000))
    assert error.value.status_code==422
    assert db.get(ConfiguracaoMotor,1) is None

def test_config_persists_and_reloads(db):
    previous=dict(alert_engine.THRESHOLDS)
    try:
        alert_engine.salvar_configuracao(db,ConfiguracaoLimiares(THRESHOLD_ATENCAO_MM_H=11))
        alert_engine.THRESHOLDS["ATENCAO_MM_H"]=9
        assert alert_engine.carregar_configuracao(db)["limiares"]["ATENCAO_MM_H"]==11
    finally: alert_engine.THRESHOLDS.update(previous)

def test_geocoding_failure_returns_unavailable_without_coordinates(monkeypatch):
    import httpx
    from services.geocoding_service import geocodificar_endereco
    class Offline:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def get(self,*args,**kwargs): raise httpx.ConnectError("offline")
    monkeypatch.setattr(httpx,"AsyncClient",lambda **kwargs:Offline())
    coro=geocodificar_endereco("Rua de teste","07791000")
    with pytest.raises(HTTPException) as error: coro.send(None)
    assert error.value.status_code==503

def test_meteo_failure_returns_unavailable_without_simulated_values(monkeypatch):
    import httpx
    from services.meteo_service import consultar_open_meteo,_CACHE_METEO
    _CACHE_METEO.clear()
    class Offline:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def get(self,*args,**kwargs): raise httpx.ConnectError("offline")
    monkeypatch.setattr(httpx,"AsyncClient",lambda **kwargs:Offline())
    with pytest.raises(HTTPException) as error: consultar_open_meteo(-23.35,-46.87).send(None)
    assert error.value.status_code==503 and not _CACHE_METEO

def test_spatial_matching_accepts_api_geojson_and_rejects_nearby_outside():
    from services.spatial_service import identificar_bairro_por_coordenadas
    areas=[{"id_bairro":1,"nome_bairro":"Fixture","geojson":{"type":"Polygon","coordinates":[[[-46.9,-23.4],[-46.8,-23.4],[-46.8,-23.3],[-46.9,-23.3],[-46.9,-23.4]]]}}]
    assert identificar_bairro_por_coordenadas(-23.35,-46.85,areas)==(1,"Fixture",0.0)
    assert identificar_bairro_por_coordenadas(-23.41,-46.85,areas)[0] is None

def test_portable_apostila_query_uses_sao_paulo_hours(db):
    from main import consulta_diferenca_chuva
    from models import MedicaoChuva
    station=db.query(Estacao).first()
    for hour,value in [(11,12.5),(12,18.0)]:
        db.add(MedicaoChuva(id_estacao=station.id_estacao,data_hora=datetime(2026,10,25,hour),precipitacao_mm=value,fonte_dado="DADO_TESTE"))
    db.commit()
    result=consulta_diferenca_chuva(db)["resultado"]
    assert len(result)==1 and result[0]["diferenca_mm"]==5.5

def test_experimental_terrain_is_disabled_by_default(monkeypatch):
    from main import avaliar_terreno_experimental
    from schemas import AvaliacaoTerrenoRequest
    monkeypatch.delenv("ENABLE_EXPERIMENTAL_TERRAIN",raising=False)
    with pytest.raises(HTTPException) as error:
        avaliar_terreno_experimental(AvaliacaoTerrenoRequest(latitude=-23.35,longitude=-46.87))
    assert error.value.status_code==503
