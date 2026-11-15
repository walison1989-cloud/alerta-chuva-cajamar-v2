import datetime

def utc_naive():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

from sqlalchemy import (
    Column, Integer, BigInteger, String, Float, Boolean,
    DateTime, ForeignKey, Text, UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Bairro(Base):
    __tablename__ = "bairros"

    id_bairro = Column(Integer, primary_key=True, autoincrement=True)
    nome_bairro = Column(String(100), nullable=False)
    municipio = Column(String(100), nullable=False)
    geometria = Column(Text, nullable=True) # WKT MULTIPOLYGON / POLYGON (compatível com PostGIS e Shapely)

    __table_args__ = (
        UniqueConstraint("nome_bairro", "municipio", name="uq_bairro_municipio"),
    )

    estacoes = relationship("Estacao", back_populates="bairro", cascade="all, delete-orphan")
    alertas = relationship("Alerta", back_populates="bairro", cascade="all, delete-orphan")
    contatos = relationship("ContatoAlerta", back_populates="bairro")

    def to_dict(self):
        return {
            "id_bairro": self.id_bairro,
            "nome_bairro": self.nome_bairro,
            "municipio": self.municipio,
            "geometria": self.geometria
        }


class Estacao(Base):
    __tablename__ = "estacoes"

    id_estacao = Column(Integer, primary_key=True, autoincrement=True)
    nome_estacao = Column(String(150), nullable=False)
    codigo_estacao = Column(String(50), unique=True, nullable=False)
    id_bairro = Column(Integer, ForeignKey("bairros.id_bairro"), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    localizacao = Column(Text, nullable=True) # WKT POINT(longitude latitude)
    ativa = Column(Boolean, default=True, nullable=False)
    data_cadastro = Column(DateTime, default=utc_naive, nullable=False)

    __table_args__ = (
        CheckConstraint("latitude IS NULL OR (latitude BETWEEN -90 AND 90)", name="chk_latitude"),
        CheckConstraint("longitude IS NULL OR (longitude BETWEEN -180 AND 180)", name="chk_longitude"),
    )

    bairro = relationship("Bairro", back_populates="estacoes")
    medicoes = relationship("MedicaoChuva", back_populates="estacao", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id_estacao": self.id_estacao,
            "nome_estacao": self.nome_estacao,
            "codigo_estacao": self.codigo_estacao,
            "id_bairro": self.id_bairro,
            "nome_bairro": self.bairro.nome_bairro if self.bairro else None,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "localizacao": self.localizacao,
            "ativa": self.ativa,
            "data_cadastro": self.data_cadastro.isoformat() if self.data_cadastro else None
        }


class MedicaoChuva(Base):
    __tablename__ = "medicoes_chuva"

    id_medicao = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    id_estacao = Column(Integer, ForeignKey("estacoes.id_estacao"), nullable=False)
    data_hora = Column(DateTime, nullable=False)
    precipitacao_mm = Column(Float, nullable=False)
    fonte_dado = Column(String(100), nullable=True) # 'DADO_TESTE', 'OPEN_METEO_OBSERVED', 'OPEN_METEO_FORECAST', 'SIMULACAO_CHUVA_INTENSA'
    data_registro = Column(DateTime, default=utc_naive, nullable=False)

    __table_args__ = (
        CheckConstraint("precipitacao_mm >= 0", name="chk_precipitacao_positiva"),
        UniqueConstraint("id_estacao", "data_hora", name="uq_estacao_data_hora"),
    )

    estacao = relationship("Estacao", back_populates="medicoes")

    def to_dict(self):
        return {
            "id_medicao": self.id_medicao,
            "id_estacao": self.id_estacao,
            "data_hora": self.data_hora.isoformat() if self.data_hora else None,
            "precipitacao_mm": float(self.precipitacao_mm),
            "fonte_dado": self.fonte_dado,
            "data_registro": self.data_registro.isoformat() if self.data_registro else None
        }


class Alerta(Base):
    __tablename__ = "alertas"

    id_alerta = Column(Integer, primary_key=True, autoincrement=True)
    id_bairro = Column(Integer, ForeignKey("bairros.id_bairro"), nullable=False)
    nivel = Column(String(20), nullable=False) # 'ATENCAO', 'ALERTA', 'CRITICO'
    mensagem = Column(Text, nullable=True)
    data_emissao = Column(DateTime, default=utc_naive, nullable=False)
    status = Column(String(20), default="EMITIDO", nullable=False) # 'EMITIDO', 'CANCELADO', 'RESOLVIDO'

    __table_args__ = (
        CheckConstraint("nivel IN ('ATENCAO', 'ALERTA', 'CRITICO')", name="chk_alerta_nivel"),
        CheckConstraint("status IN ('EMITIDO', 'CANCELADO', 'RESOLVIDO')", name="chk_alerta_status"),
    )

    origem = Column(String(40), nullable=False, default="EXPERIMENTAL")
    execucao_simulacao = Column(String(36), nullable=True, index=True)
    bairro = relationship("Bairro", back_populates="alertas")

    def to_dict(self):
        return {
            "id_alerta": self.id_alerta,
            "id_bairro": self.id_bairro,
            "nome_bairro": self.bairro.nome_bairro if self.bairro else None,
            "nivel": self.nivel,
            "mensagem": self.mensagem,
            "data_emissao": self.data_emissao.isoformat() if self.data_emissao else None,
            "status": self.status,
            "origem": self.origem,
            "execucao_simulacao": self.execucao_simulacao
        }


class ConfiguracaoMotor(Base):
    __tablename__ = "configuracao_motor"
    id = Column(Integer, primary_key=True)
    parametros = Column(Text, nullable=False)

class ContatoAlerta(Base):
    """
    Tabela contatos_alerta original da apostila, preservando colunas
    e complementada com campos de moradores (endereço, CEP, coordenadas).
    """
    __tablename__ = "contatos_alerta"

    id_contato = Column(Integer, primary_key=True, autoincrement=True)
    id_bairro = Column(Integer, ForeignKey("bairros.id_bairro"), nullable=True)
    nome = Column(String(150), nullable=False)
    telefone = Column(String(20), nullable=True)
    email = Column(String(150), nullable=True)
    ativo = Column(Boolean, default=True, nullable=False)
    consentimento = Column(Boolean, default=False, nullable=False) # Obrigatório pela LGPD
    data_cadastro = Column(DateTime, default=utc_naive, nullable=False)

    # Colunas complementares da migração de moradores:
    endereco = Column(String(255), nullable=True)
    numero = Column(String(30), nullable=True)
    complemento = Column(String(100), nullable=True)
    cep = Column(String(10), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    bairro_detectado = Column(String(100), nullable=True)

    __table_args__ = (
        CheckConstraint("telefone IS NOT NULL OR email IS NOT NULL", name="chk_contato_identificador"),
    )

    bairro = relationship("Bairro", back_populates="contatos")

    def to_dict(self):
        return {
            "id_contato": self.id_contato,
            "id_bairro": self.id_bairro,
            "nome_bairro": self.bairro.nome_bairro if self.bairro else self.bairro_detectado,
            "nome": self.nome,
            "telefone": self.telefone,
            "email": self.email,
            "ativo": self.ativo,
            "consentimento": self.consentimento,
            "endereco": self.endereco,
            "numero": self.numero,
            "complemento": self.complemento,
            "cep": self.cep,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "bairro_detectado": self.bairro_detectado,
            "data_cadastro": self.data_cadastro.isoformat() if self.data_cadastro else None
        }
