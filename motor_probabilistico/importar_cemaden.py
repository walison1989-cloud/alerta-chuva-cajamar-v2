"""Normaliza CSV do CEMADEN, preservando proveniência e sem fabricar acumulados.

O formato e a semântica da coluna valorMedida devem ser confirmados na fonte.
Este importador preserva valores brutos; não os soma ou transforma em rótulos.
"""
import csv
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import math
from motor_probabilistico.treinamento import data_iso


def importar_csv(path, *, baixado_em, fonte_url):
    from urllib.parse import urlparse
    if not isinstance(fonte_url, str):
        raise ValueError('Fonte CEMADEN obrigatória')
    host = urlparse(fonte_url).hostname or ''
    if host != 'cemaden.gov.br' and not host.endswith('.cemaden.gov.br'):
        raise ValueError('Informe a URL oficial da fonte')
    if not isinstance(baixado_em, datetime) or baixado_em.tzinfo is None:
        raise ValueError('Data real de download com fuso obrigatória')
    content = Path(path).read_bytes()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('cp1252')
    reader = csv.DictReader(text.splitlines(), delimiter=';')
    expected = {'municipio', 'codestacao', 'uf', 'latitude', 'longitude', 'datahora', 'valorMedida'}
    if not reader.fieldnames or not expected.issubset(reader.fieldnames):
        raise ValueError('Cabeçalho CSV não reconhecido; confira o formato antes de importar')
    digest = hashlib.sha256(content).hexdigest()
    rows, seen = [], set()
    for row in reader:
        if row['municipio'].strip().casefold() != 'cajamar' or row['uf'].strip().upper() != 'SP':
            continue
        timestamp = row['datahora'].strip()
        date = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        # O download CEMADEN usa UTC; não interpretar como hora local de São Paulo.
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        date = data_iso(date.isoformat())
        if date > baixado_em:
            raise ValueError('Leitura posterior ao download')
        value, lat, lon = (float(row[k].replace(',', '.')) for k in ('valorMedida', 'latitude', 'longitude'))
        if not all(math.isfinite(v) for v in (value, lat, lon)) or value < 0 or not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise ValueError('Medição ou coordenada inválida')
        code = row['codestacao'].strip()
        if not code or (code, date) in seen:
            raise ValueError('Estação ausente ou leitura duplicada; revise a origem')
        seen.add((code, date))
        rows.append({'codigo_estacao': code, 'data_hora': date.isoformat(),
            'valor_bruto': value, 'latitude': lat, 'longitude': lon,
            'fonte': fonte_url, 'arquivo_sha256': digest,
            'baixado_em': baixado_em.isoformat(), 'disponivel_em_historico': None,
            'tipo_medicao': 'nao_confirmado', 'elegivel_treino': False})
    if not rows:
        raise ValueError('Nenhuma leitura de Cajamar/SP no arquivo')
    return rows
