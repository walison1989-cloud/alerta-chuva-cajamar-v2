#!/usr/bin/env python3
"""
Integração do serviço de terreno com as evidências da Etapa 5.2.

Reutiliza backend/altitude_service.py e backend/terreno_service.py
para consulta de altitude, declividade e elevação relativa.

Não altera o motor experimental 1.0.0 (exp-2026.11-v1).
Cria uma camada separada e versionada para o motor probabilístico 2.0.

Fluxo:
  Endereço do morador
  → localização (latitude/longitude)
  → chuva observada (CEMADEN, acumulado 24h)
  → previsão (Open-Meteo, próxima 24h)
  → suscetibilidade SGB/IPT (inundação/enxurrada)
  → características topográficas (MDT 5 m)
  → Motor 2.0
  → ResultadoProbabilistico
"""

import sys
import os
from typing import Optional

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BACKEND_DIR = os.path.join(_PROJECT_ROOT, "backend")
sys.path.insert(0, _PROJECT_ROOT)
sys.path.insert(0, _BACKEND_DIR)
from terreno_service import consultar_terreno, area_eh_topograficamente_baixa
from motor_probabilistico.modelo_2_0 import (
    EntradaMotor2_0,
    ResultadoProbabilistico,
    executar_motor_2_0,
    MODELO_VERSAO,
    HORIZONTE_HORAS,
)


def construir_entrada_motor_2_0(
    latitude: float,
    longitude: float,
    chuva_observada_24h_mm: Optional[float] = None,
    chuva_prevista_24h_mm: Optional[float] = None,
    suscetibilidade_tipo: Optional[str] = None,
    suscetibilidade_classe: Optional[str] = None,
    suscetibilidade_contem_ponto: Optional[bool] = None,
    suscetibilidade_distancia_m: Optional[float] = None,
    fonte_chuva: str = "CEMADEN (acumulado_24h)",
    fonte_previsao: str = "Open-Meteo (previsão 24h)",
    fonte_suscetibilidade: str = "SGB/CPRM e IPT (2017), escala 1:25.000",
) -> EntradaMotor2_0:
    """Constrói a entrada do Motor 2.0 a partir de dados de entrada e terreno.

    Consulta o serviço de terreno para obter altitude, declividade e
    elevação relativa do ponto (latitude, longitude) em WGS84.
    """
    EntradaMotor2_0(latitude=latitude, longitude=longitude)
    try:
        terreno = consultar_terreno(latitude, longitude)
    except (FileNotFoundError, OSError):
        terreno = {"qualidade_dados":"sem_dados","fonte":"MDT local indisponível"}

    return EntradaMotor2_0(
        latitude=latitude,
        longitude=longitude,
        chuva_observada_24h_mm=chuva_observada_24h_mm,
        chuva_prevista_24h_mm=chuva_prevista_24h_mm,
        suscetibilidade_tipo=suscetibilidade_tipo,
        suscetibilidade_classe=suscetibilidade_classe,
        suscetibilidade_contem_ponto=suscetibilidade_contem_ponto,
        suscetibilidade_distancia_m=suscetibilidade_distancia_m,
        altitude_m=terreno.get("altitude_m"),
        declividade_graus=terreno.get("declividade_graus"),
        elevacao_relativa_m=terreno.get("elevacao_relativa_m"),
        qualidade_topografica=terreno.get("qualidade_dados", "fora_cobertura"),
        fonte_chuva=fonte_chuva,
        fonte_previsao=fonte_previsao,
        fonte_suscetibilidade=fonte_suscetibilidade,
        fonte_topografia=terreno.get("fonte", ""),
    )


def avaliar_ponto(
    latitude: float,
    longitude: float,
    chuva_observada_24h_mm: Optional[float] = None,
    chuva_prevista_24h_mm: Optional[float] = None,
    suscetibilidade_tipo: Optional[str] = None,
    suscetibilidade_classe: Optional[str] = None,
    suscetibilidade_contem_ponto: Optional[bool] = None,
    suscetibilidade_distancia_m: Optional[float] = None,
) -> ResultadoProbabilistico:
    """Avalia um ponto (latitude, longitude) com o Motor Probabilístico 2.0.

    Reutiliza o serviço de terreno para características topográficas.
    Retorna ResultadoProbabilistico com percentual NULL se não calibrado.
    """
    entrada = construir_entrada_motor_2_0(
        latitude=latitude,
        longitude=longitude,
        chuva_observada_24h_mm=chuva_observada_24h_mm,
        chuva_prevista_24h_mm=chuva_prevista_24h_mm,
        suscetibilidade_tipo=suscetibilidade_tipo,
        suscetibilidade_classe=suscetibilidade_classe,
        suscetibilidade_contem_ponto=suscetibilidade_contem_ponto,
        suscetibilidade_distancia_m=suscetibilidade_distancia_m,
    )
    return executar_motor_2_0(entrada)


def resultado_para_dict(resultado: ResultadoProbabilistico) -> dict:
    """Converte ResultadoProbabilistico em dicionário para exibição na interface."""
    return {
        "versao_modelo": resultado.versao_modelo,
        "data_calculo": resultado.data_calculo.isoformat(),
        "horizonte_horas": resultado.horizonte_horas,
        "percentual": resultado.percentual,  # NULL se não calibrado
        "qualidade_dados": resultado.qualidade_dados,
        "fatores_utilizados": resultado.fatores_utilizados,
        "nivel_risco": resultado.nivel_risco,
        "mensagem": resultado.mensagem,
        "fonte": resultado.fonte,
        "eh_calibrado": resultado.eh_calibrado(),
        "tem_dados_suficientes": resultado.tem_dados_suficientes(),
    }


def avaliar_cruzamento_ponto(latitude, longitude, medicoes, previsao, cartografia, *, decisao_em):
    """Integra MDT local e cruzamento espacial com proveniência explícita.

    Não chama APIs, não grava avaliação e não habilita a página experimental.
    """
    from motor_probabilistico.cruzamento_espacial import avaliar_cruzamento
    from motor_probabilistico.dados_estruturados import VariavelTopografica
    EntradaMotor2_0(latitude=latitude, longitude=longitude)
    try:
        data = consultar_terreno(latitude, longitude)
        terrain = VariavelTopografica(latitude,longitude,data.get('altitude_m'),
            data.get('declividade_graus'),data.get('elevacao_relativa_m'),
            data.get('qualidade_dados','sem_dados'),data.get('fonte',''))
    except (FileNotFoundError, OSError):
        terrain = None
    return avaliar_cruzamento(latitude,longitude,medicoes,previsao,terrain,cartografia,decisao_em=decisao_em)


if __name__ == "__main__":
    # Teste rápido de integração
    resultado = avaliar_ponto(
        latitude=-23.3561,
        longitude=-46.8769,
        chuva_observada_24h_mm=25.0,
        chuva_prevista_24h_mm=30.0,
        suscetibilidade_tipo="inundacao",
        suscetibilidade_classe="Alta",
        suscetibilidade_contem_ponto=True,
        suscetibilidade_distancia_m=0.0,
    )
    print(resultado_para_dict(resultado))
