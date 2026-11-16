import { describe, expect, it } from 'vitest'
import { classificarChuvaAgora } from './chuvaAgora'
const agora = Date.parse('2026-11-16T12:00:00Z')
const base={precipitationMm:0,rainMm:0,weatherCode:3}
describe('situação da chuva atual',()=>{
  it('não depende da chuva acumulada nas 24 horas',()=>expect(classificarChuvaAgora({...base,precipitationMm:0.1},agora-1000,agora)).toBe('chuva_indicada'))
  it('aceita código de chuva mesmo com 0.0 mm arredondado',()=>expect(classificarChuvaAgora({...base,weatherCode:61},agora-1000,agora)).toBe('chuva_indicada'))
  it('não afirma ausência de chuva com modelo antigo',()=>expect(classificarChuvaAgora(base,agora-31*60000,agora)).toBe('indisponivel'))
  it('sem chuva indicada não equivale a segurança',()=>expect(classificarChuvaAgora(base,agora-1000,agora)).toBe('sem_chuva_indicada'))
  it('ausência de modelo fica indisponível',()=>expect(classificarChuvaAgora(null,null,agora)).toBe('indisponivel'))
})
