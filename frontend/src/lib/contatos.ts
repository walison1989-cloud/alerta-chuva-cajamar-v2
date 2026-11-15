/**
 * Repositório de contatos do morador (Fase 2).
 *
 * Operações sobre a tabela `contatos_alerta` (já existente), preservando
 * RLS e isolamento por `usuario_id = auth.uid()`. Não envia e-mails,
 * SMS nem notificações reais.
 *
 * O campo `verificado_em` nunca é enviado pelo cliente: só pode ser
 * preenchido por processo confiável (service_role) via Edge Function.
 * `usuario_id` é enviado apenas no INSERT e validado por RLS/trigger; em
 * UPDATE permanece imutável.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  validarTelefoneBrasileiro,
  formatarTelefoneExibicao,
  validarEmail,
} from '@/lib/contatoValidation'
import type {
  ContatoFormValues,
  ContatoRecord,
  ContatoResume,
} from '@/types/contatos'

export class ContatoRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContatoRepositoryError'
  }
}

const CONTATO_COLUMNS = [
  'id_contato',
  'usuario_id',
  'endereco_id',
  'nome',
  'tipo_contato',
  'telefone',
  'email',
  'ativo',
  'consentimento',
  'verificado_em',
  'versao_consentimento',
  'revogado_em',
  'canal_interno',
  'canal_email',
  'canal_sms',
  'data_cadastro',
].join(',')

function describirErro(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : ''
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code)) {
    return `O cadastro de contatos precisa de configuração no banco. Seus contatos não foram apagados. Código: ${code}.`
  }
  if (code === '42501') return 'Seu acesso aos contatos foi recusado. É necessário conferir as permissões do cadastro. Código: 42501.'
  if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return `Sua sessão não foi aceita. Saia da conta e entre novamente. Código: ${code}.`
  if (error instanceof Error && error.message) return error.message
  return /^[A-Z0-9_]{3,16}$/.test(code) ? `${fallback} Código: ${code}.` : fallback
}

/**
 * Verifica se um contato é elegível para receber notificações:
 * consentimento ativo, não revogado e pelo menos um canal habilitado.
 */
function contatoElegivelParaNotificacao(r: Record<string, unknown>): boolean {
  const ativo = Boolean(r.ativo)
  const consentimento = Boolean(r.consentimento)
  const revogado = r.revogado_em != null
  const canalInterno = Boolean(r.canal_interno)
  const canalEmail = Boolean(r.canal_email)
  const canalSms = Boolean(r.canal_sms)
  return (
    ativo &&
    consentimento &&
    !revogado &&
    (canalInterno || canalEmail || canalSms)
  )
}

/**
 * Normaliza os valores do formulário antes de enviar ao banco.
 *
 * Nunca inclui `verificado_em` nem `revogado_em` (campos de auditoria
 * protegidos por trigger) e mantém `usuario_id` fora do UPDATE, pois o
 * proprietário não pode ser trocado depois da criação.
 */
function normalizarDadosContato(
  values: ContatoFormValues,
  enderecoId: string | null,
) {
  const tel = validarTelefoneBrasileiro(values.telefone)
  const email = validarEmail(values.email)

  return {
    endereco_id: enderecoId,
    nome: values.nome.trim(),
    tipo_contato: values.tipoContato,
    telefone: tel.valido ? tel.digitos : null,
    email: email.valido ? email.normalizado : null,
    ativo: true,
    consentimento: values.consentimento === true,
    versao_consentimento: values.versaoConsentimento || '1.0',
    canal_interno: values.canalInterno === true,
    canal_email: values.canalEmail === true,
    canal_sms: values.canalSms === true,
  }
}

function montarPayloadInsert(
  values: ContatoFormValues,
  usuarioId: string,
  enderecoId: string | null,
) {
  return {
    usuario_id: usuarioId,
    ...normalizarDadosContato(values, enderecoId),
  }
}

function montarPayloadUpdate(
  values: ContatoFormValues,
  enderecoId: string | null,
) {
  return normalizarDadosContato(values, enderecoId)
}

/**
 * Lista os contatos do próprio usuário autenticado.
 */
export async function listarMeusContatos(
  client: SupabaseClient,
  usuarioId: string,
): Promise<ContatoResume[]> {
  const { data, error } = await client
    .from('contatos_alerta')
    .select(CONTATO_COLUMNS)
    .eq('usuario_id', usuarioId)
    .order('data_cadastro', { ascending: false })

  if (error) {
    throw new ContatoRepositoryError(
      describirErro(
        error,
        'Não foi possível carregar seus contatos. Verifique a conexão.',
      ),
    )
  }

  const rows = (data ?? []) as unknown[]
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: Number(r.id_contato),
      tipoContato: r.tipo_contato as ContatoResume['tipoContato'],
      nome: String(r.nome ?? ''),
      telefone: r.telefone ? formatarTelefoneExibicao(String(r.telefone)) : null,
      email: typeof r.email === 'string' ? r.email : null,
      ativo: Boolean(r.ativo),
      consentimento: Boolean(r.consentimento),
      verificado: Boolean(r.verificado_em),
      versaoConsentimento:
        typeof r.versao_consentimento === 'string'
          ? r.versao_consentimento
          : null,
      revogado: Boolean(r.revogado_em),
      preferencias: {
        interno: Boolean(r.canal_interno),
        email: Boolean(r.canal_email),
        sms: Boolean(r.canal_sms),
      },
      elegivelParaNotificacao: contatoElegivelParaNotificacao(r),
      dataCadastro: typeof r.data_cadastro === 'string' ? r.data_cadastro : '',
    }
  })
}

/**
 * Busca um contato pelo ID, pertencente ao próprio usuário.
 */
export async function buscarMeuContato(
  client: SupabaseClient,
  usuarioId: string,
  contatoId: number,
): Promise<ContatoRecord | null> {
  const { data, error } = await client
    .from('contatos_alerta')
    .select(CONTATO_COLUMNS)
    .eq('usuario_id', usuarioId)
    .eq('id_contato', contatoId)
    .maybeSingle()

  if (error) {
    throw new ContatoRepositoryError(
      describirErro(error, 'Não foi possível carregar o contato.'),
    )
  }

  return (data as ContatoRecord | null) ?? null
}

/**
 * Cria um novo contato para o usuário autenticado.
 *
 * Associa o contato ao endereço cadastrado do usuário (endereco_id),
 * evitando cópia desatualizada de campos de endereço.
 */
export async function criarMeuContato(
  client: SupabaseClient,
  usuarioId: string,
  values: ContatoFormValues,
  enderecoId: string | null,
): Promise<ContatoRecord> {
  const payload = montarPayloadInsert(values, usuarioId, enderecoId)

  const { data, error } = await client
    .from('contatos_alerta')
    .insert(payload)
    .select(CONTATO_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      // unique_violation: telefone ou e-mail duplicado
      throw new ContatoRepositoryError(
        'Já existe um contato cadastrado com este telefone ou e-mail.',
      )
    }
    throw new ContatoRepositoryError(
      describirErro(error, 'Não foi possível criar o contato.'),
    )
  }

  return data as unknown as ContatoRecord
}

/**
 * Atualiza um contato existente do próprio usuário.
 *
 * Não permite alterar `verificado_em` (protegido por trigger no banco).
 */
export async function atualizarMeuContato(
  client: SupabaseClient,
  usuarioId: string,
  contatoId: number,
  values: Partial<ContatoFormValues>,
): Promise<ContatoRecord> {
  const atual: ContatoRecord | null = await buscarMeuContato(
    client,
    usuarioId,
    contatoId,
  )
  if (!atual) {
    throw new ContatoRepositoryError('Contato não encontrado.')
  }

  const merge: ContatoFormValues = {
    nome: values.nome ?? atual.nome,
    tipoContato: (values.tipoContato ?? atual.tipo_contato) as ContatoFormValues['tipoContato'],
    telefone: values.telefone ?? (atual.telefone ?? ''),
    email: values.email ?? (atual.email ?? ''),
    canalInterno: values.canalInterno ?? atual.canal_interno,
    canalEmail: values.canalEmail ?? atual.canal_email,
    canalSms: values.canalSms ?? atual.canal_sms,
    consentimento: values.consentimento ?? atual.consentimento,
    versaoConsentimento:
      values.versaoConsentimento ?? atual.versao_consentimento ?? '1.0',
  }

  const payload = montarPayloadUpdate(merge, atual.endereco_id)

  const { data, error } = await client
    .from('contatos_alerta')
    .update(payload)
    .eq('usuario_id', usuarioId)
    .eq('id_contato', contatoId)
    .select(CONTATO_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new ContatoRepositoryError(
        'Já existe um contato cadastrado com este telefone ou e-mail.',
      )
    }
    throw new ContatoRepositoryError(
      describirErro(error, 'Não foi possível atualizar o contato.'),
    )
  }

  return data as unknown as ContatoRecord
}

/**
 * Exclui um contato do próprio usuário.
 */
export async function excluirMeuContato(
  client: SupabaseClient,
  usuarioId: string,
  contatoId: number,
): Promise<void> {
  const { error } = await client
    .from('contatos_alerta')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('id_contato', contatoId)

  if (error) {
    throw new ContatoRepositoryError(
      describirErro(error, 'Não foi possível excluir o contato.'),
    )
  }
}

/**
 * Revoga o consentimento de um contato.
 *
 * Define consentimento = false, desativa todos os canais e preenche
 * revogado_em com o timestamp do servidor (via trigger no banco).
 */
export async function revogarConsentimentoContato(
  client: SupabaseClient,
  usuarioId: string,
  contatoId: number,
): Promise<ContatoRecord> {
  const { data, error } = await client
    .from('contatos_alerta')
    .update({
      consentimento: false,
      canal_interno: false,
      canal_email: false,
      canal_sms: false,
    })
    .eq('usuario_id', usuarioId)
    .eq('id_contato', contatoId)
    .select(CONTATO_COLUMNS)
    .single()

  if (error) {
    throw new ContatoRepositoryError(
      describirErro(error, 'Não foi possível revogar o consentimento.'),
    )
  }

  return data as unknown as ContatoRecord
}
