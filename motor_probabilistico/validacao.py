"""Avaliação local de previsões registradas antes do desfecho, sem treinar modelo.

O chamador deve fornecer janelas acompanhadas, inclusive sem ocorrência.
Ausência de relato no banco não comprova um desfecho negativo.
"""
from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from motor_probabilistico.dados_estruturados import instante


def _probabilidade(value, nome):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"{nome} deve estar entre 0 e 1 e ser finita")
    return float(value)


@dataclass(frozen=True)
class CasoValidacao:
    janela_id: str
    decisao_em: datetime
    fim_janela: datetime
    entradas_disponiveis_em: datetime
    modelo_treinado_ate: datetime
    desfecho_confirmado_em: datetime
    ocorreu_alagamento: bool
    probabilidade: float
    fonte_desfecho: str
    acompanhamento_completo: bool
    versao_modelo: str

    def __post_init__(self):
        for nome in ('janela_id', 'fonte_desfecho', 'versao_modelo'):
            if not isinstance(getattr(self, nome), str) or not getattr(self, nome).strip():
                raise ValueError(f"{nome} obrigatório")
        tempos = {}
        for nome in ('decisao_em', 'fim_janela', 'entradas_disponiveis_em',
                     'modelo_treinado_ate', 'desfecho_confirmado_em'):
            tempos[nome] = instante(getattr(self, nome))
            if tempos[nome] is None:
                raise ValueError(f"{nome} exige data com fuso")
        if not tempos['modelo_treinado_ate'] < tempos['decisao_em']:
            raise ValueError('Treino deve terminar antes da decisão')
        if tempos['entradas_disponiveis_em'] > tempos['decisao_em']:
            raise ValueError('Entradas indisponíveis na decisão')
        if tempos['fim_janela'] <= tempos['decisao_em']:
            raise ValueError('Janela deve terminar depois da decisão')
        if tempos['desfecho_confirmado_em'] < tempos['fim_janela']:
            raise ValueError('Desfecho exige janela encerrada')
        if type(self.ocorreu_alagamento) is not bool or self.acompanhamento_completo is not True:
            raise ValueError('Exige desfecho booleano e acompanhamento completo')
        _probabilidade(self.probabilidade, 'probabilidade')


def avaliar_previsoes(casos, *, limiar, probabilidade_referencia):
    """Limiar e referência devem ser fixados no treino, antes de olhar o teste.

    Retorna métricas por janela, não por pessoa nem por episódio meteorológico.
    A referência é uma probabilidade constante estimada fora deste conjunto.
    Não escolhe limiar, não certifica precisão e não ativa alertas.
    """
    limiar = _probabilidade(limiar, 'limiar')
    referencia = _probabilidade(probabilidade_referencia, 'probabilidade_referencia')
    casos = list(casos)
    if not casos:
        raise ValueError('Conjunto de avaliação vazio')
    if any(not isinstance(c, CasoValidacao) for c in casos):
        raise ValueError('Use CasoValidacao com proveniência')
    if len({c.janela_id for c in casos}) != len(casos):
        raise ValueError('Janela duplicada; não conte a mesma avaliação duas vezes')
    if len({c.versao_modelo for c in casos}) != 1:
        raise ValueError('Avalie uma versão de modelo por relatório')
    tp = fp = tn = fn = 0
    brier = brier_ref = 0.0
    faixas = [{'de': i / 10, 'ate': (i + 1) / 10, 'n': 0,
               'soma_probabilidades': 0.0, 'ocorrencias': 0} for i in range(10)]
    horizontes = set()
    for c in casos:
        horizontes.add((instante(c.fim_janela) - instante(c.decisao_em)).total_seconds())
        positivo = c.probabilidade >= limiar
        if positivo and c.ocorreu_alagamento: tp += 1
        elif positivo: fp += 1
        elif c.ocorreu_alagamento: fn += 1
        else: tn += 1
        brier += (c.probabilidade - int(c.ocorreu_alagamento)) ** 2
        brier_ref += (referencia - int(c.ocorreu_alagamento)) ** 2
        faixa = faixas[min(9, int(c.probabilidade * 10))]
        faixa['n'] += 1
        faixa['soma_probabilidades'] += c.probabilidade
        faixa['ocorrencias'] += int(c.ocorreu_alagamento)
    if len(horizontes) != 1:
        raise ValueError('Não misture horizontes de previsão')
    n = len(casos)
    divide = lambda a, b: a / b if b else None
    return {
        'versao_modelo': casos[0].versao_modelo,
        'n': n, 'horizonte_horas': horizontes.pop() / 3600,
        'limiar': limiar, 'probabilidade_referencia': referencia,
        'verdadeiros_positivos': tp, 'falsos_positivos': fp,
        'verdadeiros_negativos': tn, 'falsos_negativos': fn,
        'precisao_alertas': divide(tp, tp + fp),
        'sensibilidade': divide(tp, tp + fn),
        'taxa_falsos_positivos': divide(fp, fp + tn),
        'acuracia': (tp + tn) / n,
        'brier': brier / n, 'brier_referencia': brier_ref / n,
        'brier_skill': 1 - brier / brier_ref if brier_ref else None,
        'ambas_classes_presentes': bool(tp + fn) and bool(fp + tn),
        'calibracao': [{'de': f['de'], 'ate': f['ate'], 'n': f['n'],
            'probabilidade_media': divide(f['soma_probabilidades'], f['n']),
            'frequencia_observada': divide(f['ocorrencias'], f['n'])} for f in faixas],
        'limitacao': 'Métricas por janela. Janelas correlacionadas não são eventos independentes; não comprova validade operacional.',
    }
