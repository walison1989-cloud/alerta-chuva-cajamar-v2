import pytest
from fastapi.testclient import TestClient
import sys
import os

# Adiciona o diretório backend ao sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import SessionLocal, init_db
from models import Bairro, Estacao, ContatoAlerta, MedicaoChuva, Alerta
from services.spatial_service import identificar_bairro_por_coordenadas
from services.alert_engine import classificar_nivel_chuva, calcular_acumulado_por_modo

@pytest.fixture(scope="module")
def client():
    previous_token = os.environ.get("LEGACY_ADMIN_TOKEN")
    os.environ["LEGACY_ADMIN_TOKEN"] = "local-audit-test-token"
    try:
        with TestClient(app, headers={"Authorization": "Bearer local-audit-test-token"}) as c:
            yield c
    finally:
        if previous_token is None:
            os.environ.pop("LEGACY_ADMIN_TOKEN", None)
        else:
            os.environ["LEGACY_ADMIN_TOKEN"] = previous_token

def test_01_health_check(client):
    """Valida endpoint de saúde e status do motor de banco de dados"""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ONLINE"
    assert "motor_banco_dados" in data
    assert "aviso_legal" in data

def test_02_bairros_e_estacoes_iniciais(client):
    """Verifica se os 3 bairros e 3 estações da apostila foram carregados"""
    resp_bairros = client.get("/api/bairros")
    assert resp_bairros.status_code == 200
    bairros = resp_bairros.json()
    assert len(bairros) >= 3
    nomes = [b["nome_bairro"] for b in bairros]
    assert "Polvilho" in nomes
    assert "Jordanesia" in nomes or "Jordanésia" in nomes
    assert "Anhanguera" in nomes

    resp_estacoes = client.get("/api/estacoes")
    assert resp_estacoes.status_code == 200
    estacoes = resp_estacoes.json()
    assert len(estacoes) >= 3
    codigos = [e["codigo_estacao"] for e in estacoes]
    assert "EA01" in codigos
    assert "EJ01" in codigos
    assert "EP01" in codigos

def test_03_deteccao_espacial_point_in_polygon(client):
    """Testa a identificação geográfica de bairros via Point-in-Polygon (PostGIS / Shapely)"""
    resp_bairros = client.get("/api/bairros")
    bairros = resp_bairros.json()

    # Ponto no coração de Polvilho (-23.4150, -46.8350)
    bid, bname, dist = identificar_bairro_por_coordenadas(-23.4150, -46.8350, bairros)
    assert bname == "Polvilho"
    assert dist == 0.0

    # Ponto em Jordanésia (-23.3300, -46.8650)
    bid, bname, dist = identificar_bairro_por_coordenadas(-23.3300, -46.8650, bairros)
    assert "Jordanesia" in bname or "Jordanésia" in bname
    assert dist == 0.0

def test_04_cadastro_morador_com_geolocalizacao_e_lgpd(client):
    """Testa cadastro de morador, geocodificação e verificação de consentimento LGPD"""
    payload = {
        "nome": "Morador Teste Polvilho",
        "telefone": "(11) 98888-7777",
        "email": "morador.teste@cajamar.com.br",
        "endereco": "Av. Tenente Marques",
        "numero": "1500",
        "cep": "07791-000",
        "consentimento": True,
        "latitude": -23.4150,
        "longitude": -46.8350
    }
    response = client.post("/api/moradores", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CADASTRO_SUCESSO"
    morador = data["morador"]
    assert morador["nome"] == "Morador Teste Polvilho"
    assert morador["consentimento"] is True
    assert morador["latitude"] is not None
    assert morador["longitude"] is not None
    assert "Polvilho" in morador["bairro_detectado"]

def test_05_regras_e_modos_calculo_acumulado():
    """Testa os dois modos de cálculo da apostila (INTERVALO_SOMA vs ACUMULADO_DIFERENCA)"""
    from datetime import datetime, timezone
    m1 = MedicaoChuva(data_hora=datetime.now(timezone.utc), precipitacao_mm=10.0)
    m2 = MedicaoChuva(data_hora=datetime.now(timezone.utc), precipitacao_mm=25.0)

    # Modo 1: Soma por intervalos
    res_soma = calcular_acumulado_por_modo([m1, m2], modo="INTERVALO_SOMA")
    assert res_soma["acumulado_mm"] == 35.0

    # Modo 2: Diferença entre leituras do pluviômetro cumulativo (Cap. 14 da apostila)
    res_dif = calcular_acumulado_por_modo([m1, m2], modo="ACUMULADO_DIFERENCA")
    assert res_dif["acumulado_mm"] == 15.0

    # Classificação de níveis experimentais
    assert classificar_nivel_chuva(3.0, 10.0) == "NORMAL"
    assert classificar_nivel_chuva(15.0, 20.0) == "ATENCAO"
    assert classificar_nivel_chuva(30.0, 40.0) == "ALERTA"
    assert classificar_nivel_chuva(55.0, 90.0) == "CRITICO"

def test_06_simulacao_chuva_intensa_e_limpeza(client):
    """Testa injeção de dados de chuva fictícios identificados e posterior limpeza"""
    # 1. Obter id do Polvilho
    bairros = client.get("/api/bairros").json()
    polvilho = next(b for b in bairros if "Polvilho" in b["nome_bairro"])

    # 2. Executar simulação de tempestade severa
    sim_payload = {
        "id_bairro": polvilho["id_bairro"],
        "cenario_id": "tempestade_extrema"
    }
    resp_sim = client.post("/api/simulacao/executar", json=sim_payload)
    assert resp_sim.status_code == 200
    res_data = resp_sim.json()
    assert res_data["status"] == "SIMULACAO_CONCLUIDA"
    assert res_data["fonte_dado_gravada"] == "SIMULACAO_CHUVA_INTENSA"
    assert res_data["alerta_emitido"] is not None
    assert res_data["alerta_emitido"]["nivel"] == "CRITICO"

    # 3. Limpar simulação
    resp_limpar = client.post("/api/simulacao/limpar")
    assert resp_limpar.status_code == 200
    assert resp_limpar.json()["status"] == "LIMPEZA_SUCESSO"

def test_07_consulta_diferenca_chuva_apostila(client):
    """Verifica a consulta reproduzida do Capítulo 14 da apostila com dados de teste"""
    resp = client.get("/api/consultas-apostila/diferenca-chuva")
    assert resp.status_code == 200
    dados = resp.json()["resultado"]
    assert len(dados) >= 1
    assert sorted(d["diferenca_mm"] for d in dados) == [5.5, 6.5, 17.0]
    nomes = [d["estacao"] for d in dados]
    assert any("Anhanguera" in n or "Jordan" in n or "Polvilho" in n for n in nomes)
