import datetime

def utc_naive():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

import uuid
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from models import MedicaoChuva, Estacao, Bairro, Alerta
from services.alert_engine import avaliar_e_emitir_alerta, obter_contatos_notificaveis

logger = logging.getLogger("alerta_chuva.simulation")

CENARIOS_SIMULACAO = [
    {
        "id": "chuva_moderada",
        "nome": "Chuva Moderada de Início de Tarde",
        "precipitacao_horaria_mm": 12.0,
        "acumulado_24h_mm": 20.0,
        "nivel_esperado": "ATENCAO",
        "descricao": "Precipitação contínua que satura bueiros em vias com pouco escoamento."
    },
    {
        "id": "pancada_verao",
        "nome": "Pancada Forte de Verão",
        "precipitacao_horaria_mm": 35.0,
        "acumulado_24h_mm": 45.0,
        "nivel_esperado": "ALERTA",
        "descricao": "Chuva torrencial concentrada em 60 minutos, comum entre dezembro e março."
    },
    {
        "id": "tempestade_extrema",
        "nome": "Tempestade Severa com Alagamento",
        "precipitacao_horaria_mm": 65.0,
        "acumulado_24h_mm": 95.0,
        "nivel_esperado": "CRITICO",
        "descricao": "Episódio extremo de tempestade convectiva com alto risco de transbordamento de córregos."
    }
]

def executar_simulacao_chuva(
    db: Session,
    id_bairro: int,
    cenario_id: Optional[str] = None,
    precipitacao_custom_mm: Optional[float] = None,
    acumulado_custom_mm: Optional[float] = None
) -> Dict[str, Any]:
    """
    Executa uma simulação de chuva intensa para um bairro específico,
    inserindo medições com fonte_dado = 'SIMULACAO_CHUVA_INTENSA' e gerando alertas.
    """
    bairro = db.query(Bairro).filter(Bairro.id_bairro == id_bairro).first()
    if not bairro:
        raise ValueError(f"Bairro ID {id_bairro} não encontrado.")

    # Localiza a estação associada ao bairro
    estacao = db.query(Estacao).filter(Estacao.id_bairro == id_bairro).first()
    if not estacao:
        # Se não houver estação específica, usa a primeira disponível
        estacao = db.query(Estacao).first()

    if not estacao:
        raise ValueError("Nenhuma estação cadastrada para simulação.")

    # Define valores de precipitação
    p_horaria = 35.0
    p_acumulada = 50.0
    nome_cenario = "Simulação Personalizada"

    if cenario_id and not any(c["id"] == cenario_id for c in CENARIOS_SIMULACAO):
        raise ValueError("Cenário desconhecido")
    if cenario_id:
        for c in CENARIOS_SIMULACAO:
            if c["id"] == cenario_id:
                p_horaria = c["precipitacao_horaria_mm"]
                p_acumulada = c["acumulado_24h_mm"]
                nome_cenario = c["nome"]
                break

    if precipitacao_custom_mm is not None:
        p_horaria = float(precipitacao_custom_mm)
    if acumulado_custom_mm is not None:
        p_acumulada = float(acumulado_custom_mm)

    import math
    if not all(math.isfinite(v) and v>=0 for v in (p_horaria,p_acumulada)):
        raise ValueError("Chuva inválida")
    execucao_id=str(uuid.uuid4())
    agora = utc_naive()

    # Insere leituras simuladas com carimbo claro de dado fictício
    # 1. Leitura 1 hora antes
    m1 = MedicaoChuva(
        id_estacao=estacao.id_estacao,
        data_hora=agora - datetime.timedelta(hours=1),
        precipitacao_mm=round(p_horaria * 0.4, 2),
        fonte_dado="SIMULACAO_CHUVA_INTENSA",
        data_registro=agora
    )
    # 2. Leitura atual do pico de tempestade
    m2 = MedicaoChuva(
        id_estacao=estacao.id_estacao,
        data_hora=agora,
        precipitacao_mm=round(p_horaria, 2),
        fonte_dado="SIMULACAO_CHUVA_INTENSA",
        data_registro=agora
    )

    db.add_all([m1, m2])
    db.flush()

    # Executa motor de alertas
    alerta_gerado = avaliar_e_emitir_alerta(
        db=db,
        id_bairro=id_bairro,
        precipitacao_horaria_mm=p_horaria,
        acumulado_24h_mm=p_acumulada,
        suscetivel=True,
        origem="SIMULACAO",
        execucao_simulacao=execucao_id,
        confirmar_transacao=False
    )

    db.commit()

    # Identifica moradores elegíveis, sem envio (respeito à LGPD)
    moradores_notificados = obter_contatos_notificaveis(db, id_bairro)

    return {
        "status": "SIMULACAO_CONCLUIDA",
        "execucao_id": execucao_id,
        "cenario": nome_cenario,
        "bairro": bairro.nome_bairro,
        "estacao": estacao.nome_estacao,
        "precipitacao_simulada_mm_h": p_horaria,
        "acumulado_simulado_24h_mm": p_acumulada,
        "fonte_dado_gravada": "SIMULACAO_CHUVA_INTENSA",
        "alerta_emitido": alerta_gerado.to_dict() if alerta_gerado else None,
        "total_moradores_notificados_lgpd": 0,
        "contatos_elegiveis_simulacao": len(moradores_notificados),
        "envio_realizado": False,
        "aviso_academico": "Dados e alerta gerados exclusivamente para fins de validação técnica e simulação didática."
    }

def limpar_dados_simulacao(db: Session) -> Dict[str, Any]:
    """
    Remove todos os registros temporários de simulação da tabela de medições
    e cancela alertas gerados durante a simulação.
    """
    num_medicoes = db.query(MedicaoChuva).filter(
        MedicaoChuva.fonte_dado == "SIMULACAO_CHUVA_INTENSA"
    ).delete(synchronize_session=False)

    # Marca alertas emitidos recentes como RESOLVIDO ou remove simulações
    db.query(Alerta).filter(Alerta.status == "EMITIDO", Alerta.origem == "SIMULACAO", Alerta.execucao_simulacao.isnot(None)).update(
        {"status": "RESOLVIDO"}, synchronize_session=False
    )
    db.commit()

    return {
        "status": "LIMPEZA_SUCESSO",
        "medicoes_simuladas_removidas": num_medicoes,
        "mensagem": "Todos os dados fictícios de simulação foram removidos com sucesso."
    }
