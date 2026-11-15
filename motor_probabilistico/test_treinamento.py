"""Dados sintéticos SOMENTE para testes de software, nunca modelo publicado."""
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import pytest
from motor_probabilistico.validacao import CasoValidacao
from motor_probabilistico.treinamento import JanelaTreino, treinar, prever_candidato, carregar_jsonl

T = datetime(2020, 1, 1, tzinfo=timezone.utc)

def dados():
    result = []
    for i in range(90):
        t = T + timedelta(days=2*i)
        y = i % 2 == 1
        evidence = CasoValidacao(str(i), t, t+timedelta(days=1), t,
            T-timedelta(days=1), t+timedelta(hours=25), y, 0, 'fixture', True, 'fixture')
        result.append(JanelaTreino(evidence, f'episodio-{i}',
            (float(i % 2)*30, float(i % 2)*40, 5., 2.), 'fixture'))
    return result

def run(rows):
    return treinar(rows, inicio_calibracao=T+timedelta(days=60), inicio_teste=T+timedelta(days=120))

def test_treino_calibracao_teste_e_inferencia_sem_publicar():
    model = run(dados())
    assert model['particoes'] == {'treino': 30, 'calibracao': 30, 'teste': 30, 'purgadas': 0}
    assert model['teste']['brier'] < model['teste']['brier_referencia']
    assert not model['ativacao_automatica']
    a = prever_candidato(model, (0, 0, 5, 2), decisao_em=T+timedelta(days=200), entradas_disponiveis_em=T)
    b = prever_candidato(model, (30, 40, 5, 2), decisao_em=T+timedelta(days=200), entradas_disponiveis_em=T)
    assert 0 < a['probabilidade'] < b['probabilidade'] < 1

def test_teste_futuro_nao_altera_pesos_nem_normalizacao():
    rows = dados()
    original = run(rows)
    changed = [replace(r, features=(900., 900., 80., -50.)) if i >= 60 else r for i,r in enumerate(rows)]
    other = run(changed)
    assert original['base'] == other['base'] and original['calibrador'] == other['calibrador']

def test_rejeita_episodios_cruzados_duplicatas_e_poucos_dados():
    rows = dados()
    for bad in ([], rows[:10], rows+[rows[0]], [replace(r, episodio_id='mesmo') for r in rows]):
        with pytest.raises(ValueError): run(bad)

def test_purga_desfecho_futuro_na_fronteira():
    rows = dados()
    rows[29] = replace(rows[29], evidencia=replace(rows[29].evidencia, desfecho_confirmado_em=T+timedelta(days=61)))
    model = run(rows)
    assert model['particoes']['purgadas'] == 1 and model['particoes']['treino'] == 29

@pytest.mark.parametrize('values', [(False,1,2,3), (-1,0,0,0), (1,2,91,0), (1,2,float('nan'),0), (1,2)])
def test_rejeita_features_invalidas(values):
    with pytest.raises(ValueError): replace(dados()[0], features=values)

def test_nao_treina_sem_classe_negativa():
    rows = [replace(r, evidencia=replace(r.evidencia, ocorreu_alagamento=True)) for r in dados()]
    with pytest.raises(ValueError): run(rows)

def test_rejeita_inferencia_com_modelo_futuro():
    model = run(dados())
    with pytest.raises(ValueError): prever_candidato(model, (0,0,5,2), decisao_em=T, entradas_disponiveis_em=T)

def test_rejeita_artefato_corrompido():
    model = run(dados())
    model['base']['escala'][0] = 0
    with pytest.raises(ValueError):
        prever_candidato(model, (0,0,5,2), decisao_em=T+timedelta(days=200), entradas_disponiveis_em=T)

def test_dataset_vazio_eh_vazio_sem_rotulos_inventados(tmp_path):
    p = tmp_path/'vazio.jsonl'
    p.write_text('', encoding='utf-8')
    assert carregar_jsonl(p) == []
    with pytest.raises(ValueError): run(carregar_jsonl(p))
