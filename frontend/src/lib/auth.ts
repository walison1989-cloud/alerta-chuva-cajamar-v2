import { getSupabaseClient } from '@/lib/supabase'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export class AuthNotConfiguredError extends AuthError {
  constructor() {
    super(
      'O Supabase Auth ainda não está configurado neste ambiente. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    )
    this.name = 'AuthNotConfiguredError'
  }
}

export interface SignUpInput {
  nome: string
  email: string
  password: string
  consentimentoLgpd: boolean
}

function requireClient() {
  const client = getSupabaseClient()
  if (!client) throw new AuthNotConfiguredError()
  return client
}

function currentOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

function translateAuthMessage(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.'
  }
  if (normalized.includes('user already registered')) {
    return 'Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.'
  }
  if (normalized.includes('password should be at least')) {
    return 'A senha é curta demais. Use pelo menos 8 caracteres.'
  }
  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
  }
  if (normalized.includes('signups not allowed')) {
    return 'O cadastro está desativado neste projeto Supabase.'
  }
  if (normalized.includes('email address') && normalized.includes('invalid')) {
    return 'Informe um endereço de e-mail válido.'
  }
  if (normalized.includes('same password')) {
    return 'A nova senha precisa ser diferente da senha atual.'
  }

  return 'Não foi possível concluir a operação de conta. Tente novamente.'
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('Informe um endereço de e-mail válido.')
  }
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new AuthError('A senha deve ter pelo menos 8 caracteres.')
  }
}

export async function signUpWithPassword({
  nome,
  email,
  password,
  consentimentoLgpd,
}: SignUpInput): Promise<{ needsEmailConfirmation: boolean }> {
  const client = requireClient()
  const normalizedEmail = normalizeEmail(email)
  const normalizedName = nome.trim()

  if (normalizedName.length < 2) {
    throw new AuthError('Informe seu nome com pelo menos 2 caracteres.')
  }
  validateEmail(normalizedEmail)
  validatePassword(password)
  if (!consentimentoLgpd) {
    throw new AuthError(
      'É necessário aceitar o aviso de privacidade para criar a conta.',
    )
  }

  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        nome: normalizedName,
        consentimento_lgpd: true,
      },
      emailRedirectTo: `${currentOrigin()}/entrar?confirmado=1`,
    },
  })

  if (error) throw new AuthError(translateAuthMessage(error.message))

  return { needsEmailConfirmation: data.session === null }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const client = requireClient()
  const normalizedEmail = normalizeEmail(email)
  validateEmail(normalizedEmail)

  if (!password) throw new AuthError('Informe sua senha.')

  const { error } = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) throw new AuthError(translateAuthMessage(error.message))
}

export async function signOut(): Promise<void> {
  const client = requireClient()
  const { error } = await client.auth.signOut()
  if (error) {
    throw new AuthError('Não foi possível encerrar a sessão. Tente novamente.')
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const client = requireClient()
  const normalizedEmail = normalizeEmail(email)
  validateEmail(normalizedEmail)

  const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${currentOrigin()}/redefinir-senha`,
  })

  if (error) throw new AuthError(translateAuthMessage(error.message))
}

export async function updatePassword(password: string): Promise<void> {
  const client = requireClient()
  validatePassword(password)

  const { error } = await client.auth.updateUser({ password })
  if (error) throw new AuthError(translateAuthMessage(error.message))
}
