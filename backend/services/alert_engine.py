import os
import datetime

def utc_naive():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from models import Alerta, ContatoAlerta, Bairro, Estacao, MedicaoChuva

logger = logging.getLogger("alerta_chuva.alert_engine")

# Limiares configuráveis (padrões experimentais do projeto acadêmico)
THRESHOLDS = {
    "ATENCAO_MM_H": float(os.getenv("THRESHOLD_ATENCAO_MM_H", "10.0")),
    "ALERTA_MM_H": float(os.getenv("THRESHOLD_ALERTA_MM_H", "25.0")),
    "CRITICO_MM_H": float(os.getenv("THRESHOLD_CRITICO_MM_H", "50.0")),
    "ATENCAO_24H_MM": float(os.getenv("THRESHOLD_ATENCAO_24H_MM", "30.0")),
    "ALERTA_24H_MM": float(os.getenv("THRESHOLD_ALERTA_24H_MM", "50.0")),
    "CRITICO_24H_MM": float(os.getenv("THRESHOLD_CRITICO_24H_MM", "80.0")),
}

CALCULATION_MODE = os.getenv("ALERT_CALCULATION_MODE", "INTERVALO_SOMA")

def classificar_nivel_chuva(precipitacao_horaria_mm: float, acumulado_24h_mm: float) -> str:
    """
    Classifica a condição meteorológica em NORMAL, ATENCAO, ALERTA ou CRITICO
    com base nas regras experimentais paramétricas.
    """
    import math
    if not all(isinstance(v,(int,float)) and math.isfinite(v) and v >= 0 for v in (precipitacao_horaria_mm,acumulado_24h_mm)):
        raise ValueError("Chuva deve ser não negativa e finita")
    if (precipitacao_horaria_mm >= THRESHOLDS["CRITICO_MM_H"] or
        acumulado_24h_mm >= THRESHOLDS["CRITICO_24H_MM"]):
        return "CRITICO"
    elif (precipitacao_horaria_mm >= THRESHOLDS["ALERTA_MM_H"] or
          acumulado_24h_mm >= THRESHOLDS["ALERTA_24H_MM"]):
        return "ALERTA"
    elif (precipitacao_horaria_mm >= THRESHOLDS["ATENCAO_MM_H"] or
          acumulado_24h_mm >= THRESHOLDS["ATENCAO_24H_MM"]):
        return "ATENCAO"
    else:
        return "NORMAL"

def calcular_acumulado_por_modo(medicoes: List[MedicaoChuva], modo: str = "INTERVALO_SOMA") -> Dict[str, float]:
    """
    Calcula o volume conforme o capítulo 14 e 16 da apostila técnica:
    - Se INTERVALO_SOMA: soma das medições horárias individuais.
    - Se ACUMULADO_DIFERENCA: diferença entre a leitura mais recente e a leitura anterior do pluviômetro cumulativo.
    """
    if not medicoes:
        return {"acumulado_mm": 0.0, "modo": modo}

    # Ordenar por data_hora crescente
    medicoes_ordenadas = sorted(medicoes, key=lambda m: m.data_hora)

    if modo == "ACUMULADO_DIFERENCA":
        if len(medicoes_ordenadas) >= 2:
            leitura_recente = float(medicoes_ordenadas[-1].precipitacao_mm)
            leitura_anterior = float(medicoes_ordenadas[-2].precipitacao_mm)
            dif = max(0.0, leitura_recente - leitura_anterior)
            return {
                "acumulado_mm": round(dif, 2),
                "modo": "ACUMULADO_DIFERENCA",
                "leitura_recente": leitura_recente,
                "leitura_anterior": leitura_anterior
            }
        else:
            return {"acumulado_mm": float(medicoes_ordenadas[-1].precipitacao_mm), "modo": modo}
    else:
        # Padrão: soma dos volumes de cada intervalo
        soma = sum(float(m.precipitacao_mm) for m in medicoes_ordenadas)
        return {"acumulado_mm": round(soma, 2), "modo": "INTERVALO_SOMA"}

def avaliar_e_emitir_alerta(
    db: Session,
    id_bairro: int,
    precipitacao_horaria_mm: float,
    acumulado_24h_mm: float,
    suscetivel: bool = True,
    origem: str = "EXPERIMENTAL",
    execucao_simulacao: Optional[str] = None,
    confirmar_transacao: bool = True
) -> Optional[Alerta]:
    """
    Avalia a lógica de decisão do sistema (A = C ∧ S conforme apostila e atividade)
    e registra o alerta na tabela 'alertas' se o nível for ATENCAO, ALERTA ou CRITICO.
    """
    bairro = db.query(Bairro).filter(Bairro.id_bairro == id_bairro).first()
    if not bairro:
        return None

    carregar_configuracao(db)
    nivel = classificar_nivel_chuva(precipitacao_horaria_mm, acumulado_24h_mm)

    # Condição Booleana: C = Chuva acima do limiar; S = Suscetibilidade do local
    # Se nivel for NORMAL ou suscetível for False, não emite alerta de emergência
    if nivel == "NORMAL" or not suscetivel:
        return None

    # Mensagens orientativas preventivas conforme o nível
    mensagens = {
        "ATENCAO": f"Atenção Preventiva: Chuva moderada em {bairro.nome_bairro} ({precipitacao_horaria_mm}mm/h). Observe pontos baixos e redobre o cuidado no trânsito.",
        "ALERTA": f"Alerta de Chuva Forte: Precipitação intensa em {bairro.nome_bairro} ({precipitacao_horaria_mm}mm/h, acumulado 24h: {acumulado_24h_mm}mm). Risco de pontos de alagamento.",
        "CRITICO": f"Alerta Crítico de Tempestade: Volume extremo em {bairro.nome_bairro} ({precipitacao_horaria_mm}mm/h). Risco iminente de alagamentos e transbordamentos. Evite deslocamentos desnecessários."
    }

    mensagem = mensagens.get(nivel, f"Alerta emitido para {bairro.nome_bairro}")

    # Cria o registro na tabela alertas
    alerta = Alerta(
        id_bairro=id_bairro,
        nivel=nivel,
        mensagem=mensagem,
        data_emissao=utc_naive(),
        status="EMITIDO",
        origem=origem,
        execucao_simulacao=execucao_simulacao
    )
    db.add(alerta)
    if confirmar_transacao: db.commit()
    else: db.flush()
    db.refresh(alerta)
    return alerta

def obter_contatos_notificaveis(db: Session, id_bairro: int) -> List[Dict[str, Any]]:
    """
    Obtém os moradores do bairro afetado que CONSENTIRAM explicitamente
    em receber notificações conforme as diretrizes da LGPD (consentimento = TRUE e ativo = TRUE).
    """
    contatos = db.query(ContatoAlerta).filter(
        ContatoAlerta.id_bairro == id_bairro,
        ContatoAlerta.consentimento == True,
        ContatoAlerta.ativo == True
    ).all()

    return [c.to_dict() for c in contatos]


def validar_limiares(values):
    import math
    for value in values.values():
        if not isinstance(value,(int,float)) or not math.isfinite(value) or value<0:
            raise ValueError("Limiares devem ser não negativos e finitos")
    for suffix in ("MM_H","24H_MM"):
        if not values[f"ATENCAO_{suffix}"] < values[f"ALERTA_{suffix}"] < values[f"CRITICO_{suffix}"]:
            raise ValueError("Limiares devem obedecer atenção < alerta < crítico")

def carregar_configuracao(db):
    import json
    from models import ConfiguracaoMotor
    global CALCULATION_MODE
    row=db.get(ConfiguracaoMotor,1)
    if row:
        data=json.loads(row.parametros)
        validar_limiares(data["limiares"])
        THRESHOLDS.update(data["limiares"])
        CALCULATION_MODE=data["modo_calculo"]
    return {"limiares":dict(THRESHOLDS),"modo_calculo":CALCULATION_MODE}

def salvar_configuracao(db,cfg):
    import json
    from models import ConfiguracaoMotor
    from fastapi import HTTPException
    data=carregar_configuracao(db)
    for key,value in cfg.model_dump(exclude_none=True).items():
        if key.startswith("THRESHOLD_"): data["limiares"][key.removeprefix("THRESHOLD_")]=value
        elif key=="ALERT_CALCULATION_MODE": data["modo_calculo"]=value
    try: validar_limiares(data["limiares"])
    except ValueError as error: raise HTTPException(422,str(error)) from None
    row=db.get(ConfiguracaoMotor,1)
    if row: row.parametros=json.dumps(data)
    else: db.add(ConfiguracaoMotor(id=1,parametros=json.dumps(data)))
    db.commit()
    return carregar_configuracao(db)

validar_limiares(THRESHOLDS)
