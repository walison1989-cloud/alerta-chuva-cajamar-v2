import os
import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

from models import Base, Bairro, Estacao, MedicaoChuva
import datetime

load_dotenv()

logger = logging.getLogger("alerta_chuva.database")
logging.basicConfig(level=logging.INFO)

ENABLE_POSTGRES = os.getenv("ENABLE_POSTGRES", "false").lower() in ("true", "1", "yes")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgrespassword@localhost:5432/alerta_chuva_cajamar")
FALLBACK_SQLITE_PATH = os.getenv("FALLBACK_SQLITE_PATH", "alerta_chuva_cajamar.db")

engine = None
ACTIVE_DB_TYPE = "unknown"
IS_FALLBACK = False

if ENABLE_POSTGRES:
    try:
        logger.info("Tentando conectar ao PostgreSQL principal.")
        test_engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 2})
        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine = test_engine
        ACTIVE_DB_TYPE = "postgresql_postgis"
        IS_FALLBACK = False
        logger.info("Conexão com PostgreSQL + PostGIS estabelecida com sucesso!")
    except Exception as e:
        logger.warning("Conexão ao PostgreSQL indisponível. Ativando persistência SQLite.")
        raise RuntimeError("PostgreSQL configurado está indisponível; fallback automático desabilitado.") from None

if engine is None:
    # Ativação do modo PostGIS-compatível em SQLite com Shapely
    db_file_path = os.path.join(os.path.dirname(__file__), FALLBACK_SQLITE_PATH)
    sqlite_url = f"sqlite:///{db_file_path}"
    engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    ACTIVE_DB_TYPE = "sqlite_shapely_emulation"
    IS_FALLBACK = True
    logger.info(f"Engine de persistência ativa: SQLite PostGIS-Compatible ({sqlite_url})")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Inicializa o esquema de tabelas e insere dados iniciais (seeds)
    se o banco estiver vazio.
    """
    Base.metadata.create_all(bind=engine)
    # Additive local SQLite upgrade; existing alerts remain explicitly unclassified.
    if engine.dialect.name == "sqlite":
        columns={c["name"] for c in inspect(engine).get_columns("alertas")}
        with engine.begin() as conn:
            if "origem" not in columns:
                conn.execute(text("ALTER TABLE alertas ADD COLUMN origem VARCHAR(40) NOT NULL DEFAULT 'LEGADO_NAO_CLASSIFICADO'"))
            if "execucao_simulacao" not in columns:
                conn.execute(text("ALTER TABLE alertas ADD COLUMN execucao_simulacao VARCHAR(36)"))
    if os.getenv("LEGACY_SEED_DEMO", "false").lower() != "true":
        return
    db = SessionLocal()
    try:
        # Verifica se já existem bairros
        if db.query(Bairro).count() == 0:
            logger.info("Populando dados semente dos bairros de Cajamar...")

            # Polígonos WKT representativos para Polvilho, Jordanésia e Anhanguera
            polvilho_wkt = (
                "MULTIPOLYGON((("
                "-46.8600 -23.4400, "
                "-46.8150 -23.4400, "
                "-46.8150 -23.3950, "
                "-46.8600 -23.3950, "
                "-46.8600 -23.4400"
                ")))"
            )
            jordanesia_wkt = (
                "MULTIPOLYGON((("
                "-46.8900 -23.3450, "
                "-46.8350 -23.3450, "
                "-46.8350 -23.3000, "
                "-46.8900 -23.3000, "
                "-46.8900 -23.3450"
                ")))"
            )
            anhanguera_wkt = (
                "MULTIPOLYGON((("
                "-46.9200 -23.3950, "
                "-46.8500 -23.3950, "
                "-46.8500 -23.3450, "
                "-46.9200 -23.3450, "
                "-46.9200 -23.3950"
                ")))"
            )

            b_polvilho = Bairro(nome_bairro="Polvilho", municipio="Cajamar", geometria=polvilho_wkt)
            b_jordanesia = Bairro(nome_bairro="Jordanesia", municipio="Cajamar", geometria=jordanesia_wkt)
            b_anhanguera = Bairro(nome_bairro="Anhanguera", municipio="Cajamar", geometria=anhanguera_wkt)

            db.add_all([b_polvilho, b_jordanesia, b_anhanguera])
            db.commit()

            db.refresh(b_polvilho)
            db.refresh(b_jordanesia)
            db.refresh(b_anhanguera)

            # Estações da apostila (EA01, EJ01, EP01)
            e_anhanguera = Estacao(
                nome_estacao="Estação Anhanguera 01",
                codigo_estacao="EA01",
                id_bairro=b_anhanguera.id_bairro,
                latitude=-23.3560,
                longitude=-46.8760,
                localizacao="POINT(-46.8760 -23.3560)",
                ativa=True
            )
            e_jordanesia = Estacao(
                nome_estacao="Estação Jordanésia 01",
                codigo_estacao="EJ01",
                id_bairro=b_jordanesia.id_bairro,
                latitude=-23.3300,
                longitude=-46.8650,
                localizacao="POINT(-46.8650 -23.3300)",
                ativa=True
            )
            e_polvilho = Estacao(
                nome_estacao="Estação Polvilho 01",
                codigo_estacao="EP01",
                id_bairro=b_polvilho.id_bairro,
                latitude=-23.4150,
                longitude=-46.8350,
                localizacao="POINT(-46.8350 -23.4150)",
                ativa=True
            )

            db.add_all([e_anhanguera, e_jordanesia, e_polvilho])
            db.commit()

            db.refresh(e_anhanguera)
            db.refresh(e_jordanesia)
            db.refresh(e_polvilho)

            # Medições de teste DADO_TESTE (conforme capítulo 13 da apostila)
            dt1 = datetime.datetime.fromisoformat("2026-10-25T08:00:00-03:00").astimezone(datetime.timezone.utc).replace(tzinfo=None)
            dt2 = datetime.datetime.fromisoformat("2026-10-25T09:00:00-03:00").astimezone(datetime.timezone.utc).replace(tzinfo=None)

            medicoes = [
                MedicaoChuva(id_estacao=e_anhanguera.id_estacao, data_hora=dt1, precipitacao_mm=12.5, fonte_dado="DADO_TESTE"),
                MedicaoChuva(id_estacao=e_anhanguera.id_estacao, data_hora=dt2, precipitacao_mm=18.0, fonte_dado="DADO_TESTE"),
                MedicaoChuva(id_estacao=e_jordanesia.id_estacao, data_hora=dt1, precipitacao_mm=5.0, fonte_dado="DADO_TESTE"),
                MedicaoChuva(id_estacao=e_jordanesia.id_estacao, data_hora=dt2, precipitacao_mm=22.0, fonte_dado="DADO_TESTE"),
                MedicaoChuva(id_estacao=e_polvilho.id_estacao, data_hora=dt1, precipitacao_mm=8.5, fonte_dado="DADO_TESTE"),
                MedicaoChuva(id_estacao=e_polvilho.id_estacao, data_hora=dt2, precipitacao_mm=15.0, fonte_dado="DADO_TESTE"),
            ]
            db.add_all(medicoes)
            db.commit()
            logger.info("Dados iniciais da apostila carregados com sucesso!")

    except Exception as e:
        logger.error("Falha ao inicializar banco local.")
        db.rollback()
        raise RuntimeError("Falha ao inicializar banco local") from None
    finally:
        db.close()
