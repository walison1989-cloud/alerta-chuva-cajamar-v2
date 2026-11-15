from dataclasses import replace
from datetime import datetime,timedelta,timezone
import pytest
from motor_probabilistico.dados_estruturados import EventoAlagamento,MedicaoChuva,VariavelTopografica
from motor_probabilistico.consulta_cruzada import montar_registro_cruzado,verificar_vazamento_temporal,filtrar_registros_validos

T=datetime(2026,11,8,12,tzinfo=timezone.utc)
EVENTO=EventoAlagamento(1,"alagamento",None,None,-23.3561,-46.8769,T+timedelta(hours=8),True,"fixture",
    ocorrido_em=T,precisao_temporal="instante",fonte_temporal="relato-confirmado")
TOPO=VariavelTopografica(EVENTO.latitude,EVENTO.longitude,750,10,0,"boa")
CHUVA=MedicaoChuva(1,"E1",T-timedelta(hours=1),30,"acumulado_24h",24,"mm","CEMADEN","oficial",T-timedelta(minutes=30),
    latitude=EVENTO.latitude,longitude=EVENTO.longitude)

def montar(evento=EVENTO,chuvas=None,previsoes=None):
    return montar_registro_cruzado(evento,[CHUVA] if chuvas is None else chuvas,previsoes or [],TOPO)

def test_occurrence_time_is_independent_of_verification():
    r=montar(chuvas=[CHUVA,replace(CHUVA,data_hora=T+timedelta(hours=2),coletado_em=T+timedelta(hours=3),precipitacao_mm=99)])
    assert r.evento_data==T and r.chuva_observada_24h_antes_mm==30
    assert not verificar_vazamento_temporal(r)

def test_legacy_event_is_not_backfilled():
    r=montar(replace(EVENTO,ocorrido_em=None))
    assert r.evento_data is None and not filtrar_registros_validos([r])[0]

@pytest.mark.parametrize("changes",[
    {"tipo_medicao":"intervalo"},{"janela_horas":1},{"unidade":"cm"},{"fonte_dado":"DADO_TESTE"},
    {"qualidade_dado":"suspeita"},{"coletado_em":T+timedelta(seconds=1)},
    {"latitude":0},{"coletado_em":None},{"data_hora":T.replace(tzinfo=None)},
    {"precipitacao_mm":float("nan")},
])
def test_ineligible_rain_never_enters_24h_feature(changes):
    assert montar(chuvas=[replace(CHUVA,**changes)]).chuva_observada_24h_antes_mm is None

def test_station_is_selected_spatially_before_latest_time():
    remote=replace(CHUVA,codigo_estacao="REMOTE",latitude=-23.40,data_hora=T-timedelta(minutes=10),coletado_em=T)
    assert montar(chuvas=[remote,CHUVA]).estacao_chuva_codigo=="E1"

def previsao(**changes):
    p=replace(CHUVA,fonte_dado="Open-Meteo",qualidade_dado="modelo",tipo_medicao="previsao_acumulado_24h",
        emitida_em=T-timedelta(hours=2),coletado_em=T-timedelta(hours=1),valido_de=T,valido_ate=T+timedelta(hours=24))
    return replace(p,**changes)

def test_forecast_requires_historical_issue_and_availability():
    valid=previsao(precipitacao_mm=12)
    late=previsao(emitida_em=T+timedelta(hours=1),coletado_em=T+timedelta(hours=2),precipitacao_mm=100)
    assert montar(previsoes=[late,valid]).chuva_prevista_24h_depois_mm==12
    assert montar(previsoes=[previsao(emitida_em=None)]).chuva_prevista_24h_depois_mm is None

def test_detector_rejects_forged_future_provenance():
    r=montar()
    r.observada_disponivel_em=T+timedelta(hours=1)
    assert verificar_vazamento_temporal(r) and r.tem_vazamento_temporal()
    assert not filtrar_registros_validos([r])[0]

def test_forecast_uses_latest_known_issue_not_maximum_rain():
    old=previsao(precipitacao_mm=100,emitida_em=T-timedelta(hours=4))
    recent=previsao(precipitacao_mm=5)
    assert montar(previsoes=[old,recent]).chuva_prevista_24h_depois_mm==5
