"""Contratos de evidência histórica. Ausência de proveniência nunca vira evidência válida."""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from math import isfinite, radians, sin, cos, asin, sqrt
from typing import Optional

def instante(value):
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        return None
    return value.astimezone(timezone.utc)

def numero_valido(value, minimo=None):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) and (minimo is None or value >= minimo)

def coordenadas_validas(lat, lon):
    return numero_valido(lat) and numero_valido(lon) and -90 <= lat <= 90 and -180 <= lon <= 180

def distancia_km(lat1, lon1, lat2, lon2):
    if not coordenadas_validas(lat1,lon1) or not coordenadas_validas(lat2,lon2):
        return None
    a=sin(radians(lat2-lat1)/2)**2+cos(radians(lat1))*cos(radians(lat2))*sin(radians(lon2-lon1)/2)**2
    return 6371*2*asin(sqrt(min(1,max(0,a))))

@dataclass
class EventoAlagamento:
    id: Optional[int]
    tipo: str
    descricao: Optional[str]
    bairro: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    verificado_em: Optional[datetime]
    publica: bool
    fonte: str
    ocorrido_em: Optional[datetime] = None
    precisao_temporal: str = "desconhecida"
    fonte_temporal: Optional[str] = None
    status: str = "verificada"

    @property
    def eh_verificado(self):
        return self.status == "verificada" and instante(self.verificado_em) is not None

    @property
    def eh_publico(self): return self.publica

@dataclass
class MedicaoChuva:
    id_estacao: Optional[int]
    codigo_estacao: Optional[str]
    data_hora: datetime
    precipitacao_mm: float
    tipo_medicao: Optional[str]
    janela_horas: Optional[int]
    unidade: str
    fonte_dado: str
    qualidade_dado: Optional[str]
    coletado_em: Optional[datetime]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    emitida_em: Optional[datetime] = None
    valido_de: Optional[datetime] = None
    valido_ate: Optional[datetime] = None

    def eh_acumulado_24h(self):
        return self.tipo_medicao == "acumulado_24h" and self.janela_horas == 24

    def eh_intervalo(self): return self.tipo_medicao == "intervalo"

    def observacao_elegivel(self, decisao_em):
        data,coleta,decisao=instante(self.data_hora),instante(self.coletado_em),instante(decisao_em)
        return bool(data and coleta and decisao and data <= coleta <= decisao
            and self.eh_acumulado_24h() and self.unidade == "mm"
            and self.fonte_dado == "CEMADEN" and self.qualidade_dado == "oficial"
            and numero_valido(self.precipitacao_mm,0) and coordenadas_validas(self.latitude,self.longitude))

@dataclass
class VariavelTopografica:
    latitude: float
    longitude: float
    altitude_m: Optional[float]
    declividade_graus: Optional[float]
    elevacao_relativa_m: Optional[float]
    qualidade_dados: str
    fonte: str = "MDT Cajamar (SGB/CPRM+IPT, 2017) - recorte 5 m"

@dataclass
class RegistroCruzado:
    evento_id: Optional[int]
    evento_tipo: Optional[str]
    evento_data: Optional[datetime]
    chuva_observada_24h_antes_mm: Optional[float]
    chuva_prevista_24h_depois_mm: Optional[float]
    estacao_chuva_codigo: Optional[str]
    distancia_estacao_km: Optional[float]
    altitude_m: Optional[float]
    declividade_graus: Optional[float]
    elevacao_relativa_m: Optional[float]
    qualidade_topografica: str
    fonte_chuva: str
    fonte_topografia: str
    decisao_em: Optional[datetime] = None
    observada_em: Optional[datetime] = None
    observada_disponivel_em: Optional[datetime] = None
    previsao_emitida_em: Optional[datetime] = None
    previsao_disponivel_em: Optional[datetime] = None
    previsao_valida_de: Optional[datetime] = None
    previsao_valida_ate: Optional[datetime] = None
    problemas_origem: list[str] = field(default_factory=list)

    def tem_chuva_valida(self): return numero_valido(self.chuva_observada_24h_antes_mm,0)
    def tem_previsao_valida(self): return numero_valido(self.chuva_prevista_24h_depois_mm,0)
    def tem_topografia_valida(self):
        return self.qualidade_topografica in ("boa","limitada") and numero_valido(self.altitude_m)
    def tem_vazamento_temporal(self):
        from motor_probabilistico.consulta_cruzada import verificar_vazamento_temporal
        return bool(verificar_vazamento_temporal(self))

def janela_chuva_antes_evento(medições,evento_data,janela_horas=24,*,latitude=None,longitude=None,raio_km=30,decisao_em=None):
    evento,decisao=instante(evento_data),instante(decisao_em or evento_data)
    if not evento or not decisao or decisao > evento or not coordenadas_validas(latitude,longitude): return None
    if not numero_valido(raio_km,0) or not 0 < janela_horas <= 168: return None
    candidatos=[]
    for m in medições:
        if not m.observacao_elegivel(decisao): continue
        data=instante(m.data_hora)
        distancia=distancia_km(latitude,longitude,m.latitude,m.longitude)
        if evento-timedelta(hours=janela_horas) <= data <= decisao and distancia <= raio_km:
            candidatos.append((distancia,-data.timestamp(),m.codigo_estacao or "",m))
    # Nearest eligible station, most recent record, stable station-code tie break.
    return min(candidatos,key=lambda x:x[:3])[3] if candidatos else None

def validar_registro_sem_valores_ausentes_criticos(registro):
    problemas=list(registro.problemas_origem)
    if instante(registro.evento_data) is None: problemas.append("evento_data ausente")
    if not registro.tem_chuva_valida() and not registro.tem_previsao_valida(): problemas.append("nenhuma fonte de chuva válida")
    if registro.qualidade_topografica == "fora_cobertura": problemas.append("ponto fora da cobertura topográfica")
    elif not registro.tem_topografia_valida(): problemas.append("topografia ausente ou inválida")
    for nome,valor in [("observada",registro.chuva_observada_24h_antes_mm),("prevista",registro.chuva_prevista_24h_depois_mm)]:
        if valor is not None and not numero_valido(valor,0): problemas.append(f"chuva {nome} negativa ou não finita")
    if registro.altitude_m is not None and (not numero_valido(registro.altitude_m) or not -500 <= registro.altitude_m <= 5000):
        problemas.append("altitude fora de faixa física plausível")
    return list(dict.fromkeys(problemas))

def preparar_estrutura_diretorios():
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    return {"mdu_recortado":str(root/"data/processed/mde_cajamar_recortado.tif"),
        "declividade":str(root/"data/processed/declividade_graus.tif"),"elevacao_relativa":str(root/"data/processed/elevacao_relativa.tif"),
        "area_baixa":str(root/"data/processed/area_topograficamente_baixa.tif"),"limite_municipal":str(root/"data/processed/limite_cajamar.geojson"),
        "scripts_preprocessamento":str(root/"scripts/preprocessar_topografia.py"),"supabase_migrations":str(root/"supabase/migrations"),
        "supabase_funcoes_cemaden":str(root/"supabase/functions/sync-cemaden/index.ts"),"supabase_shared_cemaden":str(root/"supabase/functions/_shared/cemaden.ts")}
