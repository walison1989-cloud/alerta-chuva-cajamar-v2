/**
 * Hook de contatos do morador (Fase 2).
 *
 * Orquestra o carregamento, criação, edição, exclusão e revogação de
 * consentimento de contatos. Nenhuma coordenada residencial é enviada
 * para as novas colunas: o endereço já existe em `enderecos`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  listarMeusContatos,
  criarMeuContato,
  atualizarMeuContato,
  excluirMeuContato,
  revogarConsentimentoContato,
} from '@/lib/contatos'
import type { ContatoFormValues, ContatoResume } from '@/types/contatos'

interface UseContatosReturn {
  contatos: ContatoResume[]
  contatoEmEdicao: ContatoResume | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isCreating: boolean
  isUpdating: boolean
  isDeleting: boolean
  isRevoking: boolean
  createError: string | null
  updateError: string | null
  deleteError: string | null
  revokeError: string | null
  carregarContatos: () => Promise<void>
  selecionarContato: (contato: ContatoResume | null) => void
  criarContato: (values: ContatoFormValues) => Promise<boolean>
  atualizarContato: (
    contatoId: number,
    values: Partial<ContatoFormValues>,
  ) => Promise<boolean>
  excluirContato: (contatoId: number) => Promise<boolean>
  revogarConsentimento: (contatoId: number) => Promise<boolean>
  limparErros: () => void
}

export function useContatos(): UseContatosReturn {
  const { user } = useAuth()
  const client = getSupabaseClient()
  const usuarioId = user?.id ?? null

  const [contatos, setContatos] = useState<ContatoResume[]>([])
  const [contatoEmEdicao, setContatoEmEdicao] = useState<ContatoResume | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(Boolean(usuarioId))
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const activeRef = useRef(true)

  const carregarContatos = useCallback(async (): Promise<void> => {
    if (!client || !usuarioId) {
      setContatos([])
      setError(null)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

    setIsLoading(true)
    setIsRefreshing(true)
    setError(null)

    try {
      const lista = await listarMeusContatos(client, usuarioId)
      if (!activeRef.current) return
      setContatos(lista)
      setError(null)
    } catch (caught) {
      if (!activeRef.current) return
      setContatos([])
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível carregar os contatos.',
      )
    } finally {
      if (activeRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [client, usuarioId])

  useEffect(() => {
    activeRef.current = true
    // eslint-disable-next-line react/set-state-in-effect
    void carregarContatos()
    return () => {
      activeRef.current = false
    }
  }, [carregarContatos])

  const selecionarContato = useCallback(
    (contato: ContatoResume | null) => {
      setContatoEmEdicao(contato)
      setCreateError(null)
      setUpdateError(null)
    },
    [setContatoEmEdicao, setCreateError, setUpdateError],
  )

  const limparErros = useCallback(() => {
    setError(null)
    setCreateError(null)
    setUpdateError(null)
    setDeleteError(null)
    setRevokeError(null)
  }, [])

  const criarContato = useCallback(
    async (values: ContatoFormValues): Promise<boolean> => {
      if (!client || !usuarioId) {
        setCreateError(
          'Supabase não está configurado ou sessão não encontrada.',
        )
        return false
      }

      setIsCreating(true)
      setCreateError(null)

      try {
        // Busca o endereço cadastrado do usuário para associar ao contato
        // via FK (endereco_id), evitando cópia desatualizada de campos.
        const { data: endereco } = await client
          .from('enderecos')
          .select('id')
          .eq('usuario_id', usuarioId)
          .maybeSingle()

        await criarMeuContato(
          client,
          usuarioId,
          values,
          endereco?.id ?? null,
        )

        if (!activeRef.current) return false
        await carregarContatos()
        setContatoEmEdicao(null)
        return true
      } catch (caught) {
        if (!activeRef.current) return false
        setCreateError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível criar o contato.',
        )
        return false
      } finally {
        if (activeRef.current) setIsCreating(false)
      }
    },
    [client, usuarioId, carregarContatos],
  )

  const atualizarContato = useCallback(
    async (
      contatoId: number,
      values: Partial<ContatoFormValues>,
    ): Promise<boolean> => {
      if (!client || !usuarioId) {
        setUpdateError(
          'Supabase não está configurado ou sessão não encontrada.',
        )
        return false
      }

      setIsUpdating(true)
      setUpdateError(null)

      try {
        await atualizarMeuContato(client, usuarioId, contatoId, values)

        if (!activeRef.current) return false
        await carregarContatos()
        setContatoEmEdicao(null)
        return true
      } catch (caught) {
        if (!activeRef.current) return false
        setUpdateError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível atualizar o contato.',
        )
        return false
      } finally {
        if (activeRef.current) setIsUpdating(false)
      }
    },
    [client, usuarioId, carregarContatos],
  )

  const excluirContato = useCallback(
    async (contatoId: number): Promise<boolean> => {
      if (!client || !usuarioId) {
        setDeleteError(
          'Supabase não está configurado ou sessão não encontrada.',
        )
        return false
      }

      setIsDeleting(true)
      setDeleteError(null)

      try {
        await excluirMeuContato(client, usuarioId, contatoId)

        if (!activeRef.current) return false
        setContatos((prev) => prev.filter((c) => c.id !== contatoId))
        if (contatoEmEdicao?.id === contatoId) {
          setContatoEmEdicao(null)
        }
        return true
      } catch (caught) {
        if (!activeRef.current) return false
        setDeleteError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível excluir o contato.',
        )
        return false
      } finally {
        if (activeRef.current) setIsDeleting(false)
      }
    },
    [client, usuarioId, contatoEmEdicao],
  )

  const revogarConsentimento = useCallback(
    async (contatoId: number): Promise<boolean> => {
      if (!client || !usuarioId) {
        setRevokeError(
          'Supabase não está configurado ou sessão não encontrada.',
        )
        return false
      }

      setIsRevoking(true)
      setRevokeError(null)

      try {
        await revogarConsentimentoContato(client, usuarioId, contatoId)

        if (!activeRef.current) return false
        await carregarContatos()
        return true
      } catch (caught) {
        if (!activeRef.current) return false
        setRevokeError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível revogar o consentimento.',
        )
        return false
      } finally {
        if (activeRef.current) setIsRevoking(false)
      }
    },
    [client, usuarioId, carregarContatos],
  )

  return {
    contatos,
    contatoEmEdicao,
    isLoading,
    isRefreshing,
    error,
    isCreating,
    isUpdating,
    isDeleting,
    isRevoking,
    createError,
    updateError,
    deleteError,
    revokeError,
    carregarContatos,
    selecionarContato,
    criarContato,
    atualizarContato,
    excluirContato,
    revogarConsentimento,
    limparErros,
  }
}
