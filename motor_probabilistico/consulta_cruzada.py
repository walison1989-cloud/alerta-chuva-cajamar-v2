"""Cruzamento histórico conservador: data do evento e disponibilidade real são obrigatórias."""
from datetime import timedelta
from motor_probabilistico.dados_estruturados import (
    EventoAlagamento,MedicaoChuva,RegistroCruzado,VariavelTopografica,
    instante,numero_valido,coordenadas_validas,distancia_km,janela_chuva_antes_evento,
    validar_registro_sem_valores_ausentes_criticos,
)

def montar_registro_cruzado(evento,medições_chuva,previsoes_chuva,topografia,
    janela_observada_horas=24,janela_prevista_horas=24,*,decisao_em=None,raio_estacao_km=30):
    data=instante(evento.ocorrido_em)
    decisao=instante(decisao_em or evento.ocorrido_em)
    problemas=[]
    if not evento.eh_verificado: problemas.append("evento não verificado")
    if not evento.fonte_temporal or evento.precisao_temporal != "instante": problemas.append("proveniência temporal insuficiente")
    if not coordenadas_validas(evento.latitude,evento.longitude): problemas.append("localização do evento inválida")
    if janela_observada_horas != 24 or janela_prevista_horas != 24:
        raise ValueError("Este contrato de acumulado exige janelas de 24 horas")
    if not numero_valido(raio_estacao_km,0) or raio_estacao_km > 100:
        raise ValueError("Raio deve estar entre 0 e 100 km")
    m=None;prev=None
    if data and decisao and decisao <= data and not problemas:
        m=janela_chuva_antes_evento(medições_chuva,data,janela_observada_horas,latitude=evento.latitude,
            longitude=evento.longitude,decisao_em=decisao,raio_km=raio_estacao_km)
        candidatos=[]
        for p in previsoes_chuva:
            emissao,coleta,inicio,fim=map(instante,[p.emitida_em,p.coletado_em,p.valido_de,p.valido_ate])
            dist=distancia_km(evento.latitude,evento.longitude,p.latitude,p.longitude)
            if (emissao and coleta and inicio and fim and emissao <= coleta <= decisao
                and inicio == data and fim == data+timedelta(hours=janela_prevista_horas)
                and p.tipo_medicao == "previsao_acumulado_24h" and p.janela_horas == janela_prevista_horas
                and p.fonte_dado == "Open-Meteo" and p.unidade == "mm"
                and p.qualidade_dado == "modelo" and numero_valido(p.precipitacao_mm,0)
                and dist is not None and dist <= raio_estacao_km):
                candidatos.append((-emissao.timestamp(),dist,p))
        if candidatos: prev=min(candidatos,key=lambda x:x[:2])[2]
    return RegistroCruzado(evento.id,evento.tipo,data,m.precipitacao_mm if m else None,
        prev.precipitacao_mm if prev else None,m.codigo_estacao if m else None,
        distancia_km(evento.latitude,evento.longitude,m.latitude,m.longitude) if m else None,
        topografia.altitude_m,topografia.declividade_graus,topografia.elevacao_relativa_m,
        topografia.qualidade_dados,"CEMADEN / Open-Meteo com disponibilidade histórica",topografia.fonte,
        decisao_em=decisao,observada_em=instante(m.data_hora) if m else None,
        observada_disponivel_em=instante(m.coletado_em) if m else None,
        previsao_emitida_em=instante(prev.emitida_em) if prev else None,
        previsao_disponivel_em=instante(prev.coletado_em) if prev else None,
        previsao_valida_de=instante(prev.valido_de) if prev else None,
        previsao_valida_ate=instante(prev.valido_ate) if prev else None,problemas_origem=problemas)

def verificar_vazamento_temporal(registro):
    problemas=[]
    data,decisao=instante(registro.evento_data),instante(registro.decisao_em)
    if not data or not decisao: return ["instantes do evento/decisão ausentes ou sem fuso"]
    if decisao > data: problemas.append("decisão posterior ao evento")
    if registro.chuva_observada_24h_antes_mm is not None:
        leitura,coleta=instante(registro.observada_em),instante(registro.observada_disponivel_em)
        if not leitura or not coleta or not leitura <= coleta <= decisao: problemas.append("chuva observada indisponível na decisão")
    if registro.chuva_prevista_24h_depois_mm is not None:
        emissao,coleta,inicio,fim=map(instante,[registro.previsao_emitida_em,registro.previsao_disponivel_em,registro.previsao_valida_de,registro.previsao_valida_ate])
        if not emissao or not coleta or not emissao <= coleta <= decisao: problemas.append("previsão emitida/coletada após a decisão ou sem proveniência")
        if not inicio or not fim or inicio != data or fim <= inicio: problemas.append("janela de previsão inválida")
    return problemas

def cruzar_lista_eventos(eventos,medições_chuva,previsoes_chuva,funcao_topografia):
    return [montar_registro_cruzado(e,medições_chuva,previsoes_chuva,funcao_topografia(e.latitude,e.longitude))
        for e in eventos if coordenadas_validas(e.latitude,e.longitude)]

def filtrar_registros_validos(registros):
    validos=[];invalidos=[]
    for r in registros:
        problemas=list(dict.fromkeys(validar_registro_sem_valores_ausentes_criticos(r)+verificar_vazamento_temporal(r)))
        if problemas: invalidos.append((r,problemas))
        else: validos.append(r)
    return validos,invalidos
