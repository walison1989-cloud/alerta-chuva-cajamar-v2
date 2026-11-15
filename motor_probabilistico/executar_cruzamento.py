"""Execução offline com JSON privado. Não consulta ou modifica Supabase."""
import argparse
from datetime import datetime
import json
from pathlib import Path
from motor_probabilistico.cruzamento_espacial import Previsao24h, CartografiaPonto, avaliar_cruzamento
from motor_probabilistico.dados_estruturados import MedicaoChuva, VariavelTopografica, instante


def date(value):
    parsed = instante(datetime.fromisoformat(value.replace('Z','+00:00'))) if isinstance(value,str) else None
    if parsed is None: raise ValueError('Data com fuso obrigatória')
    return parsed


def avaliar_documento(doc, *, usar_mdt_local=False):
    if not isinstance(doc,dict) or doc.get('schema') != 1:
        raise ValueError('Contrato JSON schema=1 obrigatório')
    decision=date(doc['decisao_em'])
    rows=doc['medicoes']
    if not isinstance(rows,list) or len(rows)>10000: raise ValueError('Lista de medições inválida')
    rain=[]
    for row in rows:
        rain.append(MedicaoChuva(row.get('id_estacao'),row.get('codigo_estacao'),date(row['data_hora']),
            row.get('precipitacao_mm'),row.get('tipo_medicao'),row.get('janela_horas'),
            row.get('unidade',''),row.get('fonte_dado',''),row.get('qualidade_dado'),
            date(row['coletado_em']) if row.get('coletado_em') else None,
            latitude=row.get('latitude'),longitude=row.get('longitude')))
    forecast=None
    if doc.get('previsao') is not None:
        p=dict(doc['previsao'])
        for key in ('emitida_em','disponivel_em','inicio','fim'): p[key]=date(p[key])
        forecast=Previsao24h(**p)
    cart=CartografiaPonto(**doc['cartografia']) if doc.get('cartografia') is not None else None
    if usar_mdt_local:
        from motor_probabilistico.integracao_etapa5_2 import avaliar_cruzamento_ponto
        return avaliar_cruzamento_ponto(doc['latitude'],doc['longitude'],rain,forecast,cart,decisao_em=decision)
    terrain=VariavelTopografica(**doc['terreno']) if doc.get('terreno') is not None else None
    return avaliar_cruzamento(doc['latitude'],doc['longitude'],rain,forecast,terrain,cart,decisao_em=decision)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entrada',required=True)
    parser.add_argument('--saida',required=True)
    parser.add_argument('--usar-mdt-local',action='store_true')
    args=parser.parse_args()
    try:
        path=Path(args.entrada)
        if path.stat().st_size>5_000_000: raise ValueError('Arquivo grande demais')
        doc=json.loads(path.read_text(encoding='utf-8-sig'))
        result=avaliar_documento(doc,usar_mdt_local=args.usar_mdt_local)
        target=Path(args.saida)
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open('x',encoding='utf-8') as f:
            json.dump(result,f,ensure_ascii=False,indent=2,allow_nan=False)
    except (ValueError,KeyError,TypeError,OSError,AttributeError):
        print(json.dumps({'status':'nao_executado','orientacao':'Confira contrato e saída inédita em docs/CRUZAMENTO_ESPACIAL.md. Nenhum dado privado é impresso.'}))
        return 2
    print(json.dumps({'status':'avaliacao_local_experimental','nivel':result['nivel'],'envia_alerta':False}))
    return 0


if __name__=='__main__': raise SystemExit(main())
