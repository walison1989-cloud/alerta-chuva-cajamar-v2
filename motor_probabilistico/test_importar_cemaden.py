from datetime import datetime, timezone
import pytest
from motor_probabilistico.importar_cemaden import importar_csv

HEADER = 'municipio;codestacao;uf;latitude;longitude;datahora;valorMedida\n'
ROW = 'Cajamar;E1;SP;-23,35;-46,87;2020-01-01 12:00:00;2,5\n'

def test_preserva_bruto_utc_e_nao_fabrica_disponibilidade_historica(tmp_path):
    p = tmp_path/'chuva.csv'
    p.write_text(HEADER+ROW+'Outra;E2;SP;0;0;2020-01-01;0\n', encoding='utf-8')
    rows = importar_csv(p, baixado_em=datetime(2026,1,1,tzinfo=timezone.utc), fonte_url='https://mapainterativo.cemaden.gov.br/')
    assert len(rows) == 1 and rows[0]['valor_bruto'] == 2.5
    assert rows[0]['data_hora'].endswith('+00:00')
    assert rows[0]['disponivel_em_historico'] is None and not rows[0]['elegivel_treino']

@pytest.mark.parametrize('body', [HEADER+ROW+ROW, HEADER+ROW.replace('2,5','-2'), HEADER, 'x;y\n'])
def test_rejeita_arquivo_sem_base_valida(tmp_path, body):
    p = tmp_path/'chuva.csv'
    p.write_text(body, encoding='utf-8')
    with pytest.raises(ValueError): importar_csv(p, baixado_em=datetime(2026,1,1,tzinfo=timezone.utc), fonte_url='https://mapainterativo.cemaden.gov.br/')
