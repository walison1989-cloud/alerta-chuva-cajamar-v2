/**
 * Contrato de contatos do morador (Fase 2).
 *
 * Preserva a tabela existente `contatos_alerta` e adiciona campos de
 * preferência por canal e consentimento auditável. Não envia e-mails,
 * SMS nem notificações reais.
 */

export type TipoContato = 'celular' | 'email' | 'outro';

export type CanalNotificacao = 'interno' | 'email' | 'sms';

export interface ContatoFormValues {
  nome: string
  tipoContato: TipoContato
  telefone: string
  email: string
  canalInterno: boolean
  canalEmail: boolean
  canalSms: boolean
  consentimento: boolean
  versaoConsentimento: string
}

export interface ContatoRecord {
  /** Chave primária real da tabela legada `contatos_alerta`. */
  id_contato: number
  usuario_id: string
  endereco_id: string | null
  nome: string
  tipo_contato: TipoContato | null
  telefone: string | null
  email: string | null
  ativo: boolean
  consentimento: boolean
  verificado_em: string | null
  versao_consentimento: string | null
  revogado_em: string | null
  canal_interno: boolean
  canal_email: boolean
  canal_sms: boolean
  data_cadastro: string
}

export interface ContatoResume {
  id: number
  tipoContato: TipoContato | null
  nome: string
  telefone: string | null
  email: string | null
  ativo: boolean
  consentimento: boolean
  verificado: boolean
  versaoConsentimento: string | null
  revogado: boolean
  preferencias: {
    interno: boolean
    email: boolean
    sms: boolean
  }
  elegivelParaNotificacao: boolean
  dataCadastro: string
}

export interface ContatoRepositoryError extends Error {
  name: 'ContatoRepositoryError'
}
