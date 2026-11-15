import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  UserRound,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SupabaseSetupNotice } from '@/components/auth/SupabaseSetupNotice'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import {
  AuthError,
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
} from '@/lib/auth'

type Mode = 'login' | 'signup' | 'recovery'

const FIELD_CLASS =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/meu-endereco'
  }
  return value
}

export function LoginPage() {
  useDocumentTitle('Entrar')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isConfigured, isLoading, session, user, signOut } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [consentimento, setConsentimento] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const redirectTo = safeRedirect(searchParams.get('redirect'))
  const confirmed = searchParams.get('confirmado') === '1'

  function changeMode(next: Mode) {
    setMode(next)
    setShowPassword(false)
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      if (mode === 'login') {
        await signInWithPassword(email, password)
        navigate(redirectTo, { replace: true })
      } else if (mode === 'signup') {
        const result = await signUpWithPassword({
          nome,
          email,
          password,
          consentimentoLgpd: consentimento,
        })
        if (result.needsEmailConfirmation) {
          setSuccess(
            'Conta criada. Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, volte e entre.',
          )
          setMode('login')
          setPassword('')
        } else {
          navigate('/meu-endereco', { replace: true })
        }
      } else {
        await requestPasswordReset(email)
        setSuccess(
          'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Verifique também a caixa de spam.',
        )
      }
    } catch (caught) {
      setError(
        caught instanceof AuthError || caught instanceof Error
          ? caught.message
          : 'Não foi possível concluir a operação.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-3xl">
        <Badge tone="brand">
          Conta privada
        </Badge>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Entrar
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Sua conta mantém o endereço e os contatos visíveis somente para você.
        </p>
        <div className="mt-5">
          <SupabaseSetupNotice />
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <Card className="mx-auto flex max-w-xl items-center gap-3 p-5">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-brand-700"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-600" role="status" aria-live="polite">
          Verificando sua sessão…
        </p>
      </Card>
    )
  }

  if (session) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-5 sm:p-6" aria-labelledby="conta-conectada">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1
                id="conta-conectada"
                className="text-lg font-bold tracking-tight text-slate-950"
              >
                Você já está conectado
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Sessão ativa para <strong>{user?.email}</strong>.
              </p>
              {confirmed ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  E-mail confirmado com sucesso.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/meu-endereco" className={buttonStyles('primary')}>
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Meu endereço
            </Link>
            <Link to="/" className={buttonStyles('secondary')}>
              Voltar ao início
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                void signOut().catch((caught: unknown) => {
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Não foi possível sair.',
                  )
                })
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair
            </Button>
          </div>

          {error ? (
            <p className="mt-3 text-xs text-alert-700" role="alert">
              {error}
            </p>
          ) : null}
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <Badge tone="brand">
        Conta privada
      </Badge>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        {mode === 'signup'
          ? 'Criar conta de morador'
          : mode === 'recovery'
            ? 'Recuperar senha'
            : 'Entrar'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {mode === 'signup'
          ? 'Sua conta protege o endereço e os dados pessoais que você cadastrar.'
          : mode === 'recovery'
            ? 'Informe o e-mail da conta para receber um link seguro de redefinição.'
            : 'Acesse para cadastrar e atualizar seu endereço com segurança.'}
      </p>

      {confirmed ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800"
          role="status"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          E-mail confirmado. Entre com sua senha para continuar.
        </div>
      ) : null}

      {success ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800"
          role="status"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {success}
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-2xl border border-alert-200 bg-alert-50 p-3 text-xs leading-relaxed text-alert-800"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <Card className="mt-4 p-5 sm:p-6">
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {mode === 'signup' ? (
            <div>
              <label
                htmlFor="nome"
                className="text-xs font-bold text-slate-700"
              >
                Nome
              </label>
              <div className="relative">
                <UserRound
                  className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  id="nome"
                  name="nome"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={150}
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  className={`${FIELD_CLASS} pl-9`}
                  placeholder="Como devemos chamar você"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="text-xs font-bold text-slate-700">
              E-mail
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-500"
                aria-hidden="true"
              />
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${FIELD_CLASS} pl-9`}
                placeholder="voce@exemplo.com"
              />
            </div>
          </div>

          {mode !== 'recovery' ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="password"
                  className="text-xs font-bold text-slate-700"
                >
                  Senha
                </label>
                {mode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => changeMode('recovery')}
                    className="text-[13px] font-semibold text-brand-700 hover:text-brand-900"
                  >
                    Esqueci minha senha
                  </button>
                ) : null}
              </div>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${FIELD_CLASS} pl-9 pr-14`}
                  placeholder={mode === 'signup' ? 'Mínimo de 8 caracteres' : 'Sua senha'}
                />
                <button type="button" onClick={()=>setShowPassword(value=>!value)} aria-controls="password" aria-pressed={showPassword} aria-label={showPassword?'Ocultar senha':'Mostrar senha'} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50">{showPassword?<EyeOff className="h-5 w-5" aria-hidden="true" />:<Eye className="h-5 w-5" aria-hidden="true" />}</button>
              </div>
            </div>
          ) : null}

          {mode === 'signup' ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                <input
                  type="checkbox"
                  checked={consentimento}
                  onChange={(event) => setConsentimento(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-200"
                  required
                />
                <span>
                  Autorizo o armazenamento do meu e-mail, nome e endereço para
                  funcionamento do aplicativo. Posso solicitar correção ou
                  exclusão dos dados pelos canais do projeto.
                </span>
              </label>
              <details className="mt-2 text-[13px] leading-relaxed text-slate-500">
                <summary className="cursor-pointer font-semibold text-slate-600">
                  Como os dados são tratados
                </summary>
                <p className="mt-1.5">
                  O endereço fica protegido por RLS e não é exibido em consultas
                  públicas. A localização é usada para associar o imóvel a
                  informações meteorológicas e, futuramente, a ocorrências e
                  avisos. Não há venda de dados nem rastreamento de localização
                  em segundo plano.
                </p>
              </details>
            </div>
          ) : null}

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {mode === 'login' ? (
              <>
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                Entrar
              </>
            ) : mode === 'signup' ? (
              <>
                <UserRound className="h-4 w-4" aria-hidden="true" />
                Criar conta
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Enviar link de recuperação
              </>
            )}
          </Button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-4">
          {mode === 'login' ? (
            <p className="text-center text-xs text-slate-500">
              Ainda não tem conta?{' '}
              <button
                type="button"
                onClick={() => changeMode('signup')}
                className="font-bold text-brand-700 hover:text-brand-900"
              >
                Criar conta
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => changeMode('login')}
              className="mx-auto flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:text-brand-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar para o login
            </button>
          )}
        </div>
      </Card>

      <p className="mt-3 px-1 text-[13px] leading-relaxed text-slate-500">
        Sessão persistida localmente pelo Supabase Auth. A chave usada pelo
        navegador é pública (anon/publishable); a proteção real vem das
        políticas RLS.
      </p>
    </div>
  )
}
