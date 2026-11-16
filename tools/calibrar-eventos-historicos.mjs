/**
 * Consulta a precipitação HÓRARIA MODELADA (Open-Meteo Archive) no ponto central
 * de Cajamar para episódios históricos documentados. NÃO reproduz pluviômetros
 * CEMADEN nem comprova a chuva em cada bairro, rio ou imóvel.
 * Uso: node tools/calibrar-eventos-historicos.mjs
 * Saída: stdout em JSON; precisa de internet. Nunca usa chave privada.
 */
const EVENTS = [
  {date:'2022-01-03',region:'Centro/Polvilho',reported:'108,8 mm em uma hora no Centro (reportagem/Defesa Civil)',label:'alagamento_reportado'},
  {date:'2022-09-29',region:'Cajamar',reported:'72,5 mm em 24 horas; notícia municipal sem registros de alagamento',label:'sem_alagamento_reportado'},
  {date:'2023-01-04',region:'Jordanésia',reported:'86 mm em duas horas (reportagem/Defesa Civil)',label:'alagamento_reportado'},
  {date:'2023-01-24',region:'Polvilho',reported:'Alagamentos; volume não verificado',label:'alagamento_reportado'},
  {date:'2025-01-29',region:'Jordanésia',reported:'52 mm (janela horária não verificada)',label:'alagamento_reportado'},
  {date:'2025-02-01',region:'Polvilho / Rio Juqueri',reported:'101 mm em seis horas em Cajamar; cheia com contribuição a montante',label:'cheia_reportada'},
  {date:'2026-10-25',region:'Anhanguera',reported:'Alagamento rodoviário; valor local não localizado',label:'alagamento_reportado'},
]
const LAT=-23.3561111, LON=-46.8769444
const maxRolling=(values,n)=>{
  if(values.length<n)return null
  let sum=0,maximum=0
  for(let i=0;i<values.length;i++){
    sum+=values[i]
    if(i>=n)sum-=values[i-n]
    if(i>=n-1)maximum=Math.max(maximum,sum)
  }
  return Math.round(maximum*10)/10
}
async function fetchDay(event){
  const start=new Date(`${event.date}T12:00:00Z`)
  const from=new Date(start.getTime()-86400000).toISOString().slice(0,10)
  const to=new Date(start.getTime()+86400000).toISOString().slice(0,10)
  const url=new URL('https://archive-api.open-meteo.com/v1/archive')
  for(const [k,v] of Object.entries({latitude:String(LAT),longitude:String(LON),start_date:from,end_date:to,hourly:'precipitation',timezone:'America/Sao_Paulo'}))url.searchParams.set(k,v)
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw new Error(`HTTP ${response.status}`)
  const data=await response.json()
  const hours=data.hourly?.time,values=data.hourly?.precipitation
  if(!Array.isArray(hours)||!Array.isArray(values)||hours.length!==values.length)throw new Error('Serie horaria invalida')
  const selected=values.filter((v,i)=>hours[i]?.startsWith(event.date) && typeof v==='number' && v>=0)
  if(selected.length!==24)throw new Error(`Disponiveis ${selected.length}/24 horas modeladas para a data`)
  return {max1h_modelado_mm:maxRolling(selected,1),max3h_modelado_mm:maxRolling(selected,3),max6h_modelado_mm:maxRolling(selected,6),max24h_modelado_mm:maxRolling(selected,24)}
}
let errors=0
const output=[]
for(const event of EVENTS){
  try{output.push({...event,fonte_modelada:'Open-Meteo Historical Weather API',ponto_modelo:{latitude:LAT,longitude:LON},...await fetchDay(event)})}
  catch(e){errors++;output.push({...event,status:'dados_modelados_indisponiveis',erro:String(e).slice(0,140)})}
}
console.log(JSON.stringify({metodo:'Reanálise modelada em grade, não aferição local; comparar com CEMADEN histórico e Defesa Civil antes de calibrar',events:output},null,2))
if(errors)process.exitCode=1
