/**
 * Validação de contatos do morador (Fase 2).
 *
 * Telefone brasileiro com DDD: aceita 10 ou 11 dígitos numéricos,
 * normalizando para armazenamento apenas com dígitos.
 * E-mail: validação mínima de formato.
 *
 * Não simula confirmação de celular nem de e-mail. Se não houver provedor
 * de verificação, o contato permanece como não verificado.
 */

export type TelefoneValidacao = {
  valido: boolean
  digitos: string | null
  ddd: string | null
  numero: string | null
  erro: string | null
}

const DDDS_VALIDOS = new Set([
  '11','12','13','14','15','16','17','18','19',
  '21','22','24','27','28',
  '31','32','33','34','35','37','38',
  '41','42','43','44','45','46','47','48','49',
  '51','53','54','55',
  '61','62','64','63','65','66','67','68','69',
  '71','73','74','75','77',
  '79',
  '81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99',
])

/**
 * Extrai apenas dígitos de uma string de telefone.
 */
function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * Valida e normaliza um telefone brasileiro com DDD.
 *
 * Regras:
 * - 10 ou 11 dígitos numéricos
 * - DDD válido (DDDDD... com os dois primeiros dígitos sendo um DDD real)
 * - Para 11 dígitos (celular com 9), o terceiro dígito deve ser 9
 */
export function validarTelefoneBrasileiro(
  valor: string | null | undefined,
): TelefoneValidacao {
  if (!valor) {
    return { valido: false, digitos: null, ddd: null, numero: null, erro: 'Informe o telefone com DDD.' }
  }

  const digitos = soDigitos(valor)

  if (digitos.length === 0) {
    return { valido: false, digitos: null, ddd: null, numero: null, erro: 'Informe o telefone com DDD.' }
  }

  if (digitos.length < 10 || digitos.length > 11) {
    return {
      valido: false,
      digitos,
      ddd: digitos.slice(0, 2),
      numero: digitos.slice(2),
      erro: 'O telefone deve ter 10 ou 11 dígitos (incluindo o DDD).',
    }
  }

  const ddd = digitos.slice(0, 2)
  if (!DDDS_VALIDOS.has(ddd)) {
    return {
      valido: false,
      digitos,
      ddd,
      numero: digitos.slice(2),
      erro: 'DDD inválido. Informe um DDD brasileiro válido.',
    }
  }

  // Celular com 11 dígitos: o primeiro dígito do número (3º geral) deve ser 9.
  if (digitos.length === 11 && digitos[2] !== '9') {
    return {
      valido: false,
      digitos,
      ddd,
      numero: digitos.slice(2),
      erro: 'Celular com 11 dígitos deve começar com 9 após o DDD.',
    }
  }

  return {
    valido: true,
    digitos,
    ddd,
    numero: digitos.slice(2),
    erro: null,
  }
}

/**
 * Formata um telefone de 10 ou 11 dígitos para exibição: (11) 9999-9999 ou (11) 99999-9999.
 */
export function formatarTelefoneExibicao(digitos: string): string {
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  }
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
  }
  return digitos
}

/**
 * Valida um endereço de e-mail com formato mínimo aceitável.
 */
export function validarEmail(valor: string | null | undefined): {
  valido: boolean
  normalizado: string | null
  erro: string | null
} {
  if (!valor) {
    return { valido: false, normalizado: null, erro: 'Informe o e-mail.' }
  }

  const normalizado = valor.trim().toLowerCase()
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

  if (!emailRegex.test(normalizado)) {
    return { valido: false, normalizado: null, erro: 'Informe um e-mail válido.' }
  }

  if (normalizado.length > 254) {
    return { valido: false, normalizado: null, erro: 'O e-mail é muito longo.' }
  }

  return { valido: true, normalizado, erro: null }
}

/**
 * Valida os campos do formulário de contato. Retorna erros por campo.
 */
export interface ValidacaoContatoResult {
  valido: boolean
  erros: Record<string, string>
}

export function validarFormularioContato(
  values: Partial<{
    nome: string
    tipoContato: TipoContato | string | null | undefined
    telefone: string | null | undefined
    email: string | null | undefined
    consentimento: boolean | null | undefined
    versaoConsentimento: string | null | undefined
  }>,
): ValidacaoContatoResult {
  const erros: Record<string, string> = {}

  const nome = String(values.nome ?? '').trim()
  if (!nome) {
    erros.nome = 'Informe o nome.'
  } else if (nome.length < 2) {
    erros.nome = 'O nome deve ter pelo menos 2 caracteres.'
  } else if (nome.length > 150) {
    erros.nome = 'O nome deve ter no máximo 150 caracteres.'
  }

  const tipoContato = values.tipoContato
  if (!tipoContato || !['celular', 'email', 'outro'].includes(tipoContato)) {
    erros.tipoContato = 'Selecione o tipo de contato.'
  }

  const telefoneValidoParaTipo =
    tipoContato === 'celular' || tipoContato === 'outro'
  const emailValidoParaTipo = tipoContato === 'email'

  const telefoneValidacao = validarTelefoneBrasileiro(
    telefoneValidoParaTipo ? values.telefone : null,
  )
  if (!telefoneValidacao.valido && telefoneValidoParaTipo) {
    erros.telefone = telefoneValidacao.erro ?? 'Telefone inválido.'
  }

  const emailValidacao = validarEmail(
    emailValidoParaTipo ? values.email : null,
  )
  if (!emailValidacao.valido && emailValidoParaTipo) {
    erros.email = emailValidacao.erro ?? 'E-mail inválido.'
  }

  // Pelo menos um meio deve estar preenchido (para o tipo selecionado)
  if (
    !telefoneValidacao.valido &&
    !emailValidacao.valido &&
    telefoneValidoParaTipo !== emailValidoParaTipo
  ) {
    if (!erros.telefone) erros.telefone = 'Informe ao menos um meio de contato.'
    if (!erros.email) erros.email = 'Informe ao menos um meio de contato.'
  }

  // Se tipo é celular, telefone é obrigatório
  if (tipoContato === 'celular' && !telefoneValidacao.valido) {
    erros.telefone = 'O telefone é obrigatório para contato por celular.'
  }

  // Se tipo é email, e-mail é obrigatório
  if (tipoContato === 'email' && !emailValidacao.valido) {
    erros.email = 'O e-mail é obrigatório para contato por e-mail.'
  }

  if (values.consentimento !== true) {
    erros.consentimento = 'É necessário concordar com o recebimento de avisos preventivos.'
  }

  const versaoConsentimento = String(values.versaoConsentimento ?? '').trim()
  if (!versaoConsentimento) {
    erros.versaoConsentimento = 'Versão do consentimento não informada.'
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
  }
}

export type TipoContato = 'celular' | 'email' | 'outro'
