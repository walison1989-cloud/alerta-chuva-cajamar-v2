import { describe, expect, it } from 'vitest'
import { canonicalJson, sha256Hex } from '@/lib/canonicalHash'

describe('sha256Hex', () => {
  it('calcula o hash conhecido de uma string ASCII', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('lida com acentos e emoji em UTF-8', () => {
    expect(sha256Hex('chuva em Cajamar 🌧️')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('canonicalJson', () => {
  it('ordena chaves e descarta undefined', () => {
    const left = canonicalJson({ b: 2, a: 1, c: undefined })
    const right = canonicalJson({ a: 1, b: 2 })

    expect(left).toBe(right)
    expect(left).toBe('{"a":1,"b":2}')
  })

  it('é determinístico para arrays e objetos aninhados', () => {
    const value = {
      z: [{ b: true, a: 'x' }],
      a: { y: null, x: 1 },
    }

    expect(canonicalJson(value)).toBe(
      '{"a":{"x":1,"y":null},"z":[{"a":"x","b":true}]}',
    )
    expect(sha256Hex(canonicalJson(value))).toBe(
      sha256Hex(canonicalJson({ a: { x: 1, y: null }, z: [{ a: 'x', b: true }] })),
    )
  })

  it('rejeita números não finitos', () => {
    expect(() => canonicalJson({ valor: Number.NaN })).toThrow(
      'Valor numérico inválido',
    )
  })
})
