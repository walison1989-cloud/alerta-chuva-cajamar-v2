import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { SupabaseSetupNotice } from '@/components/auth/SupabaseSetupNotice'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { AuthError, updatePassword } from '@/lib/auth'

const FIELD_CLASS =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-9 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

export function ResetPasswordPage() {
  useDocumentTitle('Redefinir senha')
  const { isConfigured, isLoading, session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password !== confirmation) {
      setError('As duas senhas precisam ser iguais.')
      return
    }

    setIsSubmitting(true)
    try {
      await updatePassword(password)
      setSuccess(true)
    } catch (caught) {
      setError(
        caught instanceof AuthError || caught instanceof Error
          ? caught.message
          : 'Não foi possível redefinir a senha.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Redefinir senha
        </h1>
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
          Validando o link de recuperação…
        </p>
      </Card>
    )
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-5 sm:p-6" aria-labelledby="link-invalido">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-attention-100 p-2.5 text-attention-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1
                id="link-invalido"
                className="text-lg font-bold tracking-tight text-slate-950"
              >
                Link inválido ou expirado
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Abra novamente o link enviado por e-mail ou solicite uma nova
                recuperação de senha.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/entrar" className={buttonStyles('primary')}>
              Voltar para o login
            </Link>
            <Link to="/" className={buttonStyles('secondary')}>
              Ir para o início
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-5 sm:p-6" aria-labelledby="senha-alterada">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1
                id="senha-alterada"
                className="text-lg font-bold tracking-tight text-slate-950"
              >
                Senha alterada
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Sua nova senha já está ativa. Você pode continuar conectado e
                acessar seu endereço.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/meu-endereco" className={buttonStyles('primary')}>
              Meu endereço
            </Link>
            <Link to="/" className={buttonStyles('secondary')}>
              Ir para o início
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        Redefinir senha
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Escolha uma nova senha com pelo menos 8 caracteres.
      </p>

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
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="nova-senha"
              className="text-xs font-bold text-slate-700"
            >
              Nova senha
            </label>
            <div className="relative">
              <LockKeyhole
                className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-500"
                aria-hidden="true"
              />
              <input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Mínimo de 8 caracteres"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmar-senha"
              className="text-xs font-bold text-slate-700"
            >
              Confirmar nova senha
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-500"
                aria-hidden="true"
              />
              <input
                id="confirmar-senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Repita a nova senha"
              />
            </div>
          </div>

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Salvar nova senha
          </Button>
        </form>
      </Card>
    </div>
  )
}
