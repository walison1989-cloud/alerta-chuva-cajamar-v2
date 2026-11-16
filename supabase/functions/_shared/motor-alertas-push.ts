/** Núcleo puro do envio PUSH. Limiares experimentais, NÃO hidrológicos. */
export interface RegistroEstacao {
  codigo_estacao?: string
  ativa?: boolean
  validada?: boolean
  latitude?: number
  longitude?: number
  fonte?: string
  chuva_acumulada_mm?: number | null
  ultima_leitura_em?: string | null
  tipo_medicao?: string | null
  janela_horas?: number | null
  unidade?: string | null
  qualidade_dado?: string | null
}
export interface Ponto { latitude: number; longitude: number }
export interface ChuvaTriangulada {
  chuvaMm24h: number | null
  quantidadeEstacoes: number
  estacoes: string[]
}

const RAD = Math.PI / 180
const metrosPorGrau = 111.195
function distKm(a: Ponto, b: Ponto): number {
  const dlat = (b.latitude-a.latitude)*RAD
  const dlon = (b.longitude-a.longitude)*RAD
  const h = Math.sin(dlat/2)**2 + Math.cos(a.latitude*RAD)*Math.cos(b.latitude*RAD)*Math.sin(dlon/2)**2
  return 12742.0176 * Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)))
}
function pesos(p: Ponto, a: Ponto, b: Ponto, c: Ponto): [number,number,number] | null {
  const xy = (s: Ponto) => [(s.longitude-p.longitude)*metrosPorGrau*Math.cos(p.latitude*RAD), (s.latitude-p.latitude)*metrosPorGrau] as const
  const [ax,ay]=xy(a), [bx,by]=xy(b),[cx,cy]=xy(c)
  const det = (by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
  if(Math.abs(det)<0.05) return null
  const u=((by-cy)*(-cx)+(cx-bx)*(-cy))/det
  const v=((cy-ay)*(-cx)+(ax-cx)*(-cy))/det
  const w=1-u-v
  if(Math.min(u,v,w)<-1e-9)return null
  const vv=[Math.max(0,u),Math.max(0,v),Math.max(0,w)]
  const sum=vv[0]+vv[1]+vv[2]
  return [vv[0]/sum,vv[1]/sum,vv[2]/sum]
}
/** Mesmo critério essencial do navegador: três CEMADEN que cercam o ponto. */
export function triangularChuvaServidor(p: Ponto, registros: RegistroEstacao[], agora: number): ChuvaTriangulada {
  const vazio:ChuvaTriangulada={chuvaMm24h:null,quantidadeEstacoes:0,estacoes:[]}
  const usados=new Set<string>()
  const validos=registros.flatMap(r=>{
    if (r.ativa !== true || r.validada !== true ||
      !r.codigo_estacao || r.fonte?.trim().toUpperCase()!=='CEMADEN' ||
      r.tipo_medicao!=='acumulado_24h' || r.janela_horas!==24 || r.unidade!=='mm' || r.qualidade_dado!=='oficial' ||
      typeof r.latitude!=='number'||typeof r.longitude!=='number'||typeof r.chuva_acumulada_mm!=='number'||
      !Number.isFinite(r.chuva_acumulada_mm)||r.chuva_acumulada_mm<0 ||
      !Number.isFinite(r.latitude)||!Number.isFinite(r.longitude)) return []
    const timestamp=Date.parse(r.ultima_leitura_em??'')
    if(!Number.isFinite(timestamp)||timestamp>agora||agora-timestamp>6*3_600_000)return []
    const distance=distKm(p,{latitude:r.latitude,longitude:r.longitude})
    if(distance>30)return []
    return [{r, timestamp, distance}]
  }).sort((a,b)=>b.timestamp-a.timestamp||a.distance-b.distance)
  const dedupCodigo=new Set<string>()
  const candidatos=validos.filter(x=>{
    const loc=`${x.r.latitude!.toFixed(5)},${x.r.longitude!.toFixed(5)}`
    if(dedupCodigo.has(x.r.codigo_estacao!)||usados.has(loc))return false
    dedupCodigo.add(x.r.codigo_estacao!);usados.add(loc);return true
  }).sort((a,b)=>a.distance-b.distance)
  const direto=candidatos.find(x=>x.distance<=0.1)
  if(direto)return {chuvaMm24h:direto.r.chuva_acumulada_mm!,quantidadeEstacoes:1,estacoes:[direto.r.codigo_estacao!]}
  const pool=candidatos.slice(0,18)
  let melhor: {a:number;b:number;c:number;pesos:[number,number,number];farthestKm:number;sumKm:number}|null=null
  for(let i=0;i<pool.length-2;i++)for(let j=i+1;j<pool.length-1;j++)for(let k=j+1;k<pool.length;k++){
    const a=pool[i],b=pool[j],c=pool[k]
    if(Math.max(a.distance,b.distance,c.distance)>15)continue
    if(Math.max(a.timestamp,b.timestamp,c.timestamp)-Math.min(a.timestamp,b.timestamp,c.timestamp)>3_600_000)continue
    const ps=pesos(p,a.r as Ponto,b.r as Ponto,c.r as Ponto)
    if(!ps)continue
    const farthestKm=Math.max(a.distance,b.distance,c.distance)
    const sumKm=a.distance+b.distance+c.distance
    if(!melhor||farthestKm<melhor.farthestKm-1e-9||
      (Math.abs(farthestKm-melhor.farthestKm)<=1e-9&&sumKm<melhor.sumKm))
      melhor={a:i,b:j,c:k,pesos:ps,farthestKm,sumKm}
  }
  if(!melhor)return vazio
  const ids=[melhor.a,melhor.b,melhor.c]
  const medidas=ids.map(i=>pool[i].r.chuva_acumulada_mm!)
  const mean=medidas.reduce((a,b)=>a+b,0)/3
  const diff=Math.max(...medidas)-Math.min(...medidas)
  if(diff>35&&diff>1.5*Math.max(5,mean))return vazio
  const mm=medidas.reduce((sum,value,i)=>sum+value*melhor!.pesos[i],0)
  return {chuvaMm24h:Math.round(mm*10)/10,quantidadeEstacoes:3,estacoes:ids.map(i=>pool[i].r.codigo_estacao!)}
}

export type CategoriaChuva = 'nenhuma'|'chuva_fraca'|'chuva_forte'
export function classificarAvisoChuva(prevista24h: number|null, pico3h: number|null, observada24h: number|null): CategoriaChuva {
  const valid=(n:number|null)=>typeof n==='number'&&Number.isFinite(n)&&n>=0
  if(!valid(prevista24h))return 'nenhuma' // previsão obrigatória no MVP de push
  if(prevista24h!>=30||(valid(pico3h)&&pico3h!>=20)||(valid(observada24h)&&observada24h!>=30))return 'chuva_forte'
  if(prevista24h!>=5||(valid(pico3h)&&pico3h!>=5)||(valid(observada24h)&&observada24h!>=5))return 'chuva_fraca'
  return 'nenhuma'
}
