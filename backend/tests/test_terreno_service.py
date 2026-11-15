import pytest
from pathlib import Path
pytestmark = pytest.mark.skipif(not (Path(__file__).resolve().parents[2]/"data/processed/mde_cajamar_recortado.tif").exists(), reason="Rasters locais opcionais não instalados; consulte docs/DADOS.md")
#!/usr/bin/env python3
"""Testes automatizados para o serviço de variáveis topográficas (terreno_service).

Verifica resultados numéricos, limites geográficos e tratamento de NoData.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from terreno_service import (
    consultar_terreno,
    consultar_terreno_lote,
    area_eh_topograficamente_baixa,
)

# Coordenadas conhecidas dentro do município de Cajamar (WGS84)
PONTO_CENTRO = (-23.3561, -46.8769)
PONTO_ANHANGUERA = (-23.3560, -46.8760)  # perto estação Anhanguera
PONTO_JORDANESIA = (-23.3300, -46.8650)  # perto estação Jordanésia
PONTO_POLVILHO = (-23.4150, -46.8350)    # perto estação Polvilho

# Coordenadas claramente fora do município (WGS84)
PONTO_FORA_SUL = (-23.6000, -47.0000)
PONTO_FORA_NORTE = (-23.1000, -46.6000)

# Limites conhecidos do MDT (altitude em metros)
ALTITUDE_MIN_ESPERADA = 685.0
ALTITUDE_MAX_ESPERADA = 1079.5
DECLIVIDADE_MAX_ESPERADA = 90.0
ELEV_REL_MIN_ESPERADA = -400.0  # não pode ser menor que -amplitude
ELEV_REL_MAX_ESPERADA = 400.0   # não pode ser maior que amplitude


class TestTerrenoService(unittest.TestCase):
    """Testes para consultar_terreno e funções relacionadas."""

    def test_ponto_valido_retorna_dicionario_completto(self):
        """Ponto dentro da cobertura deve retornar dicionário com todas as chaves."""
        resultado = consultar_terreno(*PONTO_CENTRO)
        self.assertIsInstance(resultado, dict)
        self.assertIn("altitude_m", resultado)
        self.assertIn("declividade_graus", resultado)
        self.assertIn("elevacao_relativa_m", resultado)
        self.assertIn("qualidade_dados", resultado)
        self.assertIn("fonte", resultado)

    def test_ponto_valido_altitude_dentro_faixa_realista(self):
        """Altitude deve estar entre o mínimo e máximo do MDT."""
        resultado = consultar_terreno(*PONTO_CENTRO)
        alt = resultado["altitude_m"]
        self.assertIsNotNone(alt)
        self.assertGreaterEqual(alt, ALTITUDE_MIN_ESPERADA)
        self.assertLessEqual(alt, ALTITUDE_MAX_ESPERADA)

    def test_ponto_valido_declividade_faixa_fisica(self):
        """Declividade deve ser não-negativa e menor que 90 graus."""
        resultado = consultar_terreno(*PONTO_CENTRO)
        dec = resultado["declividade_graus"]
        if dec is not None:
            self.assertGreaterEqual(dec, 0.0)
            self.assertLess(dec, DECLIVIDADE_MAX_ESPERADA)

    def test_ponto_valido_elevacao_relativa_dentro_amplitude(self):
        """Elevação relativa não pode exceder a amplitude do terreno (~394 m)."""
        resultado = consultar_terreno(*PONTO_CENTRO)
        er = resultado["elevacao_relativa_m"]
        if er is not None:
            self.assertGreaterEqual(er, ELEV_REL_MIN_ESPERADA)
            self.assertLessEqual(er, ELEV_REL_MAX_ESPERADA)

    def test_ponto_valido_qualidade_conhecida(self):
        """Qualidade deve ser um dos valores esperados."""
        resultado = consultar_terreno(*PONTO_CENTRO)
        self.assertIn(
            resultado["qualidade_dados"],
            ["boa", "limitada", "sem_dados", "fora_cobertura"],
        )

    def test_ponto_valido_fonte_preenchida(self):
        """Fonte deve ser string não vazia."""
        resultado = consultar_terreno(*PONTO_CENTRO)
        self.assertIsInstance(resultado["fonte"], str)
        self.assertGreater(len(resultado["fonte"]), 0)

    def test_ponto_fora_cobertura_retorna_none(self):
        """Ponto fora do município deve retornar qualidade fora_cobertura e valores None."""
        resultado = consultar_terreno(*PONTO_FORA_SUL)
        self.assertEqual(resultado["qualidade_dados"], "fora_cobertura")
        self.assertIsNone(resultado["altitude_m"])
        self.assertIsNone(resultado["declividade_graus"])
        self.assertIsNone(resultado["elevacao_relativa_m"])

    def test_ponto_fora_cobertura_norte(self):
        """Outro ponto fora do município."""
        resultado = consultar_terreno(*PONTO_FORA_NORTE)
        self.assertEqual(resultado["qualidade_dados"], "fora_cobertura")
        self.assertIsNone(resultado["altitude_m"])

    def test_lote_retorna_lista_correta_tamanho(self):
        """Consulta em lote deve retornar lista do mesmo tamanho."""
        pontos = [
            PONTO_CENTRO,
            PONTO_ANHANGUERA,
            PONTO_JORDANESIA,
            PONTO_POLVILHO,
            PONTO_FORA_SUL,
        ]
        resultados = consultar_terreno_lote(pontos)
        self.assertEqual(len(resultados), 5)

    def test_lote_todos_tem_qualidade_valida(self):
        """Todos os resultados de lote devem ter qualidade_dados preenchida."""
        pontos = [PONTO_CENTRO, PONTO_FORA_SUL]
        resultados = consultar_terreno_lote(pontos)
        for r in resultados:
            self.assertIn(r["qualidade_dados"], ["boa", "limitada", "sem_dados", "fora_cobertura"])

    def test_area_baixa_boleano_ou_none(self):
        """area_eh_topograficamente_baixa deve retornar bool ou None."""
        resultado = area_eh_topograficamente_baixa(*PONTO_CENTRO)
        self.assertIn(resultado, [True, False, None])

    def test_area_baixa_fora_retorna_none(self):
        """Ponto fora da cobertura deve retornar None para área baixa."""
        resultado = area_eh_topograficamente_baixa(*PONTO_FORA_SUL)
        self.assertIsNone(resultado)

    def test_coordenadas_em_metros_no_crs(self):
        """Verifica que o transformador usa coordenadas em metros (UTM 23S)."""
        from terreno_service import _carregar_transformador
        from altitude_service import _carregar_dataset as ds_alt
        trans = _carregar_transformador()
        ds = ds_alt()
        x, y = trans.transform(PONTO_CENTRO[1], PONTO_CENTRO[0])
        # UTM 23S: X na faixa ~300.000-315.000, Y na faixa ~7.400.000-7.425.000
        self.assertGreater(x, 200_000)
        self.assertLess(x, 500_000)
        self.assertGreater(y, 6_000_000)
        self.assertLess(y, 8_000_000)
        # Confere que estão dentro dos bounds do raster
        self.assertTrue(ds.bounds.left <= x <= ds.bounds.right)
        self.assertTrue(ds.bounds.bottom <= y <= ds.bounds.top)

    def test_todos_pontos_internos_tem_altitude_valida(self):
        """Pontos conhecidos dentro de Cajamar devem retornar altitude válida."""
        pontos_internos = [
            PONTO_CENTRO,
            PONTO_ANHANGUERA,
            PONTO_JORDANESIA,
            PONTO_POLVILHO,
        ]
        for lat, lon in pontos_internos:
            resultado = consultar_terreno(lat, lon)
            self.assertIsNotNone(resultado["altitude_m"],
                                 f"Ponto ({lat}, {lon}) retornou altitude None")
            self.assertGreaterEqual(resultado["altitude_m"], ALTITUDE_MIN_ESPERADA)
            self.assertLessEqual(resultado["altitude_m"], ALTITUDE_MAX_ESPERADA)

    def test_nao_treina_com_dados_ficticios(self):
        """Verifica que as funções não retornam valores fixos/fictícios."""
        r1 = consultar_terreno(*PONTO_CENTRO)
        r2 = consultar_terreno(*PONTO_ANHANGUERA)
        # Dois pontos diferentes devem ter resultados diferentes (não são fictícios fixos)
        if r1["altitude_m"] is not None and r2["altitude_m"] is not None:
            self.assertNotAlmostEqual(r1["altitude_m"], r2["altitude_m"], places=0)


if __name__ == "__main__":
    unittest.main()
