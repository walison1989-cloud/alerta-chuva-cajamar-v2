"""Índice ordinal experimental. Não prevê evento nem calcula probabilidade.

IDW estima chuva no ponto; terreno e suscetibilidade alimentam uma hipótese
de regra separada. Nenhum posto de catálogo ou dado sem proveniência é aceito.
"""
from dataclasses import dataclass
from datetime import timedelta
from itertools import combinations
from math import cos, radians
from motor_probabilistico.dados_estruturados import (
    MedicaoChuva, VariavelTopografica, coordenadas_validas, distancia_km,
    instante, numero_valido,
)

VERSAO = 'cruzamento-espacial-exp-v1'


@dataclass(frozen=True)
class Previsao24h:
    mm: float
    emitida_em: object
    disponivel_em: object
    inicio: object
    fim: object
    latitude: float
    longitude: float
    fonte: str = 'Open-Meteo'


@dataclass(frozen=True)
class CartografiaPonto:
    cobertura_confirmada: bool
    contem_ponto: bool | None
    classe: str | None
    tipo: str | None
    fonte: str


def _cercado(latitude, longitude, stations):
    # Local planar orientation is sufficient within the fixed 30 km neighbourhood.
    points = [(s.latitude-latitude, (s.longitude-longitude)*cos(radians(latitude))) for s in stations]
    def cross(a, b): return a[0]*b[1]-a[1]*b[0]
    for a,b,c in combinations(points, 3):
        area = cross((b[0]-a[0],b[1]-a[1]), (c[0]-a[0],c[1]-a[1]))
        if abs(area) < 1e-10: continue
        signs = (cross(a,b), cross(b,c), cross(c,a))
        if min(signs) >= -1e-12 or max(signs) <= 1e-12: return True
    return False


def estimar_chuva(latitude, longitude, medicoes, decisao_em):
    decision = instante(decisao_em)
    if not decision or not coordenadas_validas(latitude, longitude):
        raise ValueError('Ponto e decisão com fuso obrigatórios')
    if len(medicoes) > 10000:
        raise ValueError('Limite de 10000 medições por avaliação')
    rejected = 0
    by_code = {}
    for m in medicoes:
        if not isinstance(m, MedicaoChuva) or not isinstance(m.codigo_estacao,str) or not m.codigo_estacao.strip() or not m.observacao_elegivel(decision):
            rejected += 1; continue
        date = instante(m.data_hora)
        distance = distancia_km(latitude, longitude, m.latitude, m.longitude)
        if decision-date > timedelta(hours=6) or distance > 30:
            rejected += 1; continue
        by_code.setdefault(m.codigo_estacao, []).append(m)
    eligible = []
    for code in sorted(by_code):
        rows = by_code[code]
        latest = max(instante(m.data_hora) for m in rows)
        latest_rows = [m for m in rows if instante(m.data_hora) == latest]
        values = {(m.precipitacao_mm, m.latitude, m.longitude) for m in latest_rows}
        if len(values) != 1:
            rejected += len(rows); continue
        eligible.append(latest_rows[0])
    if eligible:
        latest = max(instante(m.data_hora) for m in eligible)
        aligned = [m for m in eligible if latest-instante(m.data_hora) <= timedelta(hours=1)]
        rejected += len(eligible)-len(aligned)
        eligible = aligned
    # Co-located gauges do not add independent spatial support.
    selected, positions = [], set()
    for m in sorted(eligible, key=lambda m:(distancia_km(latitude,longitude,m.latitude,m.longitude),m.codigo_estacao)):
        pos = (round(m.latitude, 6), round(m.longitude, 6))
        if pos in positions: continue
        positions.add(pos); selected.append(m)
        if len(selected) == 10: break
    result = {'mm_estimados': None, 'metodo': 'sem_dados', 'suporte_espacial': False,
              'estacoes': [], 'descartadas': rejected, 'amplitude_mm': None}
    if not selected: return result
    distances = [distancia_km(latitude,longitude,m.latitude,m.longitude) for m in selected]
    if distances[0] <= .005:
        selected, distances = selected[:1], distances[:1]
        weights = [1.]
        result.update(metodo='leitura_no_ponto', suporte_espacial=True)
    else:
        # Scale by the nearest distance to avoid overflow for very short distances.
        raw = [(distances[0]/d)**2 for d in distances]
        weights = [w/sum(raw) for w in raw]
        inside = _cercado(latitude,longitude,selected)
        result.update(metodo='idw_interpolacao' if inside else 'idw_extrapolacao', suporte_espacial=inside)
    result['mm_estimados'] = sum(m.precipitacao_mm*w for m,w in zip(selected,weights))
    result['amplitude_mm'] = max(m.precipitacao_mm for m in selected)-min(m.precipitacao_mm for m in selected)
    result['estacoes'] = [{'codigo': m.codigo_estacao, 'fonte': m.fonte_dado,
        'distancia_km': d, 'peso': w, 'mm': m.precipitacao_mm,
        'leitura_em': instante(m.data_hora).isoformat(),
        'disponivel_em': instante(m.coletado_em).isoformat()} for m,d,w in zip(selected,distances,weights)]
    return result


def avaliar_cruzamento(latitude, longitude, medicoes, previsao, terreno, cartografia, *, decisao_em):
    decision = instante(decisao_em)
    observed = estimar_chuva(latitude,longitude,medicoes,decision)
    missing, factors = [], []
    forecast_mm = None
    if isinstance(previsao, Previsao24h):
        issue, available, start, end = map(instante, [previsao.emitida_em,previsao.disponivel_em,previsao.inicio,previsao.fim])
        distance = distancia_km(latitude,longitude,previsao.latitude,previsao.longitude)
        if (issue and available and start and end and issue <= available <= decision
            and decision-issue <= timedelta(hours=6) and start == decision and end-start == timedelta(hours=24)
            and previsao.fonte == 'Open-Meteo' and numero_valido(previsao.mm,0)
            and distance is not None and distance <= 10):
            forecast_mm = previsao.mm
    if observed['mm_estimados'] is None: missing.append('chuva_observada_valida')
    elif not observed['suporte_espacial']: missing.append('estacoes_nao_cercam_ponto')
    if forecast_mm is None: missing.append('previsao_valida_para_proximas_24h')
    topo_ok = (isinstance(terreno, VariavelTopografica)
        and terreno.qualidade_dados in ('boa','limitada') and isinstance(terreno.fonte,str) and bool(terreno.fonte.strip())
        and numero_valido(terreno.declividade_graus,0) and terreno.declividade_graus <= 90
        and numero_valido(terreno.elevacao_relativa_m)
        and (distancia_km(latitude,longitude,terreno.latitude,terreno.longitude) or 0) <= .01
        and coordenadas_validas(terreno.latitude,terreno.longitude))
    if not topo_ok: missing.append('terreno_valido_no_ponto')
    carto_ok = (isinstance(cartografia, CartografiaPonto) and cartografia.cobertura_confirmada is True
        and type(cartografia.contem_ponto) is bool and isinstance(cartografia.fonte,str) and bool(cartografia.fonte.strip())
        and (cartografia.contem_ponto is False or
             (cartografia.tipo in ('inundacao','enxurrada') and cartografia.classe in ('Alta','Media','Baixa','Enxurrada'))))
    if not carto_ok: missing.append('cobertura_cartografica_confirmada')
    terrain_low = bool(topo_ok and terreno.elevacao_relativa_m < -5 and terreno.declividade_graus <= 5)
    susceptibility = {'Alta':3,'Media':2,'Baixa':1,'Enxurrada':3}.get(cartografia.classe,0) if carto_ok and cartografia.contem_ponto else 0
    if topo_ok: factors.append({'fator':'terreno_baixo_e_pouco_inclinado','presente':terrain_low,
        'declividade_graus':terreno.declividade_graus,'elevacao_relativa_m':terreno.elevacao_relativa_m,'fonte':terreno.fonte})
    if carto_ok: factors.append({'fator':'suscetibilidade','contem_ponto':cartografia.contem_ponto,'classe':cartografia.classe,'fonte':cartografia.fonte})
    score = None
    if not missing:
        # Distinct past/future windows are NOT added together.
        magnitude = max(observed['mm_estimados'], forecast_mm)
        rain_level = 0 if magnitude == 0 else 1 if magnitude <= 10 else 2 if magnitude <= 30 else 3
        score = 3 if susceptibility >= 2 and rain_level >= 2 else 2 if (susceptibility >= 2 and rain_level >= 1) or (susceptibility >= 1 and rain_level >= 2) or rain_level >= 3 or (terrain_low and rain_level >= 2) else 1 if terrain_low and rain_level >= 1 else 0
        factors.append({'fator':'maior_magnitude_entre_janelas','mm':magnitude,'faixa_chuva':rain_level})
    return {'versao':VERSAO,'decisao_em':decision.isoformat(),'horizonte_horas':24,
        'indice_ordinal_0_a_3':score, 'nivel':'dados_insuficientes' if score is None else
            ('sem_sinal_nesta_regra','sinal_fraco_experimental','atencao_experimental','atencao_forte_experimental')[score],
        'probabilidade_alagamento':None,'calibrado':False,
        'qualidade':'insuficiente' if missing else 'limitada_sem_validacao_local',
        'chuva_observada':observed,'chuva_prevista_24h_mm':forecast_mm,
        'dados_ausentes_ou_limitantes':missing,'fatores':factors,
        'limiares_experimentais':{'chuva_mm':[0,10,30],'elevacao_relativa_menor_que_m':-5,'declividade_max_graus':5},
        'limitacoes':['Não é previsão de ocorrência, probabilidade ou alerta oficial.',
            'Sem sinal nesta regra não significa ausência de risco.',
            'IDW estima chuva; não simula drenagem, nível de rio, impermeabilização ou escoamento.',
            'Limiares são hipóteses experimentais não calibradas para Cajamar.',
            'Acumulado de 24h não é intensidade horária.'],
        'envia_alerta':False}
