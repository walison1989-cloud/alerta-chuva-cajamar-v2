"""Fixtures sintéticas testam as contas; não medem precisão real de Cajamar."""
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import pytest
from motor_probabilistico.validacao import CasoValidacao, avaliar_previsoes

T = datetime(2026, 1, 1, tzinfo=timezone.utc)

def caso(i, p, y):
    t = T + timedelta(days=i)
    return CasoValidacao(str(i), t, t + timedelta(hours=24), t,
        T - timedelta(days=1), t + timedelta(hours=25), y, p,
        'fixture de teste', True, 'teste-v1')

def avaliar(casos):
    return avaliar_previsoes(casos, limiar=0.5, probabilidade_referencia=0.5)

def test_contas_e_calibracao():
    r = avaliar([caso(0, .8, True), caso(1, .6, False), caso(2, .2, False), caso(3, .4, True)])
    assert [r[k] for k in ('verdadeiros_positivos', 'falsos_positivos', 'verdadeiros_negativos', 'falsos_negativos')] == [1, 1, 1, 1]
    assert r['precisao_alertas'] == r['sensibilidade'] == r['acuracia'] == .5
    assert r['brier'] == pytest.approx(.2)
    assert r['brier_skill'] == pytest.approx(.2)
    assert r['calibracao'][8]['frequencia_observada'] == 1

def test_denominadores_zero_nao_inventam_acerto():
    r = avaliar([caso(0, 0, False)])
    assert r['precisao_alertas'] is None and r['sensibilidade'] is None
    assert not r['ambas_classes_presentes']

@pytest.mark.parametrize('p', [True, -1, 1.1, float('nan'), float('inf'), None])
def test_rejeita_probabilidade_invalida(p):
    with pytest.raises(ValueError): caso(0, p, True)

@pytest.mark.parametrize('changes', [
    {'decisao_em': T.replace(tzinfo=None)},
    {'entradas_disponiveis_em': T + timedelta(seconds=1)},
    {'modelo_treinado_ate': T},
    {'fim_janela': T},
    {'desfecho_confirmado_em': T},
    {'acompanhamento_completo': False},
    {'ocorreu_alagamento': 1},
    {'fonte_desfecho': ''},
])
def test_rejeita_vazamento_e_desfecho_nao_confirmado(changes):
    with pytest.raises(ValueError): replace(caso(0, .5, True), **changes)

def test_rejeita_duplicatas_versoes_e_horizontes_misturados():
    c = caso(0, 1, True)
    for conjunto in ([], [c, c], [c, replace(caso(1, 0, False), versao_modelo='outro')],
                     [c, replace(caso(1, 0, False), fim_janela=T+timedelta(hours=47))]):
        with pytest.raises(ValueError): avaliar(conjunto)

def test_limites_da_calibracao_e_referencia_perfeita():
    r = avaliar_previsoes([caso(0, 1, True)], limiar=1, probabilidade_referencia=1)
    assert r['calibracao'][9]['n'] == 1 and r['brier_skill'] is None
