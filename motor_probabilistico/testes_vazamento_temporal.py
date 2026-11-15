"""Testes de vazamento temporal e valores ausentes para o Motor Probabilístico 2.0.

Garante que:
1. Chuva observada após o evento nunca é usada como preditora.
2. Registros com valores ausentes críticos são rejeitados.
3. Nenhum dado fictício é usado.
4. Previsões futuras são tratadas como predição, não como observação.
"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from consulta_cruzada import (
    montar_registro_cruzado,
    verificar_vazamento_temporal,
    cruzar_lista_eventos,
    filtrar_registros_validos,
)
from dados_estruturados import (
    EventoAlagamento,
    MedicaoChuva,
    VariavelTopografica,
    janela_chuva_antes_evento,
    validar_registro_sem_valores_ausentes_criticos,
)

# Topografia fictícia apenas para teste de estrutura (não é dado de treinamento)
TOPO_TESTE = VariavelTopografica(
    latitude=-23.3561,
    longitude=-46.8769,
    altitude_m=790.0,
    declividade_graus=10.0,
    elevacao_relativa_m=5.0,
    qualidade_dados="boa",
    fonte="teste",
)

TOPO_FORA_COBERTURA = VariavelTopografica(
    latitude=-23.3561,
    longitude=-46.8769,
    altitude_m=None,
    declividade_graus=None,
    elevacao_relativa_m=None,
    qualidade_dados="fora_cobertura",
    fonte="teste",
)


class TestVazamentoTemporal(unittest.TestCase):
    """Testes que impedem vazamento temporal (usar dados futuros para prever passado)."""

    def test_chuva_apos_evento_nao_eh_usada_como_observada(self):
        """Medição de chuva após o evento não deve aparecer como chuva observada antes."""
        evento = EventoAlagamento(
            id=1,
            tipo="alagamento",
            descricao="Teste",
            bairro="Centro",
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            ocorrido_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            precisao_temporal="instante",
            fonte_temporal="fixture-evento",
            publica=True,
            fonte="registro_comunitario",
        )

        # Chuva 30 MINUTOS ANTES do evento (válida)
        chuva_antes = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 9, 30, 0, tzinfo=timezone.utc),
            precipitacao_mm=25.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
        )

        # Chuva 2 HORAS DEPOIS do evento (NÃO deve ser usada como observada antes)
        chuva_depois = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc),
            precipitacao_mm=50.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 12, 30, 0, tzinfo=timezone.utc),
        )

        registros = cruzar_lista_eventos(
            [evento], [chuva_antes, chuva_depois], [], lambda lat, lon: TOPO_TESTE
        )
        self.assertEqual(len(registros), 1)
        reg = registros[0]
        # Deve usar a chuva de antes (25 mm), não a de depois (50 mm)
        self.assertEqual(reg.chuva_observada_24h_antes_mm, 25.0)

    def test_janela_chuva_antes_rejeita_dados_futuros(self):
        """janela_chuva_antes_evento não retorna medições após o evento."""
        evento_data = datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc)

        medição_futura = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc),  # 2h depois
            precipitacao_mm=50.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 12, 30, 0, tzinfo=timezone.utc),
        )

        medição_passada = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 8, 0, 0, tzinfo=timezone.utc),  # 2h antes
            precipitacao_mm=20.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 8, 30, 0, tzinfo=timezone.utc),
        )

        resultado = janela_chuva_antes_evento(
            [medição_futura, medição_passada], evento_data, janela_horas=24, latitude=-23.3561, longitude=-46.8769
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado.precipitacao_mm, 20.0)

    def test_janela_chuva_antes_respeita_limite_24h(self):
        """Medição com mais de 24h antes do evento não é retornada."""
        evento_data = datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc)

        medição_25h_antes = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 5, 9, 0, 0, tzinfo=timezone.utc),  # 25h antes
            precipitacao_mm=100.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 5, 9, 30, 0, tzinfo=timezone.utc),
        )

        medição_2h_antes = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 8, 0, 0, tzinfo=timezone.utc),  # 2h antes
            precipitacao_mm=20.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 8, 30, 0, tzinfo=timezone.utc),
        )

        resultado = janela_chuva_antes_evento(
            [medição_25h_antes, medição_2h_antes], evento_data, janela_horas=24, latitude=-23.3561, longitude=-46.8769
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado.precipitacao_mm, 20.0)

    def test_sem_chuva_antes_retorna_none(self):
        """Se não há chuva antes do evento, retorna None."""
        evento_data = datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc)

        medição_apenas_depois = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc),
            precipitacao_mm=50.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 12, 30, 0, tzinfo=timezone.utc),
        )

        resultado = janela_chuva_antes_evento(
            [medição_apenas_depois], evento_data, janela_horas=24, latitude=-23.3561, longitude=-46.8769
        )
        self.assertIsNone(resultado)


class TestValoresAusentes(unittest.TestCase):
    """Testes para registros com valores ausentes ou inválidos."""

    def test_evento_sem_data_eh_valido_estruturalmente(self):
        """Evento sem data ainda pode ser cruzado, mas é marcado nos problemas."""
        evento = EventoAlagamento(
            id=2,
            tipo="alagamento",
            descricao="Sem data",
            bairro=None,
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=None,
            publica=False,
            fonte="registro_comunitario",
        )

        reg = montar_registro_cruzado(
            evento, [], [], TOPO_TESTE
        )
        self.assertIsNone(reg.evento_data)

        problemas = validar_registro_sem_valores_ausentes_criticos(reg)
        self.assertIn("evento_data ausente", problemas)

    def test_sem_chuva_nenhuma_fonte_é_problema(self):
        """Registro sem chuva observada nem prevista é considerado inválido."""
        evento = EventoAlagamento(
            id=3,
            tipo="alagamento",
            descricao="Sem chuva",
            bairro=None,
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            ocorrido_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            precisao_temporal="instante",
            fonte_temporal="fixture-evento",
            publica=True,
            fonte="registro_comunitario",
        )

        reg = montar_registro_cruzado(
            evento, [], [], TOPO_TESTE
        )
        problemas = validar_registro_sem_valores_ausentes_criticos(reg)
        self.assertIn("nenhuma fonte de chuva válida", problemas)

    def test_topografia_fora_cobertura_é_problema(self):
        """Ponto fora da cobertura topográfica é problema crítico."""
        evento = EventoAlagamento(
            id=4,
            tipo="alagamento",
            descricao="Fora cobertura",
            bairro=None,
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            ocorrido_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            precisao_temporal="instante",
            fonte_temporal="fixture-evento",
            publica=True,
            fonte="registro_comunitario",
        )

        chuva = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 8, 0, 0, tzinfo=timezone.utc),
            precipitacao_mm=20.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 8, 30, 0, tzinfo=timezone.utc),
        )

        reg = montar_registro_cruzado(
            evento, [chuva], [], TOPO_FORA_COBERTURA
        )
        problemas = validar_registro_sem_valores_ausentes_criticos(reg)
        self.assertIn("ponto fora da cobertura topográfica", problemas)

    def test_chuva_negativa_é_problema(self):
        """Chuva negativa não é física e é rejeitada."""
        evento = EventoAlagamento(
            id=5,
            tipo="alagamento",
            descricao="Chuva negativa",
            bairro=None,
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            ocorrido_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            precisao_temporal="instante",
            fonte_temporal="fixture-evento",
            publica=True,
            fonte="registro_comunitario",
        )

        chuva_negativa = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 8, 0, 0, tzinfo=timezone.utc),
            precipitacao_mm=-5.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 8, 30, 0, tzinfo=timezone.utc),
        )

        reg = montar_registro_cruzado(
            evento, [chuva_negativa], [], TOPO_TESTE
        )
        problemas = validar_registro_sem_valores_ausentes_criticos(reg)
        self.assertIsNone(reg.chuva_observada_24h_antes_mm)
        self.assertIn("nenhuma fonte de chuva válida", problemas)

    def test_altitude_fora_faixa_fisica_é_problema(self):
        """Altitude fora de faixa física plausível é rejeitada."""
        topo_altitude_invalida = VariavelTopografica(
            latitude=-23.3561,
            longitude=-46.8769,
            altitude_m=99999.0,
            declividade_graus=10.0,
            elevacao_relativa_m=0.0,
            qualidade_dados="boa",
            fonte="teste",
        )

        evento = EventoAlagamento(
            id=6,
            tipo="alagamento",
            descricao="Altitude inválida",
            bairro=None,
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            ocorrido_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            precisao_temporal="instante",
            fonte_temporal="fixture-evento",
            publica=True,
            fonte="registro_comunitario",
        )

        chuva = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 8, 0, 0, tzinfo=timezone.utc),
            precipitacao_mm=20.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 8, 30, 0, tzinfo=timezone.utc),
        )

        reg = montar_registro_cruzado(
            evento, [chuva], [], topo_altitude_invalida
        )
        problemas = validar_registro_sem_valores_ausentes_criticos(reg)
        self.assertIn("altitude fora de faixa física plausível", problemas)


class TestFiltroRegistrosValidos(unittest.TestCase):
    """Testes para separação de registros válidos e inválidos."""

    def test_filtro_separa_validos_e_invalidos(self):
        """filtrar_registros_validos separa corretamente."""
        evento_valido = EventoAlagamento(
            id=10,
            tipo="alagamento",
            descricao="Válido",
            bairro="Centro",
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            ocorrido_em=datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc),
            precisao_temporal="instante",
            fonte_temporal="fixture-evento",
            publica=True,
            fonte="registro_comunitario",
        )

        evento_sem_data = EventoAlagamento(
            id=11,
            tipo="alagamento",
            descricao="Sem data",
            bairro=None,
            latitude=-23.3561,
            longitude=-46.8769,
            verificado_em=None,
            publica=False,
            fonte="registro_comunitario",
        )

        chuva = MedicaoChuva(
            latitude=-23.3561,
            longitude=-46.8769,
            id_estacao=1,
            codigo_estacao="EA01",
            data_hora=datetime(2026, 11, 6, 8, 0, 0, tzinfo=timezone.utc),
            precipitacao_mm=20.0,
            tipo_medicao="acumulado_24h",
            janela_horas=24,
            unidade="mm",
            fonte_dado="CEMADEN",
            qualidade_dado="oficial",
            coletado_em=datetime(2026, 11, 6, 8, 30, 0, tzinfo=timezone.utc),
        )

        validos, invalidos = filtrar_registros_validos(
            cruzar_lista_eventos(
                [evento_valido, evento_sem_data],
                [chuva],
                [],
                lambda lat, lon: TOPO_TESTE,
            )
        )

        self.assertEqual(len(validos), 1)
        self.assertEqual(len(invalidos), 1)
        self.assertEqual(invalidos[0][0].evento_id, 11)
        self.assertTrue(any("evento_data ausente" in p for p in invalidos[0][1]))


if __name__ == "__main__":
    unittest.main()
