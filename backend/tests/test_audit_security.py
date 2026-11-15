import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from security import require_admin
from schemas import ContatoMoradorCreate, ConfiguracaoLimiares
from main import app

def test_admin_denied_if_not_configured(monkeypatch):
    monkeypatch.delenv('LEGACY_ADMIN_TOKEN', raising=False)
    with pytest.raises(HTTPException) as e: require_admin(None)
    assert e.value.status_code == 503

def test_admin_rejects_missing_and_wrong_token(monkeypatch):
    monkeypatch.setenv('LEGACY_ADMIN_TOKEN', 'test-only-secret')
    for cred in [None, HTTPAuthorizationCredentials(scheme='Bearer',credentials='wrong')]:
        with pytest.raises(HTTPException) as e: require_admin(cred)
        assert e.value.status_code == 401
    require_admin(HTTPAuthorizationCredentials(scheme='Bearer',credentials='test-only-secret'))

def test_sensitive_routes_are_protected():
    protected={'/api/moradores','/api/moradores/{id_contato}','/api/simulacao/executar','/api/simulacao/limpar','/api/mapa/camadas'}
    routes=[r for r in app.routes if getattr(r,'path',None) in protected or (getattr(r,'path',None)=='/api/config' and 'POST' in r.methods)]
    assert len(routes)==7
    assert all(any(dep.call is require_admin for dep in r.dependant.dependencies) for r in routes)

@pytest.mark.parametrize('values', [dict(nome='Teste'),dict(nome='Teste',telefone='  '),dict(nome='Teste',email='x@y.z',latitude=1),dict(nome='Teste',email='x@y.z',latitude=91,longitude=0)])
def test_invalid_resident_is_validation_error(values):
    with pytest.raises(ValidationError): ContatoMoradorCreate(**values)

@pytest.mark.parametrize('values', [dict(ALERT_CALCULATION_MODE='invalid'),dict(THRESHOLD_ALERTA_MM_H=-1),dict(THRESHOLD_ALERTA_MM_H=float('nan'))])
def test_invalid_configuration(values):
    with pytest.raises(ValidationError): ConfiguracaoLimiares(**values)

def test_non_susceptible_area_does_not_emit():
    from services.alert_engine import avaliar_e_emitir_alerta
    from unittest.mock import Mock
    db=Mock()
    db.get.return_value=None
    db.query.return_value.filter.return_value.first.return_value=Mock(nome_bairro='Teste')
    assert avaliar_e_emitir_alerta(db,1,100,150,suscetivel=False) is None
    db.add.assert_not_called()
