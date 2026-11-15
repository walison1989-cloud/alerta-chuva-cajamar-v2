from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal
from typing import Optional, List, Dict, Any

class ContatoMoradorCreate(BaseModel):
    nome: str = Field(..., min_length=2, max_length=150, description="Nome completo do morador")
    telefone: Optional[str] = Field(None, max_length=20, description="Telefone / WhatsApp com DDD")
    email: Optional[str] = Field(None, max_length=150, description="Email de contato")
    endereco: Optional[str] = Field(None, max_length=255, description="Logradouro / Rua / Avenida")
    numero: Optional[str] = Field(None, max_length=30, description="Número predial")
    complemento: Optional[str] = Field(None, max_length=100, description="Complemento")
    cep: Optional[str] = Field(None, max_length=10, description="CEP")
    consentimento: bool = Field(False, description="Consentimento explícito LGPD para envio de avisos")
    latitude: Optional[float] = Field(None, ge=-90, le=90, allow_inf_nan=False, description="Latitude detectada ou informada")
    longitude: Optional[float] = Field(None, ge=-180, le=180, allow_inf_nan=False, description="Longitude detectada ou informada")
    id_bairro: Optional[int] = Field(None, description="ID do bairro (se já identificado)")

    @field_validator("consentimento")
    def validar_consentimento_com_contato(cls, v, values):
        return v

    @model_validator(mode="after")
    def validar_ao_menos_um_contato(self):
        if not (self.telefone or "").strip() and not (self.email or "").strip():
            raise ValueError("É obrigatório informar ao menos um meio de contato (telefone ou email).")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Informe latitude e longitude juntas.")
        return self

class GeocodeRequest(BaseModel):
    endereco: str
    cep: Optional[str] = None
    numero: Optional[str] = None

class GeocodeReverseRequest(BaseModel):
    latitude: float
    longitude: float

class SimulacaoRequest(BaseModel):
    id_bairro: int
    cenario_id: Optional[str] = None
    precipitacao_custom_mm: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    acumulado_custom_mm: Optional[float] = Field(None, ge=0, allow_inf_nan=False)

class ConfiguracaoLimiares(BaseModel):
    THRESHOLD_ATENCAO_MM_H: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    THRESHOLD_ALERTA_MM_H: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    THRESHOLD_CRITICO_MM_H: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    THRESHOLD_ATENCAO_24H_MM: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    THRESHOLD_ALERTA_24H_MM: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    THRESHOLD_CRITICO_24H_MM: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    ALERT_CALCULATION_MODE: Optional[Literal["INTERVALO_SOMA", "ACUMULADO_DIFERENCA"]] = None # 'INTERVALO_SOMA' ou 'ACUMULADO_DIFERENCA'


class AvaliacaoTerrenoRequest(BaseModel):
    latitude: float = Field(ge=-90,le=90,allow_inf_nan=False)
    longitude: float = Field(ge=-180,le=180,allow_inf_nan=False)
    chuva_observada_24h_mm: Optional[float] = Field(None,ge=0,allow_inf_nan=False)
    chuva_prevista_24h_mm: Optional[float] = Field(None,ge=0,allow_inf_nan=False)
