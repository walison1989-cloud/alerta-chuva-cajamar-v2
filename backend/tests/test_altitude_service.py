import pytest
from pathlib import Path
pytestmark = pytest.mark.skipif(not (Path(__file__).resolve().parents[2]/"data/processed/mde_cajamar_recortado.tif").exists(), reason="Rasters locais opcionais não instalados; consulte docs/DADOS.md")
#!/usr/bin/env python3
"""Testes automatizados para o serviço de altitude."""

import unittest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from altitude_service import obter_altitude, obter_altitudes


class TestAltitudeService(unittest.TestCase):
    """Testes para consulta de altitude."""

    def test_ponto_valido_centro_cajamar(self):
        """Ponto dentro do município deve retornar altitude válida."""
        alt = obter_altitude(-23.3561, -46.8769)
        self.assertIsNotNone(alt)
        self.assertIsInstance(alt, float)
        self.assertGreater(alt, 600)
        self.assertLess(alt, 1100)

    def test_ponto_valido_outro(self):
        """Outro ponto dentro do município."""
        alt = obter_altitude(-23.3800, -46.8500)
        self.assertIsNotNone(alt)
        self.assertGreater(alt, 600)
        self.assertLess(alt, 1100)

    def test_ponto_externo_sudoeste(self):
        """Ponto fora do município (sudoeste) deve retornar None."""
        alt = obter_altitude(-23.5000, -47.0000)
        self.assertIsNone(alt)

    def test_ponto_externo_nordeste(self):
        """Ponto fora do município (nordeste) deve retornar None."""
        alt = obter_altitude(-23.2000, -46.7000)
        self.assertIsNone(alt)

    def test_obter_altitudes_lista(self):
        """Consulta de múltiplos pontos."""
        pontos = [(-23.3561, -46.8769), (-23.3800, -46.8500), (-23.5000, -47.0000)]
        resultados = obter_altitudes(pontos)
        self.assertEqual(len(resultados), 3)
        self.assertIsNotNone(resultados[0])
        self.assertIsNotNone(resultados[1])
        self.assertIsNone(resultados[2])

    def test_todos_dentro_faixa_valida(self):
        """Todos os pontos válidos devem estar na faixa de altitude esperada."""
        pontos_internos = [
            (-23.3561, -46.8769),
            (-23.3800, -46.8500),
            (-23.3300, -46.8650),  # perto da estação Jordanésia
            (-23.4150, -46.8350),  # perto da estação Polvilho
            (-23.3560, -46.8760),  # perto da estação Anhanguera
        ]
        for lat, lon in pontos_internos:
            alt = obter_altitude(lat, lon)
            # Pode ser None se o ponto cair em NoData do recorte, mas se válido deve estar na faixa
            if alt is not None:
                self.assertGreater(alt, 600)
                self.assertLess(alt, 1100)


if __name__ == "__main__":
    unittest.main()
