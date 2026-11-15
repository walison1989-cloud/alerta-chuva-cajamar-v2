#!/usr/bin/env python3
"""
Motor Probabilístico de Alagamento 2.0 — camada local de preparação.

Este módulo define a estrutura do modelo 2.0, versionada e separada
do motor experimental 1.0.0 (Etapa 5.2). Não treina com dados fictícios.
Não gera probabilidades calibradas sem dados reais de eventos históricos.

Entradas:
  - localização do imóvel (latitude/longitude, WGS84)
  - chuva observada (CEMADEN, acumulado 24h)
  - previsão meteorológica (Open-Meteo, próxima 24h)
  - suscetibilidade SGB/IPT (áreas de inundação/enxurrada)
  - características topográficas (MDT 5 m: altitude, declividade, elevação relativa)

Saída:
  - ResultadoProbabilistico com percentual (NULL se não calibrado),
    horizonte de 24h, data do cálculo, qualidade dos dados,
    versão do modelo e fatores utilizados.
"""

from dataclasses import dataclass, field
import math
from datetime import datetime, timezone
from typing import Optional


MODELO_VERSAO = "2.0.0-preparacao"
HORIZONTE_HORAS = 24


@dataclass
class EntradaMotor2_0:
    """Dados de entrada para o Motor Probabilístico 2.0."""

    latitude: float
    longitude: float
    chuva_observada_24h_mm: Optional[float] = None
    chuva_prevista_24h_mm: Optional[float] = None
    suscetibilidade_tipo: Optional[str] = None  # 'inundacao' | 'enxurrada'
    suscetibilidade_classe: Optional[str] = None  # 'Alta' | 'Media' | 'Baixa' | 'Enxurrada'
    suscetibilidade_contem_ponto: Optional[bool] = None
    suscetibilidade_distancia_m: Optional[float] = None
    altitude_m: Optional[float] = None
    declividade_graus: Optional[float] = None
    elevacao_relativa_m: Optional[float] = None
    qualidade_topografica: str = "fora_cobertura"
    fonte_chuva: str = ""
    fonte_previsao: str = ""
    fonte_suscetibilidade: str = "SGB/CPRM e IPT (2017), escala 1:25.000"
    fonte_topografia: str = "MDT Cajamar (SGB/CPRM+IPT, 2017) - recorte 5 m"


    def __post_init__(self):
        for name in ("latitude", "longitude", "chuva_observada_24h_mm",
                     "chuva_prevista_24h_mm", "suscetibilidade_distancia_m",
                     "altitude_m", "declividade_graus", "elevacao_relativa_m"):
            value = getattr(self, name)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
                raise ValueError(f"{name} deve ser um número finito")
        if self.latitude is None or self.longitude is None:
            raise ValueError("Coordenadas são obrigatórias")
        if not (-90 <= self.latitude <= 90 and -180 <= self.longitude <= 180):
            raise ValueError("Coordenadas fora da faixa válida")
        for name in ("chuva_observada_24h_mm", "chuva_prevista_24h_mm", "suscetibilidade_distancia_m"):
            value = getattr(self, name)
            if value is not None and value < 0:
                raise ValueError(f"{name} não pode ser negativo")
        if self.declividade_graus is not None and not 0 <= self.declividade_graus <= 90:
            raise ValueError("Declividade deve estar entre 0 e 90 graus")


@dataclass
class ResultadoProbabilistico:
    """Resultado do Motor Probabilístico 2.0.

    percentual é NULL quando não há modelo calibrado (ausência de dados
    reais de eventos históricos). Não inventa porcentagens.
    """

    versao_modelo: str
    data_calculo: datetime
    horizonte_horas: int
    percentual: Optional[float] = None  # NULL sem calibração
    qualidade_dados: str = "sem_dados"
    fatores_utilizados: list[str] = field(default_factory=list)
    nivel_risco: str = "dados_insuficientes"  # sem interpretação de probabilidade
    mensagem: str = ""
    fonte: str = "Motor Probabilístico de Alagamento 2.0 — preparação"

    def eh_calibrado(self) -> bool:
        return self.percentual is not None

    def tem_dados_suficientes(self) -> bool:
        return self.qualidade_dados in ("boa", "limitada")


def avaliar_qualidade_dados(entrada: EntradaMotor2_0) -> str:
    """Avalia a qualidade dos dados de entrada.

    Regras:
      - 'boa': chuva observada + previsão + suscetibilidade + topografia válidos
      - 'limitada': alguma chuva, suscetibilidade ou topografia disponível
      - 'sem_dados': nenhum dado útil disponível
    """
    tem_chuva = (
        entrada.chuva_observada_24h_mm is not None
        or entrada.chuva_prevista_24h_mm is not None
    )
    tem_suscetibilidade = (
        entrada.suscetibilidade_tipo is not None
        or entrada.suscetibilidade_classe is not None
    )
    tem_topografia = entrada.qualidade_topografica in ("boa", "limitada") and entrada.altitude_m is not None

    if (entrada.chuva_observada_24h_mm is not None and entrada.chuva_prevista_24h_mm is not None
        and tem_suscetibilidade and tem_topografia and entrada.declividade_graus is not None
        and entrada.elevacao_relativa_m is not None):
        return "boa"
    if tem_chuva or tem_suscetibilidade or tem_topografia:
        return "limitada"
    return "sem_dados"


def calcular_fatores(entrada: EntradaMotor2_0) -> list[str]:
    """Lista os fatores utilizados na avaliação (descritivos, não probabilísticos)."""
    fatores: list[str] = []

    if entrada.chuva_observada_24h_mm is not None:
        fatores.append(
            f"chuva_observada_24h_mm={entrada.chuva_observada_24h_mm:.2f}"
        )
    if entrada.chuva_prevista_24h_mm is not None:
        fatores.append(
            f"chuva_prevista_24h_mm={entrada.chuva_prevista_24h_mm:.2f}"
        )
    if entrada.suscetibilidade_tipo:
        fatores.append(f"suscetibilidade_tipo={entrada.suscetibilidade_tipo}")
    if entrada.suscetibilidade_classe:
        fatores.append(f"suscetibilidade_classe={entrada.suscetibilidade_classe}")
    if entrada.suscetibilidade_contem_ponto is not None:
        fatores.append(
            f"suscetibilidade_contem_ponto={entrada.suscetibilidade_contem_ponto}"
        )
    if entrada.suscetibilidade_distancia_m is not None:
        fatores.append(
            f"suscetibilidade_distancia_m={entrada.suscetibilidade_distancia_m:.1f}"
        )
    if entrada.altitude_m is not None:
        fatores.append(f"altitude_m={entrada.altitude_m:.2f}")
    if entrada.declividade_graus is not None:
        fatores.append(f"declividade_graus={entrada.declividade_graus:.2f}")
    if entrada.elevacao_relativa_m is not None:
        fatores.append(f"elevacao_relativa_m={entrada.elevacao_relativa_m:.2f}")

    return fatores


def executar_motor_2_0(entrada: EntradaMotor2_0) -> ResultadoProbabilistico:
    """Executa o Motor Probabilístico 2.0.

    SEM MODELO CALIBRADO: percentual = NULL.
    Não usa dados fictícios. Não atribui probabilidades arbitrárias.
    """
    qualidade = avaliar_qualidade_dados(entrada)
    fatores = calcular_fatores(entrada)

    # Sem calibração: percentual sempre NULL
    percentual: Optional[float] = None

    if qualidade == "sem_dados":
        nivel_risco = "dados_insuficientes"
        mensagem = (
            "Não há dados suficientes para avaliação. "
            "Consulte a Defesa Civil (199) em emergência."
        )
    elif qualidade == "limitada":
        nivel_risco = "atencao_experimental"
        mensagem = (
            "Avaliação parcial com dados limitados. "
            "Não é probabilidade de alagamento. Não é alerta oficial."
        )
    else:
        nivel_risco = "atencao_experimental"
        mensagem = (
            "Avaliação experimental com dados disponíveis. "
            "Não é probabilidade de alagamento. Não é alerta oficial."
        )

    return ResultadoProbabilistico(
        versao_modelo=MODELO_VERSAO,
        data_calculo=datetime.now(timezone.utc),
        horizonte_horas=HORIZONTE_HORAS,
        percentual=percentual,
        qualidade_dados=qualidade,
        fatores_utilizados=fatores,
        nivel_risco=nivel_risco,
        mensagem=mensagem,
    )
