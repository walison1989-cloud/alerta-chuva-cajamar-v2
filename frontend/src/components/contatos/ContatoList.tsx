/**
 * Lista de contatos do morador (Fase 2).
 *
 * Exibe cards individuais com estados de carregamento, vazio, erro e
 * confirmação de exclusão.
 */

import { useState } from 'react'
import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { ContatoCard } from '@/components/contatos/ContatoCard'
import { ContatoForm } from '@/components/contatos/ContatoForm'
import type { ContatoFormValues, ContatoResume } from '@/types/contatos'

interface ContatoListProps {
  contatos: ContatoResume[]
  contatoEmEdicao: ContatoResume | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isUpdating: boolean
  updateError: string | null
  deleteError: string | null
  revokeError: string | null
  onNovo: () => void
  onEditar: (contato: ContatoResume) => void
  onSalvarEdicao: (contatoId: number, values: ContatoFormValues) => Promise<boolean>
  onExcluir: (contatoId: number) => Promise<boolean>
  onRevogar: (contatoId: number) => Promise<boolean>
  onCancelarEdicao: () => void
  limparErros: () => void
}

export function ContatoList({
  contatos,
  contatoEmEdicao,
  isLoading,
  isRefreshing,
  error,
  isUpdating,
  updateError,
  deleteError,
  revokeError,
  onNovo,
  onEditar,
  onSalvarEdicao,
  onExcluir,
  onRevogar,
  onCancelarEdicao,
  limparErros,
}: ContatoListProps) {
  const [excluindoId, setExcluindoId] = useState<number | null>(null)
  const [revogandoId, setRevogandoId] = useState<number | null>(null)
  const [erroExclusaoId, setErroExclusaoId] = useState<number | null>(null)
  const [erroRevogacaoId, setErroRevogacaoId] = useState<number | null>(null)
  const [confirmarExclusao, setConfirmarExclusao] = useState<{
    id: number
    nome: string
  } | null>(null)

  const lidarConfirmarExclusao = async () => {
    if (!confirmarExclusao) return
    const id = confirmarExclusao.id
    setExcluindoId(id)
    setErroExclusaoId(null)
    try {
      const ok = await onExcluir(id)
      if (!ok) setErroExclusaoId(id)
    } finally {
      setExcluindoId(null)
      setConfirmarExclusao(null)
    }
  }

  const lidarRevogar = async (contatoId: number) => {
    setRevogandoId(contatoId)
    setErroRevogacaoId(null)
    try {
      const ok = await onRevogar(contatoId)
      if (!ok) setErroRevogacaoId(contatoId)
    } finally {
      setRevogandoId(null)
    }
  }

  const lidarSalvarEdicao = async (values: ContatoFormValues) => {
    if (!contatoEmEdicao) return false
    const ok = await onSalvarEdicao(contatoEmEdicao.id, values)
    if (ok) onCancelarEdicao()
    return ok
  }

  if (isLoading && contatos.length === 0) {
    return (
      <Card className="p-6" aria-busy="true">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-4 w-3/4 rounded animate-pulse" />
          <p className="text-[13px] text-slate-500">Carregando contatos…</p>
        </div>
      </Card>
    )
  }

  if (error && contatos.length === 0) {
    return (
      <Card className="p-6 rounded-xl border border-attention-200 bg-attention-50" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-attention-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-attention-900">
              Não foi possível carregar os contatos
            </p>
            <p className="mt-0.5 text-[13px] text-attention-800">{error}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={limparErros}>
            Dispensar
          </Button>
        </div>
      </Card>
    )
  }

  if (contatos.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="mt-3 text-sm font-bold text-slate-900">
          Nenhum contato cadastrado
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500 max-w-xs mx-auto">
          Cadastre celular ou e-mail para receber avisos preventivos
          relacionados ao seu imóvel. Você controla os canais de recebimento
          e pode revogar o consentimento a qualquer momento.
        </p>
        <div className="mt-4">
          <Button onClick={onNovo} className="w-full sm:w-auto">
            Cadastrar primeiro contato
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Seus contatos ({contatos.length})
        </p>
        {isRefreshing ? (
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : null}
      </div>

      {contatos.map((contato) => {
        const estaSendoAtualizada = contatoEmEdicao?.id === contato.id
        return (
          <div key={contato.id} className="space-y-2">
            {estaSendoAtualizada ? (
              <ContatoForm
                contato={contato}
                onSalvar={lidarSalvarEdicao}
                onCancelar={onCancelarEdicao}
                isSaving={isUpdating}
                saveError={updateError}
              />
            ) : (
              <ContatoCard
                contato={contato}
                onEditar={() => onEditar(contato)}
                onExcluir={() => {
                  setErroExclusaoId(null)
                  setConfirmarExclusao({ id: contato.id, nome: contato.nome })
                }}
                onRevogar={() => void lidarRevogar(contato.id)}
                isRevoking={revogandoId === contato.id}
              />
            )}
            {confirmarExclusao?.id === contato.id ? (
              <div className="mt-2 rounded-xl border border-attention-200 bg-attention-50 p-3" role="alertdialog" aria-modal="true">
                <p className="text-[13px] font-bold text-attention-900">
                  Excluir contato de {contato.nome}?
                </p>
                <p className="mt-1 text-xs text-attention-800">
                  Esta ação não pode ser desfeita. O contato será removido
                  e não receberá mais avisos preventivos.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirmarExclusao(null)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={lidarConfirmarExclusao}
                    disabled={excluindoId === contato.id}
                  >
                    {excluindoId === contato.id ? 'Excluindo…' : 'Confirmar exclusão'}
                  </Button>
                </div>
              </div>
            ) : null}
            {deleteError && contato.id === erroExclusaoId ? (
              <div className="mt-2 rounded-xl border border-attention-200 bg-attention-50 p-3" role="alert">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-attention-700" aria-hidden="true" />
                <p className="ml-6 mt-0.5 text-xs text-attention-900">
                  {deleteError}
                </p>
              </div>
            ) : null}
            {revokeError && contato.id === erroRevogacaoId ? (
              <div className="mt-2 rounded-xl border border-attention-200 bg-attention-50 p-3" role="alert">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-attention-700" aria-hidden="true" />
                <p className="ml-6 mt-0.5 text-xs text-attention-900">
                  {revokeError}
                </p>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
