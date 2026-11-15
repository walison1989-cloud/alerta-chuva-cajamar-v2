"""Treino offline de candidato logístico. Nunca publica ou ativa alertas.

Entrada JSONL normalizada com proveniência. Não aceita relatos ausentes como
negativos. Dados individuais e modelos ficam fora do Git.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from motor_probabilistico.validacao import CasoValidacao, avaliar_previsoes
from motor_probabilistico.dados_estruturados import instante, numero_valido

FEATURES = ('chuva_observada_24h_mm', 'chuva_prevista_24h_mm',
            'declividade_graus', 'elevacao_relativa_m')
VERSION = 'logistica-cajamar-v0-candidato'


def data_iso(value):
    try:
        result = instante(datetime.fromisoformat(value.replace('Z', '+00:00')))
    except (ValueError, TypeError, AttributeError):
        result = None
    if result is None:
        raise ValueError('Data ISO 8601 com fuso obrigatória')
    return result


@dataclass(frozen=True)
class JanelaTreino:
    evidencia: CasoValidacao
    episodio_id: str
    features: tuple
    fonte_entradas: str

    def __post_init__(self):
        if not isinstance(self.evidencia, CasoValidacao):
            raise ValueError('Evidência inválida')
        if not isinstance(self.episodio_id, str) or not self.episodio_id.strip():
            raise ValueError('episodio_id obrigatório, inclusive períodos sem evento')
        if not isinstance(self.fonte_entradas, str) or not self.fonte_entradas.strip():
            raise ValueError('fonte_entradas obrigatória')
        if len(self.features) != len(FEATURES) or not all(numero_valido(v) for v in self.features):
            raise ValueError('Todas as quatro entradas precisam ser números finitos')
        if min(self.features[:2]) < 0 or not 0 <= self.features[2] <= 90:
            raise ValueError('Chuva negativa ou declividade inválida')
        if self.evidencia.fim_janela - self.evidencia.decisao_em != timedelta(hours=24):
            raise ValueError('Este candidato exige horizonte de 24 horas')


def carregar_jsonl(path):
    rows = []
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        decision = data_iso(d['decisao_em'])
        # Este instante é só um marcador de validação do contrato antes do treino.
        # O corte real é calculado a partir dos desfechos usados em cada ajuste.
        evidence = CasoValidacao(d['janela_id'], decision, data_iso(d['fim_janela']),
            data_iso(d['entradas_disponiveis_em']), datetime.min.replace(tzinfo=timezone.utc),
            data_iso(d['desfecho_confirmado_em']), d['ocorreu_alagamento'], 0,
            d['fonte_desfecho'], d['acompanhamento_completo'], VERSION)
        rows.append(JanelaTreino(evidence, d['episodio_id'],
            tuple(d[name] for name in FEATURES), d['fonte_entradas']))
    return rows


def sigmoide(x):
    return np.exp(-np.logaddexp(0, -np.asarray(x, dtype=float)))


def ajustar(x, y):
    """Logística L2 determinística; normalização ajustada apenas neste conjunto."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    mean, scale = x.mean(axis=0), x.std(axis=0)
    scale[scale < 1e-12] = 1
    design = np.column_stack([np.ones(len(x)), (x - mean) / scale])
    weights = np.zeros(design.shape[1])
    # Limite superior da curvatura da perda: passo conservador sem busca no teste.
    step = 1 / (.25 * np.linalg.norm(design, 2) ** 2 / len(x) + .01)
    for _ in range(10000):
        gradient = design.T @ (sigmoide(design @ weights) - y) / len(x)
        gradient[1:] += .01 * weights[1:]
        if np.max(np.abs(gradient)) < 1e-7:
            break
        weights -= step * gradient
    else:
        raise ValueError('Ajuste não convergiu; nenhum modelo liberado')
    if not np.isfinite(weights).all():
        raise ValueError('Coeficientes não finitos')
    return {'media': mean.tolist(), 'escala': scale.tolist(), 'pesos': weights.tolist()}


def logit(model, x):
    x = np.asarray(x, dtype=float)
    return model['pesos'][0] + ((x - model['media']) / model['escala']) @ np.asarray(model['pesos'][1:])


def prever_candidato(model, features, *, decisao_em, entradas_disponiveis_em):
    """Inferência local experimental; exige o mesmo contrato do treino."""
    decision, available = instante(decisao_em), instante(entradas_disponiveis_em)
    if model.get('versao') != VERSION or model.get('features') != list(FEATURES):
        raise ValueError('Modelo ou ordem das entradas incompatível')
    if not decision or not available or available > decision or data_iso(model['treinado_ate']) >= decision:
        raise ValueError('Modelo ou entradas indisponíveis na decisão')
    values = tuple(features)
    if len(values) != 4 or not all(numero_valido(v) for v in values):
        raise ValueError('Entradas ausentes ou inválidas')
    if min(values[:2]) < 0 or not 0 <= values[2] <= 90:
        raise ValueError('Chuva ou declividade inválida')
    for key, size in (('base', 4), ('calibrador', 1)):
        part = model[key]
        for name, expected in (('media', size), ('escala', size), ('pesos', size + 1)):
            if len(part[name]) != expected or not all(numero_valido(v) for v in part[name]):
                raise ValueError('Artefato de modelo inválido')
        if any(v <= 0 for v in part['escala']):
            raise ValueError('Escala do modelo inválida')
    probability = float(sigmoide(logit(model['calibrador'], [float(logit(model['base'], values))])))
    if not numero_valido(probability, 0) or probability > 1:
        raise ValueError('Saída não finita do modelo')
    return {'probabilidade': probability, 'horizonte_horas': 24,
            'status': 'experimental_sem_validacao_operacional', 'alerta_oficial': False}


def treinar(rows, *, inicio_calibracao, inicio_teste, limiar=.5):
    cal, test = instante(inicio_calibracao), instante(inicio_teste)
    if not cal or not test or cal >= test:
        raise ValueError('Cortes temporais inválidos')
    if not numero_valido(limiar, 0) or limiar > 1:
        raise ValueError('Limiar deve estar entre 0 e 1')
    rows = list(rows)
    if not rows or any(not isinstance(r, JanelaTreino) for r in rows):
        raise ValueError('Sem janelas reais normalizadas para treinar')
    if len({r.evidencia.janela_id for r in rows}) != len(rows):
        raise ValueError('Janelas duplicadas')
    train_rows, cal_rows, test_rows = [], [], []
    purged = 0
    for row in sorted(rows, key=lambda r: r.evidencia.decisao_em):
        e = row.evidencia
        if e.decisao_em < cal:
            if e.desfecho_confirmado_em >= cal: purged += 1
            else: train_rows.append(row)
        elif e.decisao_em < test:
            if e.desfecho_confirmado_em >= test: purged += 1
            else: cal_rows.append(row)
        else: test_rows.append(row)
    groups = [{r.episodio_id for r in part} for part in (train_rows, cal_rows, test_rows)]
    if groups[0] & groups[1] or groups[0] & groups[2] or groups[1] & groups[2]:
        raise ValueError('Mesmo episódio aparece em partições diferentes')
    # Piso técnico para evitar ajustes degenerados; não certifica suficiência estatística.
    for name, part in zip(('treino', 'calibracao', 'teste'), (train_rows, cal_rows, test_rows)):
        positives = sum(r.evidencia.ocorreu_alagamento for r in part)
        if len(part) < 20 or min(positives, len(part) - positives) < 2:
            raise ValueError(f'{name}: exige ao menos 20 janelas e 2 casos de cada classe; piso técnico, não garantia de precisão')
    base = ajustar([r.features for r in train_rows], [int(r.evidencia.ocorreu_alagamento) for r in train_rows])
    calibrator = ajustar([[float(logit(base, r.features))] for r in cal_rows],
                         [int(r.evidencia.ocorreu_alagamento) for r in cal_rows])
    trained_until = max(r.evidencia.desfecho_confirmado_em for r in train_rows + cal_rows)
    reference = sum(r.evidencia.ocorreu_alagamento for r in train_rows) / len(train_rows)
    cases = []
    for row in test_rows:
        from dataclasses import replace
        p = float(sigmoide(logit(calibrator, [float(logit(base, row.features))])))
        cases.append(replace(row.evidencia, modelo_treinado_ate=trained_until, probabilidade=p))
    metrics = avaliar_previsoes(cases, limiar=limiar, probabilidade_referencia=reference)
    return {'schema': 1, 'versao': VERSION, 'status': 'candidato_offline_nao_validado_para_alertas',
        'features': list(FEATURES), 'horizonte_horas': 24,
        'base': base, 'calibrador': calibrator, 'treinado_ate': trained_until.isoformat(),
        'particoes': {'treino': len(train_rows), 'calibracao': len(cal_rows), 'teste': len(test_rows), 'purgadas': purged},
        'cortes': {'inicio_calibracao': cal.isoformat(), 'inicio_teste': test.isoformat()},
        'teste': metrics, 'ativacao_automatica': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dados', required=True)
    parser.add_argument('--inicio-calibracao', required=True)
    parser.add_argument('--inicio-teste', required=True)
    parser.add_argument('--saida', required=True)
    args = parser.parse_args()
    try:
        rows = carregar_jsonl(args.dados)
        result = treinar(rows, inicio_calibracao=data_iso(args.inicio_calibracao), inicio_teste=data_iso(args.inicio_teste))
        result['sha256_dados'] = hashlib.sha256(Path(args.dados).read_bytes()).hexdigest()
    except (ValueError, KeyError, OSError, TypeError) as error:
        # Não imprimir valores ou conteúdo do arquivo potencialmente privado.
        print(json.dumps({'status': 'treinamento_nao_realizado', 'tipo_erro': type(error).__name__,
                          'orientacao': 'Confira os dados, proveniência e cortes conforme docs/TREINAMENTO.md'}))
        return 2
    target = Path(args.saida)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        print(json.dumps({'status': 'saida_existente_nao_sobrescrita'}))
        return 2
    with target.open('x', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps({'status': result['status'], 'particoes': result['particoes']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
