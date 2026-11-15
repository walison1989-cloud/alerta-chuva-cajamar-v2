import { describe, expect, it } from 'vitest'
import {
  validarTelefoneBrasileiro,
  formatarTelefoneExibicao,
  validarEmail,
  validarFormularioContato,
} from '@/lib/contatoValidation'

describe('validarTelefoneBrasileiro', () => {
  it('aceita celular com 11 dígitos e DDD válido', () => {
    const resultado = validarTelefoneBrasileiro('(11) 99999-9999')
    expect(resultado.valido).toBe(true)
    expect(resultado.digitos).toBe('11999999999')
    expect(resultado.ddd).toBe('11')
    expect(resultado.numero).toBe('999999999')
    expect(resultado.erro).toBeNull()
  })

  it('aceita telefone fixo com 10 dígitos e DDD válido', () => {
    const resultado = validarTelefoneBrasileiro('1133334444')
    expect(resultado.valido).toBe(true)
    expect(resultado.digitos).toBe('1133334444')
    expect(resultado.ddd).toBe('11')
    expect(resultado.numero).toBe('33334444')
  })

  it('recusa telefone vazio', () => {
    const resultado = validarTelefoneBrasileiro('')
    expect(resultado.valido).toBe(false)
    expect(resultado.erro).toBe('Informe o telefone com DDD.')
  })

  it('recusa telefone com menos de 10 dígitos', () => {
    const resultado = validarTelefoneBrasileiro('119999999')
    expect(resultado.valido).toBe(false)
    expect(resultado.erro).toContain('10 ou 11 dígitos')
  })

  it('recusa telefone com DDD inválido', () => {
    const resultado = validarTelefoneBrasileiro('00999999999')
    expect(resultado.valido).toBe(false)
    expect(resultado.erro).toContain('DDD inválido')
  })

  it('recusa celular com 11 dígitos sem 9 na terceira posição', () => {
    const resultado = validarTelefoneBrasileiro('11899999999')
    expect(resultado.valido).toBe(false)
    expect(resultado.erro).toContain('9 após o DDD')
  })

  it('normaliza telefone com máscara', () => {
    const resultado = validarTelefoneBrasileiro('(19) 3333-4444')
    expect(resultado.valido).toBe(true)
    expect(resultado.digitos).toBe('1933334444')
  })
})

describe('formatarTelefoneExibicao', () => {
  it('formata celular com 11 dígitos', () => {
    expect(formatarTelefoneExibicao('11999999999')).toBe('(11) 99999-9999')
  })

  it('formata telefone fixo com 10 dígitos', () => {
    expect(formatarTelefoneExibicao('1133334444')).toBe('(11) 3333-4444')
  })
})

describe('validarEmail', () => {
  it('aceita e-mail válido', () => {
    const resultado = validarEmail('joao@email.com')
    expect(resultado.valido).toBe(true)
    expect(resultado.normalizado).toBe('joao@email.com')
    expect(resultado.erro).toBeNull()
  })

  it('normaliza e-mail para minúsculas', () => {
    const resultado = validarEmail('JOAO@EMAIL.COM')
    expect(resultado.valido).toBe(true)
    expect(resultado.normalizado).toBe('joao@email.com')
  })

  it('recusa e-mail vazio', () => {
    const resultado = validarEmail('')
    expect(resultado.valido).toBe(false)
    expect(resultado.erro).toBe('Informe o e-mail.')
  })

  it('recusa e-mail sem @', () => {
    const resultado = validarEmail('joaoemail.com')
    expect(resultado.valido).toBe(false)
    expect(resultado.erro).toBe('Informe um e-mail válido.')
  })

  it('recusa e-mail sem domínio', () => {
    const resultado = validarEmail('joao@')
    expect(resultado.valido).toBe(false)
    expect(resultado.erro).toBe('Informe um e-mail válido.')
  })
})

describe('validarFormularioContato', () => {
  const base = {
    nome: 'João Silva',
    tipoContato: 'celular' as const,
    telefone: '11999999999',
    email: '',
    consentimento: true,
    versaoConsentimento: '1.0',
  }

  it('aceita formulário válido com celular', () => {
    const resultado = validarFormularioContato(base)
    expect(resultado.valido).toBe(true)
    expect(Object.keys(resultado.erros)).toHaveLength(0)
  })

  it('aceita formulário válido com e-mail', () => {
    const resultado = validarFormularioContato({
      ...base,
      tipoContato: 'email' as const,
      telefone: '',
      email: 'joao@email.com',
    })
    expect(resultado.valido).toBe(true)
  })

  it('recusa nome vazio', () => {
    const resultado = validarFormularioContato({ ...base, nome: '' })
    expect(resultado.valido).toBe(false)
    expect(resultado.erros.nome).toBe('Informe o nome.')
  })

  it('recusa nome muito curto', () => {
    const resultado = validarFormularioContato({ ...base, nome: 'J' })
    expect(resultado.valido).toBe(false)
    expect(resultado.erros.nome).toBe('O nome deve ter pelo menos 2 caracteres.')
  })

  it('recusa tipo de contato ausente', () => {
    const resultado = validarFormularioContato({ ...base, tipoContato: undefined })
    expect(resultado.valido).toBe(false)
    expect(resultado.erros.tipoContato).toBe('Selecione o tipo de contato.')
  })

  it('recusa celular sem telefone quando tipo é celular', () => {
    const resultado = validarFormularioContato({ ...base, telefone: '' })
    expect(resultado.valido).toBe(false)
    expect(resultado.erros.telefone).toBeDefined()
  })

  it('recusa e-mail sem valor quando tipo é email', () => {
    const resultado = validarFormularioContato({
      ...base,
      tipoContato: 'email' as const,
      telefone: '',
      email: '',
    })
    expect(resultado.valido).toBe(false)
    expect(resultado.erros.email).toBeDefined()
  })

  it('recusa quando nenhum meio é informado', () => {
    const resultado = validarFormularioContato({
      ...base,
      telefone: '',
      email: '',
    })
    expect(resultado.valido).toBe(false)
  })

  it('recusa sem consentimento', () => {
    const resultado = validarFormularioContato({ ...base, consentimento: false })
    expect(resultado.valido).toBe(false)
    expect(resultado.erros.consentimento).toBeDefined()
  })

  it('recusa sem versão de consentimento', () => {
    const resultado = validarFormularioContato({ ...base, versaoConsentimento: '' })
    expect(resultado.valido).toBe(false)
    expect(resultado.erros.versaoConsentimento).toBeDefined()
  })
})
