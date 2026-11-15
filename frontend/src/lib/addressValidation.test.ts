import { describe, expect, it } from 'vitest'
import {
  formatCep,
  isWithinCajamarArea,
  isValidCep,
  isValidCoordinate,
  normalizeAddressValues,
  normalizeCep,
  validateAddress,
} from '@/lib/addressValidation'

const validValues = {
  cep: '07750-000',
  logradouro: 'Rua de Teste',
  numero: '10',
  bairro: 'Centro',
  complemento: '',
  municipio: 'Cajamar',
  uf: 'sp',
}

const validCoordinates = {
  latitude: -23.3561111,
  longitude: -46.8769444,
}

describe('validação de endereço', () => {
  it('normaliza o CEP para oito dígitos e formata para exibição', () => {
    expect(normalizeCep('07750-000')).toBe('07750000')
    expect(normalizeCep('077.500-000')).toBe('07750000')
    expect(formatCep('07750000')).toBe('07750-000')
    expect(isValidCep('07750-000')).toBe(true)
    expect(isValidCep('123')).toBe(false)
  })

  it('normaliza espaços e UF em maiúsculas', () => {
    expect(
      normalizeAddressValues({
        ...validValues,
        logradouro: '  Rua de Teste  ',
        uf: ' sp ',
      }),
    ).toEqual({
      ...validValues,
      cep: '07750000',
      logradouro: 'Rua de Teste',
      uf: 'SP',
    })
  })

  it('aceita um endereço completo com coordenadas e consentimento', () => {
    const result = validateAddress(validValues, validCoordinates, true)
    expect(result.errors).toEqual({})
    expect(result.warnings).toEqual([])
  })

  it('rejeita CEP inválido, campos vazios e falta de consentimento', () => {
    const result = validateAddress(
      {
        cep: '123',
        logradouro: 'R',
        numero: '',
        bairro: '',
        complemento: '',
        municipio: '',
        uf: 'S',
      },
      { latitude: null, longitude: null },
      false,
    )

    expect(result.errors.cep).toBeDefined()
    expect(result.errors.logradouro).toBeDefined()
    expect(result.errors.numero).toBeDefined()
    expect(result.errors.bairro).toBeDefined()
    expect(result.errors.municipio).toBeDefined()
    expect(result.errors.uf).toBeDefined()
    expect(result.errors.coordenadas).toBeDefined()
    expect(result.errors.consentimento).toBeDefined()
  })

  it('valida os limites das coordenadas geográficas', () => {
    expect(isValidCoordinate(-23.35, -46.87)).toBe(true)
    expect(isValidCoordinate(91, 0)).toBe(false)
    expect(isValidCoordinate(0, 181)).toBe(false)
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false)

    const result = validateAddress(
      validValues,
      { latitude: 120, longitude: -46.87 },
      true,
    )
    expect(result.errors.coordenadas).toContain('coordenadas são inválidas')
  })

  it('avisa quando o ponto está fora da área estimada de Cajamar', () => {
    expect(isWithinCajamarArea(-23.3561111, -46.8769444)).toBe(true)
    expect(isWithinCajamarArea(0, 0)).toBe(false)

    const result = validateAddress(validValues, { latitude: 0, longitude: 0 }, true)
    expect(result.errors.coordenadas).toBeUndefined()
    expect(result.warnings.join(' ')).toContain('fora da área estimada')
  })
})
