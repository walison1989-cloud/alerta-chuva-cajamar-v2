/** Chuva atual ESTIMADA pela grade Open-Meteo, independente do acumulado 24 h. */
export type SituacaoChuvaAgora='chuva_indicada'|'sem_chuva_indicada'|'indisponivel'
const CHUVA_CODES=new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99])
export function classificarChuvaAgora(
  current: {precipitationMm:number;rainMm:number;weatherCode:number}|null|undefined,
  fetchedAt: number|null|undefined,
  agora=Date.now(),
): SituacaoChuvaAgora {
  if(!current||typeof fetchedAt!=='number'||!Number.isFinite(fetchedAt)||
    fetchedAt>agora||agora-fetchedAt>30*60_000)return 'indisponivel'
  const p=current.precipitationMm
  const r=current.rainMm
  const code=current.weatherCode
  if(!Number.isFinite(p)||p<0||!Number.isFinite(r)||r<0||!Number.isFinite(code))return 'indisponivel'
  return p>0||r>0||CHUVA_CODES.has(code)?'chuva_indicada':'sem_chuva_indicada'
}
