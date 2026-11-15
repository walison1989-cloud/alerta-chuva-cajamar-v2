/**
 * Card individual de contato (Fase 2).
 *
 * Exibe tipo, meio de contato, status de verificação, preferências por
 * canal e consentimento. Não exibe coordenadas residenciais.
 */

import { Phone, Mail, CheckCircle2, ShieldCheck, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { ContatoResume } from '@/types/contatos'

interface ContatoCardProps {
  contato: ContatoResume
  onEditar: () => void
  onExcluir: () => void
  onRevogar: () => void
  isRevoking: boolean
}

export function ContatoCard({
  contato,
  onEditar,
  onExcluir,
  onRevogar,
  isRevoking,
}: ContatoCardProps) {
  const meioLabel =
    contato.tipoContato === 'celular'
      ? 'Celular'
      : contato.tipoContato === 'email'
        ? 'E-mail'
        : 'Outro'
  const meioValor = contato.telefone ?? contato.email ?? '—'
  const meioIcon = contato.tipoContato === 'celular' ? (
    <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
  ) : contato.tipoContato === 'email' ? (
    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
  ) : (
    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
  )

  const canaisAtivos = [
    contato.preferencias.interno && 'Interno',
    contato.preferencias.email && 'E-mail',
    contato.preferencias.sms && 'SMS',
  ].filter(Boolean)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {meioIcon}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {contato.nome}
            </p>
            <p className="flex items-center gap-1 text-xs leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-700">{meioLabel}:</span>
              <span className="truncate">{meioValor}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {contato.verificado ? (
            <Badge tone="safe" className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Verificado
            </Badge>
          ) : (
            <Badge tone="attention" className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Não verificado
            </Badge>
          )}
          <Badge
            tone={contato.ativo ? 'neutral' : 'attention'}
            className={contato.ativo ? 'bg-slate-100 text-slate-700' : 'bg-attention-100 text-attention-800'}
          >
            {contato.ativo ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">
              Consentimento:
            </span>{' '}
            {contato.consentimento
              ? 'Concedido (v'
              : 'Não concedido'}
            {contato.versaoConsentimento
                ? `${contato.versaoConsentimento})`
                : ')'}
            {contato.consentimento && !contato.verificado ? (
              <span className="ml-1 text-attention-700">
                (pendente de verificação do provedor)
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true">
            {'•••'}
          </span>
          <div className="text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">Canais:</span>{' '}
            {canaisAtivos.length > 0
              ? canaisAtivos.join(', ')
              : 'Nenhum canal selecionado'}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true">
            {'•••'}
          </span>
          <p className="text-xs text-slate-500">
            Cadastrado em {formatarData(contato.dataCadastro)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-2">
        <button
          type="button"
          onClick={onEditar}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 hover:border-brand-200"
          aria-label={`Editar contato de ${contato.nome}`}
        >
          Editar
        </button>
        {contato.consentimento ? (
          <button
            type="button"
            onClick={onRevogar}
            disabled={isRevoking}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-attention-50 hover:border-attention-200 hover:text-attention-800 disabled:opacity-60"
            aria-label={`Revogar consentimento de ${contato.nome}`}
          >
            {isRevoking ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin" aria-hidden="true">⟳</span>
                Revogando…
              </>
            ) : (
              'Revogar consentimento'
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExcluir}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-attention-50 hover:border-attention-200 hover:text-attention-800"
          aria-label={`Excluir contato de ${contato.nome}`}
        >
          Excluir
        </button>
      </div>
    </div>
  )
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
