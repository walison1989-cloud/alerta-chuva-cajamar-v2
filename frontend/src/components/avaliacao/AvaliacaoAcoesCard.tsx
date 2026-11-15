import {
  BellRing,
  Info,
  LockKeyhole,
  MailX,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'
import type {
  AvaliacaoPreventiva,
  PreviaNotificacao,
  RegraAvaliacaoPublica,
} from '@/types/avaliacaoPreventiva'

interface AvaliacaoAcoesCardProps {
  isConfigured: boolean
  isAuthenticated: boolean
  avaliacao: AvaliacaoPreventiva | null
  regra: RegraAvaliacaoPublica | null
  onRegister: () => Promise<string | null>
  isRegistering: boolean
  registerError: string | null
  lastRegisteredId: string | null
  onGeneratePrevia: (execucaoId?: string) => Promise<PreviaNotificacao | null>
  isCreatingPrevia: boolean
  previaError: string | null
  previa: PreviaNotificacao | null
  addressError: string | null
}

/**
 * Registro auditável e prévia interna. Nada é enviado por e-mail, SMS, push
 * ou WhatsApp: a prévia existe apenas para teste dentro da própria conta.
 */
export function AvaliacaoAcoesCard({
  isConfigured,
  isAuthenticated,
  avaliacao,
  regra,
  onRegister,
  isRegistering,
  registerError,
  lastRegisteredId,
  onGeneratePrevia,
  isCreatingPrevia,
  previaError,
  previa,
  addressError,
}: AvaliacaoAcoesCardProps) {
  const canRegister = Boolean(isAuthenticated && avaliacao && regra)

  return (
    <Card className="p-5" aria-labelledby="acoes-analise-preventiva">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Save className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <div>
            <h2
              id="acoes-analise-preventiva"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              Registrar e testar
            </h2>
            <p className="text-[13px] text-slate-500">
              Histórico auditável e prévia interna
            </p>
          </div>
        </div>
        <Badge tone="neutral">Sem envio externo</Badge>
      </header>

      {!isConfigured ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          O Supabase não está configurado neste ambiente. A prévia pode ser
          calculada em memória, mas não há registro nem histórico.
        </p>
      ) : null}

      {isConfigured && !isAuthenticated ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-600">
            <LockKeyhole
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            A prévia pública da região não é salva. Entre na sua conta para
            registrar avaliações do imóvel com histórico auditável.
          </p>
          <Link
            to="/entrar"
            className={buttonStyles('secondary', 'sm', 'mt-2 w-full')}
          >
            Entrar para registrar
          </Link>
        </div>
      ) : null}

      {isConfigured && isAuthenticated ? (
        <div className="mt-3 space-y-2.5">
          {addressError ? (
            <p
              className="rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900"
              role="alert"
            >
              {addressError} A prévia usa a região de referência até o endereço
              ser carregado.
            </p>
          ) : null}

          {!regra ? (
            <p className="rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900">
              A regra experimental não está publicada e vigente. O registro está
              indisponível e nenhuma classificação será gravada.
            </p>
          ) : null}

          {!avaliacao ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
              Aguarde o carregamento da avaliação para habilitar o registro.
            </p>
          ) : null}

          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={!canRegister}
            isLoading={isRegistering}
            onClick={() => void onRegister()}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Registrar avaliação
          </Button>

          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <ShieldCheck
              className="mt-0.5 h-3 w-3 shrink-0"
              aria-hidden="true"
            />
            O registro guarda nível, motivos e evidências. Não guarda
            coordenadas do imóvel.
          </p>

          {registerError ? (
            <p
              className="rounded-xl border border-alert-200 bg-alert-50 px-2.5 py-2 text-xs leading-relaxed text-alert-900"
              role="alert"
            >
              {registerError}
            </p>
          ) : null}

          {lastRegisteredId ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs leading-relaxed text-emerald-900">
              Avaliação registrada. Identificador:{' '}
              <span className="font-mono font-semibold">
                {lastRegisteredId.slice(0, 8)}…
              </span>
            </div>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!lastRegisteredId}
            isLoading={isCreatingPrevia}
            onClick={() => void onGeneratePrevia()}
          >
            <BellRing className="h-4 w-4" aria-hidden="true" />
            Gerar prévia interna
          </Button>

          {previaError ? (
            <p
              className="rounded-xl border border-alert-200 bg-alert-50 px-2.5 py-2 text-xs leading-relaxed text-alert-900"
              role="alert"
            >
              {previaError}
            </p>
          ) : null}

          {previa ? (
            <div className="rounded-2xl border border-attention-200 bg-attention-50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-attention-800">
                <BellRing className="h-3 w-3" aria-hidden="true" />
                Prévia interna · não enviada
              </p>
              <p className="mt-1 text-[13px] font-semibold text-attention-950">
                {previa.titulo}
              </p>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-attention-900/80">
                {previa.corpo}
              </p>
            </div>
          ) : null}

          <p className="flex items-start gap-1.5 border-t border-slate-200 pt-2.5 text-xs leading-relaxed text-slate-500">
            <MailX className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Nenhum e-mail, SMS, push ou WhatsApp é enviado nesta etapa. A prévia
            fica registrada apenas para teste interno.
          </p>
        </div>
      ) : null}
    </Card>
  )
}
