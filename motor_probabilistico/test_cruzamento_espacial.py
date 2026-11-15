"""Fixtures geométricas verificam software, não precisão real ou limiares."""
from dataclasses import replace
from datetime import datetime,timedelta,timezone
import pytest
from motor_probabilistico.dados_estruturados import MedicaoChuva,VariavelTopografica
from motor_probabilistico.cruzamento_espacial import Previsao24h,CartografiaPonto,estimar_chuva,avaliar_cruzamento

T=datetime(2026,1,1,12,tzinfo=timezone.utc)
LAT,LON=-23.35,-46.87
def gauge(code,lat,lon,value=20):
    return MedicaoChuva(1,code,T-timedelta(minutes=10),value,'acumulado_24h',24,'mm','CEMADEN','oficial',T,latitude=lat,longitude=lon)
RAIN=[gauge('a',LAT+.02,LON-.02),gauge('b',LAT+.02,LON+.02),gauge('c',LAT-.02,LON)]
FORECAST=Previsao24h(25,T-timedelta(hours=1),T,T,T+timedelta(hours=24),LAT,LON)
TOPO=VariavelTopografica(LAT,LON,750,3,-6,'boa')
CART=CartografiaPonto(True,True,'Alta','inundacao','SGB fixture')

def run(rain=None,forecast=FORECAST,terrain=TOPO,cart=CART):
    return avaliar_cruzamento(LAT,LON,RAIN if rain is None else rain,forecast,terrain,cart,decisao_em=T)

def test_idw_uniforme_preserva_valor_e_pesos():
    r=estimar_chuva(LAT,LON,RAIN,T)
    assert r['metodo']=='idw_interpolacao' and r['suporte_espacial']
    assert r['mm_estimados']==pytest.approx(20)
    assert sum(s['peso'] for s in r['estacoes'])==pytest.approx(1)

def test_idw_fica_entre_extremos_e_pesa_distancia():
    r=estimar_chuva(LAT,LON,[gauge('a',LAT+.01,LON,10),gauge('b',LAT+.02,LON,50)],T)
    assert r['mm_estimados']==pytest.approx(18,abs=.001)
    assert not r['suporte_espacial'] and r['metodo']=='idw_extrapolacao'

def test_leitura_no_ponto_nao_divide_por_zero():
    r=estimar_chuva(LAT,LON,[gauge('x',LAT,LON,5)]+RAIN,T)
    assert r['mm_estimados']==5 and r['estacoes'][0]['peso']==1
    assert r['metodo']=='leitura_no_ponto'

@pytest.mark.parametrize('changes',[
    {'precipitacao_mm':None},{'precipitacao_mm':True},{'precipitacao_mm':float('nan')},
    {'tipo_medicao':'intervalo'},{'coletado_em':T+timedelta(seconds=1)},
    {'data_hora':T-timedelta(hours=7)},{'fonte_dado':'SP Águas'},
    {'qualidade_dado':'catalogo'},{'codigo_estacao':None},{'latitude':0},
])
def test_descarta_dados_inadequados(changes):
    assert estimar_chuva(LAT,LON,[replace(RAIN[0],**changes)],T)['mm_estimados'] is None

def test_deduplica_codigo_e_coordenadas():
    r=estimar_chuva(LAT,LON,RAIN+[RAIN[0],replace(RAIN[0],codigo_estacao='alias')],T)
    assert len(r['estacoes'])==3
    assert r['mm_estimados']==pytest.approx(20)

def test_conflito_e_desalinhamento_temporal_nao_viram_triangulacao():
    conflicting=replace(RAIN[0],precipitacao_mm=99)
    assert not estimar_chuva(LAT,LON,RAIN+[conflicting],T)['suporte_espacial']
    old=replace(RAIN[2],data_hora=T-timedelta(hours=2))
    assert not estimar_chuva(LAT,LON,RAIN[:2]+[old],T)['suporte_espacial']

def test_indice_cruza_bases_sem_somar_chuva_ou_inventar_probabilidade():
    r=run()
    assert r['indice_ordinal_0_a_3']==3
    assert r['probabilidade_alagamento'] is None and not r['envia_alerta']
    assert r['fatores'][-1]['mm']==25
    assert r['qualidade']=='limitada_sem_validacao_local'

@pytest.mark.parametrize('kwargs',[
    {'rain':[]},{'rain':RAIN[:2]},{'forecast':None},{'terrain':None},{'cart':None},
    {'forecast':replace(FORECAST,emitida_em=T+timedelta(seconds=1))},
    {'forecast':replace(FORECAST,inicio=T-timedelta(hours=1))},
    {'terrain':replace(TOPO,latitude=0)},
    {'cart':replace(CART,cobertura_confirmada=False)},
])
def test_falta_de_base_nao_produz_indice(kwargs):
    r=run(**kwargs)
    assert r['indice_ordinal_0_a_3'] is None and r['nivel']=='dados_insuficientes'

def test_zero_confirmado_nao_significa_ausencia_de_risco():
    r=run(rain=[replace(m,precipitacao_mm=0) for m in RAIN],forecast=replace(FORECAST,mm=0))
    assert r['indice_ordinal_0_a_3']==0
    assert any('ausência de risco' in item for item in r['limitacoes'])

def test_cobertura_confirmada_sem_poligono_nao_e_ausencia_de_cobertura():
    r=run(cart=CartografiaPonto(True,False,None,None,'SGB fixture'))
    assert r['indice_ordinal_0_a_3']==2  # terrain contribution, not a polygon invented

def test_geometria_colinear_nao_cerca_o_ponto():
    r=estimar_chuva(LAT,LON,[gauge(str(i),LAT+.01*i,LON,20) for i in (1,2,3)],T)
    assert not r['suporte_espacial']

def test_contrato_json_executa_o_mesmo_motor_sem_dependencia_remota():
    import json
    from dataclasses import asdict
    from motor_probabilistico.executar_cruzamento import avaliar_documento
    doc=json.loads(json.dumps({'schema':1,'latitude':LAT,'longitude':LON,
        'decisao_em':T,'medicoes':[asdict(m) for m in RAIN],
        'previsao':asdict(FORECAST),'terreno':asdict(TOPO),'cartografia':asdict(CART)},
        default=lambda v:v.isoformat()))
    assert avaliar_documento(doc)['indice_ordinal_0_a_3']==3

def test_integracao_mdt_ausente_nao_fabrica_terreno(monkeypatch):
    from motor_probabilistico import integracao_etapa5_2 as integration
    def missing(*args): raise FileNotFoundError('fixture')
    monkeypatch.setattr(integration,'consultar_terreno',missing)
    r=integration.avaliar_cruzamento_ponto(LAT,LON,RAIN,FORECAST,CART,decisao_em=T)
    assert r['indice_ordinal_0_a_3'] is None
    assert 'terreno_valido_no_ponto' in r['dados_ausentes_ou_limitantes']
