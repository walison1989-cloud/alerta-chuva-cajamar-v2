import pytest
from motor_probabilistico.modelo_2_0 import EntradaMotor2_0

@pytest.mark.parametrize("values", [dict(latitude=91), dict(chuva_observada_24h_mm=float("nan")), dict(chuva_prevista_24h_mm=-1), dict(altitude_m=float("inf")), dict(declividade_graus=91)])
def test_rejects_invalid_model_values(values):
    data = dict(latitude=-23.35, longitude=-46.87)
    data.update(values)
    with pytest.raises(ValueError): EntradaMotor2_0(**data)

@pytest.mark.parametrize('values', [dict(latitude=True), dict(latitude=None),
    dict(longitude='-46.87'), dict(chuva_observada_24h_mm=False), dict(altitude_m='750')])
def test_rejects_non_numeric_inputs_consistently(values):
    data = dict(latitude=-23.35, longitude=-46.87)
    data.update(values)
    with pytest.raises(ValueError): EntradaMotor2_0(**data)
