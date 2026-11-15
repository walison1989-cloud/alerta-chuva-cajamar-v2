import os
import datetime

def utc_naive():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, desc

from database import engine, get_db, init_db, ACTIVE_DB_TYPE, IS_FALLBACK
from models import Bairro, Estacao, MedicaoChuva, Alerta, ContatoAlerta
from schemas import (
    ContatoMoradorCreate, GeocodeRequest, GeocodeReverseRequest,
    SimulacaoRequest, ConfiguracaoLimiares
)
from services.spatial_service import (
    identificar_bairro_por_coordenadas, wkt_para_geojson, PONTOS_HISTORICOS_ALAGAMENTO
)
from services.geocoding_service import buscar_cep_viacep, geocodificar_endereco
from services.meteo_service import consultar_open_meteo
from services.alert_engine import (
    THRESHOLDS, CALCULATION_MODE, classificar_nivel_chuva,
    calcular_acumulado_por_modo, avaliar_e_emitir_alerta, obter_contatos_notificaveis
)
from services.simulation_service import (
    CENARIOS_SIMULACAO, executar_simulacao_chuva, limpar_dados_simulacao
)

from contextlib import asynccontextmanager
from security import require_admin
from services import alert_engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="Alerta de Chuva Cajamar - API",
    description="Backend acadêmico do projeto Alerta de Chuva Cajamar (PostgreSQL + PostGIS / SQLite + Shapely)",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[v.strip() for v in os.getenv("LEGACY_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if v.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {
        "status": "ONLINE",
        "sistema": "Alerta de Chuva Cajamar",
        "versao": "1.0.0",
        "motor_banco_dados": ACTIVE_DB_TYPE,
        "emulacao_fallback": IS_FALLBACK,
        "modo_calculo_acumulado": alert_engine.CALCULATION_MODE,
        "aviso_legal": "Sistema acadêmico experimental. Não substitui avisos oficiais da Defesa Civil."
    }

# =====================================================================
# ROTAS DE BAIRROS E MONITORAMENTO
# =====================================================================

@app.get("/api/bairros")
def listar_bairros(db: Session = Depends(get_db)):
    """
    Retorna os bairros cadastrados com polígonos GeoJSON,
    estatísticas climáticas e alertas ativos.
    """
    bairros = db.query(Bairro).all()
    resultado = []

    for b in bairros:
        # Alertas emitidos ativos para este bairro
        alertas_ativos = db.query(Alerta).filter(
            Alerta.id_bairro == b.id_bairro,
            Alerta.status == "EMITIDO",
            Alerta.origem != "SIMULACAO"
        ).order_by(desc(Alerta.data_emissao)).all()

        # Total de moradores cadastrados no bairro
        total_moradores = db.query(ContatoAlerta).filter(
            ContatoAlerta.id_bairro == b.id_bairro,
            ContatoAlerta.ativo == True
        ).count()

        # Estação do bairro
        estacao = db.query(Estacao).filter(Estacao.id_bairro == b.id_bairro).first()

        # Última medição de chuva
        ultima_medicao = None
        if estacao:
            m = db.query(MedicaoChuva).filter(
                MedicaoChuva.id_estacao == estacao.id_estacao,
                MedicaoChuva.fonte_dado != "SIMULACAO_CHUVA_INTENSA"
            ).order_by(desc(MedicaoChuva.data_hora)).first()
            if m:
                ultima_medicao = m.to_dict()

        nivel_atual = "NORMAL"
        if alertas_ativos:
            nivel_atual = alertas_ativos[0].nivel

        resultado.append({
            "id_bairro": b.id_bairro,
            "nome_bairro": b.nome_bairro,
            "municipio": b.municipio,
            "geojson": wkt_para_geojson(b.geometria),
            "nivel_atual": nivel_atual,
            "alertas_ativos": [a.to_dict() for a in alertas_ativos],
            "total_moradores_cadastrados": total_moradores,
            "estacao_principal": estacao.to_dict() if estacao else None,
            "ultima_medicao": ultima_medicao
        })

    return resultado

# =====================================================================
# ROTAS DE ESTAÇÕES E MEDIÇÕES
# =====================================================================

@app.get("/api/estacoes")
def listar_estacoes(db: Session = Depends(get_db)):
    estacoes = db.query(Estacao).all()
    res = []
    for e in estacoes:
        d = e.to_dict()
        # Busca as últimas medições
        medicoes = db.query(MedicaoChuva).filter(
            MedicaoChuva.id_estacao == e.id_estacao,
            MedicaoChuva.fonte_dado != "SIMULACAO_CHUVA_INTENSA"
        ).order_by(desc(MedicaoChuva.data_hora)).limit(10).all()
        d["ultimas_medicoes"] = [m.to_dict() for m in medicoes]
        res.append(d)
    return res

@app.get("/api/consultas-apostila/diferenca-chuva")
def consulta_diferenca_chuva(db: Session = Depends(get_db)):
    """
    Executa a lógica exata da consulta do capítulo 14 da apostila técnica:
    Calcula o aumento de chuva entre 8h e 9h do dia de teste para as estações.
    """
    from zoneinfo import ZoneInfo
    buckets={}
    rows=db.query(MedicaoChuva).filter(MedicaoChuva.fonte_dado=="DADO_TESTE").all()
    for m in rows:
        dt=m.data_hora
        if dt.tzinfo is None: dt=dt.replace(tzinfo=datetime.timezone.utc)
        local=dt.astimezone(ZoneInfo("America/Sao_Paulo"))
        if local.hour not in (8,9): continue
        key=(m.id_estacao,local.date())
        bucket=buckets.setdefault(key,{})
        bucket[local.hour]=max(bucket.get(local.hour,float("-inf")),float(m.precipitacao_mm))
    resultado=[]
    for (estacao_id,dia),bucket in buckets.items():
        if 8 not in bucket or 9 not in bucket: continue
        estacao=db.get(Estacao,estacao_id)
        resultado.append({"estacao":estacao.nome_estacao,"bairro":estacao.bairro.nome_bairro if estacao.bairro else None,
            "dia":dia.isoformat(),"leitura_08h_mm":bucket[8],"leitura_09h_mm":bucket[9],
            "diferenca_mm":round(bucket[9]-bucket[8],2)})
    return {"referencia":"Capítulo 14 — dados de teste, horas de America/Sao_Paulo",
        "resultado":sorted(resultado,key=lambda r:r["diferenca_mm"],reverse=True)}

# =====================================================================
# ROTAS DE CADASTRO DE MORADORES (LGPD + GEOCODIFICAÇÃO + POSTGIS)
# =====================================================================

@app.get("/api/moradores", dependencies=[Depends(require_admin)])
def listar_moradores(db: Session = Depends(get_db)):
    moradores = db.query(ContatoAlerta).order_by(desc(ContatoAlerta.data_cadastro)).all()
    return [m.to_dict() for m in moradores]

@app.post("/api/moradores", dependencies=[Depends(require_admin)])
async def cadastrar_morador(morador_in: ContatoMoradorCreate, db: Session = Depends(get_db)):
    """
    Cadastra morador, geocodifica endereço se necessário,
    identifica o bairro via polígonos espaciais e valida consentimento LGPD.
    """

    lat = morador_in.latitude
    lon = morador_in.longitude
    bairro_id = morador_in.id_bairro
    bairro_nome = None

    if lat is None or lon is None:
        raise HTTPException(422,"Confirme latitude e longitude no mapa antes de cadastrar.")
    # 2. Identificação espacial do bairro via PostGIS / Shapely
    bairros_db = db.query(Bairro).all()
    bairros_lista = [b.to_dict() for b in bairros_db]

    detected_id, detected_name, dist_km = identificar_bairro_por_coordenadas(lat, lon, bairros_lista)

    if detected_id:
        bairro_id = detected_id
        bairro_nome = detected_name
    else:
        raise HTTPException(422,"Coordenadas fora dos bairros disponíveis no protótipo. Nenhum bairro foi presumido.")

    # 3. Criação do registro na tabela contatos_alerta
    novo_contato = ContatoAlerta(
        id_bairro=bairro_id,
        nome=morador_in.nome,
        telefone=morador_in.telefone,
        email=morador_in.email,
        ativo=True,
        consentimento=morador_in.consentimento,
        endereco=morador_in.endereco,
        numero=morador_in.numero,
        complemento=morador_in.complemento,
        cep=morador_in.cep,
        latitude=lat,
        longitude=lon,
        bairro_detectado=bairro_nome
    )

    db.add(novo_contato)
    db.commit()
    db.refresh(novo_contato)

    return {
        "status": "CADASTRO_SUCESSO",
        "morador": novo_contato.to_dict(),
        "geolocalizacao": {
            "latitude": lat,
            "longitude": lon,
            "bairro_identificado": bairro_nome,
            "distancia_poligono_km": dist_km,
            "metodo_espacial": "PostGIS ST_Contains / Shapely Point-in-Polygon"
        },
        "lgpd": {
            "consentimento_ativo": morador_in.consentimento,
            "aviso": "Consentimento registrado para recebimento de alertas de chuva." if morador_in.consentimento else "Avisos não serão enviados por falta de consentimento (LGPD)."
        }
    }

@app.delete("/api/moradores/{id_contato}", dependencies=[Depends(require_admin)])
def remover_morador(id_contato: int, db: Session = Depends(get_db)):
    m = db.query(ContatoAlerta).filter(ContatoAlerta.id_contato == id_contato).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado.")
    db.delete(m)
    db.commit()
    return {"status": "REMOVIDO", "id_contato": id_contato}

# =====================================================================
# ROTAS DE GEOCODIFICAÇÃO
# =====================================================================

@app.get("/api/geocoding/cep/{cep}", dependencies=[Depends(require_admin)])
async def consulta_cep(cep: str):
    res = await buscar_cep_viacep(cep)
    if not res:
        raise HTTPException(status_code=404, detail="CEP não encontrado.")
    return res

@app.post("/api/geocoding/search", dependencies=[Depends(require_admin)])
async def geocode_endereco(req: GeocodeRequest, db: Session = Depends(get_db)):
    geo = await geocodificar_endereco(req.endereco, req.cep, req.numero)

    # Identifica o bairro das coordenadas obtidas
    bairros_db = db.query(Bairro).all()
    bairros_lista = [b.to_dict() for b in bairros_db]
    bid, bname, dist = identificar_bairro_por_coordenadas(geo["latitude"], geo["longitude"], bairros_lista)

    geo["bairro_detectado"] = bname
    geo["id_bairro_detectado"] = bid
    geo["distancia_km"] = dist
    return geo

# =====================================================================
# ROTAS METEOROLÓGICAS (OPEN-METEO REAL-TIME)
# =====================================================================

@app.get("/api/meteo/live", dependencies=[Depends(require_admin)])
async def obter_meteo_live(db: Session = Depends(get_db)):
    """
    Obtém dados meteorológicos em tempo real da Open-Meteo
    para as 3 regiões de Cajamar (Polvilho, Jordanésia, Anhanguera).
    """
    estacoes = db.query(Estacao).all()
    dados_regioes = []

    for est in estacoes:
        lat = est.latitude or -23.3560
        lon = est.longitude or -46.8760
        dados_meteo = await consultar_open_meteo(lat, lon)

        dados_regioes.append({
            "id_estacao": est.id_estacao,
            "codigo_estacao": est.codigo_estacao,
            "nome_estacao": est.nome_estacao,
            "bairro": est.bairro.nome_bairro if est.bairro else "Cajamar",
            "coordenadas": {"latitude": lat, "longitude": lon},
            "dados_climaticos": dados_meteo,
            "nivel_calculado": None
        })

    return {
        "fonte_principal": "Open-Meteo API",
        "data_consulta": utc_naive().isoformat(),
        "regioes": dados_regioes
    }

# =====================================================================
# ROTAS DE ALERTAS
# =====================================================================

@app.get("/api/alertas")
def listar_alertas(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Alerta).filter(Alerta.origem != "SIMULACAO")
    if status:
        query = query.filter(Alerta.status == status)
    alertas = query.order_by(desc(Alerta.data_emissao)).all()
    return [a.to_dict() for a in alertas]

# =====================================================================
# ROTAS DE SIMULAÇÃO DE CHUVAS INTENSAS
# =====================================================================

@app.get("/api/simulacao/cenarios")
def listar_cenarios():
    return CENARIOS_SIMULACAO

@app.post("/api/simulacao/executar", dependencies=[Depends(require_admin)])
def simular_chuva(req: SimulacaoRequest, db: Session = Depends(get_db)):
    try:
        resultado = executar_simulacao_chuva(
            db=db,
            id_bairro=req.id_bairro,
            cenario_id=req.cenario_id,
            precipitacao_custom_mm=req.precipitacao_custom_mm,
            acumulado_custom_mm=req.acumulado_custom_mm
        )
        return resultado
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e)) from None

@app.post("/api/simulacao/limpar", dependencies=[Depends(require_admin)])
def limpar_simulacao(db: Session = Depends(get_db)):
    return limpar_dados_simulacao(db)

# =====================================================================
# ROTAS DE CONFIGURAÇÃO DE REGRAS E PARÂMETROS
# =====================================================================

@app.get("/api/config")
def obter_config(db: Session = Depends(get_db)):
    return {**alert_engine.carregar_configuracao(db),"aviso":"Critérios experimentais; sem emissão pública."}

@app.post("/api/config", dependencies=[Depends(require_admin)])
def atualizar_config(cfg: ConfiguracaoLimiares, db: Session = Depends(get_db)):
    return {"status":"CONFIGURACAO_ATUALIZADA",**alert_engine.salvar_configuracao(db,cfg)}

# =====================================================================
# ROTAS DO MAPA (POLÍGONOS, ESTAÇÕES E PONTOS HISTÓRICOS)
# =====================================================================

@app.get("/api/mapa/camadas", dependencies=[Depends(require_admin)])
def obter_camadas_mapa(db: Session = Depends(get_db)):
    """
    Retorna todos os elementos do mapa em formato pronto para consumo
    pelo componente Leaflet: Polígonos de Bairros, Estações, Pontos de Risco e Moradores.
    """
    bairros = db.query(Bairro).all()
    estacoes = db.query(Estacao).all()
    moradores = db.query(ContatoAlerta).filter(
        ContatoAlerta.latitude.isnot(None),
        ContatoAlerta.longitude.isnot(None)
    ).all()

    # Bairros com cores dinâmicas conforme alerta
    camada_bairros = []
    for b in bairros:
        alerta_ativo = db.query(Alerta).filter(
            Alerta.id_bairro == b.id_bairro,
            Alerta.status == "EMITIDO",
            Alerta.origem != "SIMULACAO"
        ).order_by(desc(Alerta.data_emissao)).first()

        camada_bairros.append({
            "id_bairro": b.id_bairro,
            "nome_bairro": b.nome_bairro,
            "municipio": b.municipio,
            "nivel_alerta": alerta_ativo.nivel if alerta_ativo else "NORMAL",
            "mensagem_alerta": alerta_ativo.mensagem if alerta_ativo else "Condição estável",
            "geojson": wkt_para_geojson(b.geometria)
        })

    return {
        "bairros": camada_bairros,
        "estacoes": [e.to_dict() for e in estacoes],
        "pontos_historicos_alagamento": [],
        "moradores": [
            {
                "id_contato": m.id_contato,
                "nome": m.nome,
                "bairro": m.bairro.nome_bairro if m.bairro else m.bairro_detectado,
                "latitude": m.latitude,
                "longitude": m.longitude,
                "consentimento": m.consentimento
            }
            for m in moradores
        ]
    }


from schemas import AvaliacaoTerrenoRequest

@app.post("/api/experimental/terreno",dependencies=[Depends(require_admin)])
def avaliar_terreno_experimental(req: AvaliacaoTerrenoRequest):
    if os.getenv("ENABLE_EXPERIMENTAL_TERRAIN", "false").lower() != "true":
        raise HTTPException(503,"Análise experimental de terreno desativada.")
    from motor_probabilistico.integracao_etapa5_2 import avaliar_ponto,resultado_para_dict
    return resultado_para_dict(avaliar_ponto(**req.model_dump()))
