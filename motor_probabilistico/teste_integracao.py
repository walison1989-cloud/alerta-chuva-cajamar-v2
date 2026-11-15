import pytest
from pathlib import Path
pytestmark = pytest.mark.skipif(not (Path(__file__).resolve().parents[1]/"data/processed/mde_cajamar_recortado.tif").exists(), reason="Rasters locais opcionais não instalados; consulte docs/DADOS.md")
#!/usr/bin/env python3
"""Teste de integração do Motor Probabilístico 2.0 com o serviço de terreno.

Executa o fluxo completo:
  ponto (lat/lon) → terreno → Motor 2.0 → resultado

Não modifica o Supabase. Não treina modelos. Não usa dados fictícios para treinamento.
"""

import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from integracao_etapa5_2 import (
    avaliar_ponto,
    construir_entrada_motor_2_0,
    resultado_para_dict,
)
from modelo_2_0 import (
    EntradaMotor2_0,
    executar_motor_2_0,
    avaliar_qualidade_dados,
    calcular_fatores,
    MODELO_VERSAO,
    HORIZONTE_HORAS,
)


class TestIntegracaoMotor2_0(unittest.TestCase):
    """Testes de integração do Motor 2.0 com terreno."""

    def test_avaliar_ponto_com_todos_dados(self):
        """Ponto com chuva, previsão, suscetibilidade e topografia válidos."""
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
        self.assertIsNotNone(resulto := resultado)
        self.assertEqual(resulto.versao_modelo, MODELO_VERSAO)
        self.assertEqual(resulto.horizonte_horas, HORIZONTE_HORAS)
        self.assertIsNone(resulto.percentual)  # não calibrado
        self.assertIn(resulto.qualidade_dados, ["boa", "limitada"])
        self.assertGreater(len(resulto.fatores_utilizados), 0)
        self.assertIsInstance(resulto.data_calculo, datetime)
        self.assertIn("não é probabilidade de alagamento", resultado.mensagem.lower())

    def test_avaliar_ponto_sem_chuva_mas_com_topografia(self):
        """Ponto dentro da cobertura topográfica mas sem chuva → limitada."""
        resultado = avaliar_ponto(
            latitude=-23.3561,
            longitude=-46.8769,
        )
        self.assertIsNone(resultado.percentual)
        # O ponto central está dentro da cobertura do MDT → topografia válida
        # Sem chuva, qualidade é "limitada" (apenas topografia)
        self.assertEqual(resultado.qualidade_dados, "limitada")
        self.assertGreaterEqual(len(resultado.fatores_utilizados), 3)  # altitude, declividade, elev_relativa

    def test_avaliar_ponto_fora_cobertura_sem_chuva(self):
        """Ponto fora da cobertura topográfica e sem chuva → sem_dados."""
        # Coordenadas claramente fora de Cajamar (~30km ao sul)
        resultado = avaliar_ponto(
            latitude=-23.6000,
            longitude=-47.0000,
        )
        self.assertIsNone(resultado.percentual)
        self.assertEqual(resultado.qualidade_dados, "sem_dados")
        self.assertEqual(len(resultado.fatores_utilizados), 0)

    def test_avaliar_ponto_fora_cobertura_com_chuva(self):
        """Ponto fora da cobertura mas com chuva → limitada (chuva válida)."""
        resultado = avaliar_ponto(
            latitude=-23.6000,
            longitude=-47.0000,
            chuva_observada_24h_mm=25.0,
        )
        self.assertIsNone(resultado.percentual)
        self.assertEqual(resultado.qualidade_dados, "limitada")
        self.assertGreaterEqual(len(resultado.fatores_utilizados), 1)  # chuva observada

    def test_construir_entrada_motor_2_0(self):
        """Construir entrada com todos os campos."""
        entrada = construir_entrada_motor_2_0(
            latitude=-23.3561,
            longitude=-46.8769,
            chuva_observada_24h_mm=25.0,
            chuva_prevista_24h_mm=30.0,
            suscetibilidade_tipo="inundacao",
            suscetibilidade_classe="Alta",
            suscetibilidade_contem_ponto=True,
            suscetibilidade_distancia_m=0.0,
        )
        self.assertEqual(entrada.latitude, -23.3561)
        self.assertEqual(entrada.longitude, -46.8769)
        self.assertEqual(entrada.chuva_observada_24h_mm, 25.0)
        self.assertEqual(entrada.chuva_prevista_24h_mm, 30.0)
        self.assertEqual(entrada.suscetibilidade_tipo, "inundacao")
        self.assertEqual(entrada.suscetibilidade_classe, "Alta")
        self.assertTrue(entrada.suscetibilidade_contem_ponto)
        self.assertEqual(entrada.suscetibilidade_distancia_m, 0.0)

    def test_executar_motor_2_0_nao_inventa_percentual(self):
        """Motor 2.0 nunca retorna percentual sem calibração."""
        entrada = EntradaMotor2_0(
            latitude=-23.3561,
            longitude=-46.8769,
            chuva_observada_24h_mm=100.0,  # chuva muito alta
            suscetibilidade_tipo="inundacao",
            suscetibilidade_classe="Alta",
            altitude_m=700.0,
            declividade_graus=5.0,
            elevacao_relativa_m=10.0,
            qualidade_topografica="boa",
        )
        resultado = executar_motor_2_0(entrada)
        self.assertIsNone(resultado.percentual)
        self.assertEqual(resultado.versao_modelo, MODELO_VERSAO)
        self.assertEqual(resultado.horizonte_horas, HORIZONTE_HORAS)

    def test_resultado_para_dict(self):
        """Conversão para dicionário para a interface."""
        resultado = avaliar_ponto(
            latitude=-23.3561,
            longitude=-46.8769,
            chuva_observada_24h_mm=25.0,
        )
        d = resultado_para_dict(resultado)
        self.assertIn("versao_modelo", d)
        self.assertIn("data_calculo", d)
        self.assertIn("horizonte_horas", d)
        self.assertIn("percentual", d)
        self.assertIn("qualidade_dados", d)
        self.assertIn("fatores_utilizados", d)
        self.assertIn("nivel_risco", d)
        self.assertIn("mensagem", d)
        self.assertIn("fonte", d)
        self.assertIn("eh_calibrado", d)
        self.assertIn("tem_dados_suficientes", d)
        self.assertFalse(d["eh_calibrado"])  # não calibrado

    def test_avaliar_qualidade_dados(self):
        """Avaliação de qualidade dos dados."""
        # Boa: tudo válido
        e_boa = EntradaMotor2_0(
            latitude=-23.3561, longitude=-46.8769,
            chuva_observada_24h_mm=25.0,
            chuva_prevista_24h_mm=30.0,
            suscetibilidade_tipo="inundacao",
            suscetibilidade_classe="Alta",
            qualidade_topografica="boa",
            altitude_m=750, declividade_graus=5, elevacao_relativa_m=0,
        )
        self.assertEqual(avaliar_qualidade_dados(e_boa), "boa")

        # Limitada: só chuva
        e_limitada = EntradaMotor2_0(
            latitude=-23.3561, longitude=-46.8769,
            chuva_observada_24h_mm=25.0,
            qualidade_topografica="fora_cobertura",
        )
        self.assertEqual(avaliar_qualidade_dados(e_limitada), "limitada")

        # Sem dados: nada
        e_sem = EntradaMotor2_0(latitude=-23.3561, longitude=-46.8769)
        self.assertEqual(avaliar_qualidade_dados(e_sem), "sem_dados")

    def test_calcular_fatores(self):
        """Listagem de fatores utilizados."""
        entrada = EntradaMotor2_0(
            latitude=-23.3561,
            longitude=-46.8769,
            chuva_observada_24h_mm=25.5,
            chuva_prevista_24h_mm=30.0,
            suscetibilidade_tipo="inundacao",
            suscetibilidade_classe="Alta",
            suscetibilidade_contem_ponto=True,
            suscetibilidade_distancia_m=0.0,
            altitude_m=700.0,
            declividade_graus=5.0,
            elevacao_relativa_m=10.0,
            qualidade_topografica="boa",
        )
        fatores = calcular_fatores(entrada)
        self.assertGreater(len(fatores), 0)
        self.assertTrue(any("chuva_observada_24h_mm" in f for f in fatores))
        self.assertTrue(any("suscetibilidade_tipo" in f for f in fatores))
        self.assertTrue(any("altitude_m" in f for f in fatores))


if __name__ == "__main__":
    unittest.main()
