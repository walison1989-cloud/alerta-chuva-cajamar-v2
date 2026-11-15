import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeAddressValues, normalizeCep } from '@/lib/addressValidation'
import type {
  AddressInput,
  AddressRecord,
  AddressVersionSummary,
} from '@/types/address'

const ADDRESS_COLUMNS = [
  'id',
  'usuario_id',
  'cep',
  'logradouro',
  'numero',
  'bairro',
  'complemento',
  'municipio',
  'uf',
  'latitude',
  'longitude',
  'precisao',
  'geocoding_fonte',
  'geocoding_label',
  'consentimento_lgpd',
  'created_at',
  'updated_at',
].join(',')

const VERSION_COLUMNS =
  'id,operacao,alterado_em,precisao,geocoding_fonte'

export class AddressRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AddressRepositoryError'
  }
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

/**
 * Busca o endereço do próprio morador. Além da política RLS, a consulta
 * filtra explicitamente por usuario_id (defesa em profundidade).
 */
export async function getMyAddress(
  client: SupabaseClient,
  userId: string,
): Promise<AddressRecord | null> {
  const { data, error } = await client
    .from('enderecos')
    .select(ADDRESS_COLUMNS)
    .eq('usuario_id', userId)
    .maybeSingle()

  if (error) {
    throw new AddressRepositoryError(
      'Não foi possível carregar seu endereço. Verifique a conexão e tente novamente.',
    )
  }

  return (data as AddressRecord | null) ?? null
}

/**
 * Cria ou atualiza o endereço principal. O histórico é gerado por trigger no
 * banco; o cliente nunca envia a coluna PostGIS `localizacao`.
 */
export async function saveMyAddress(
  client: SupabaseClient,
  userId: string,
  input: AddressInput,
): Promise<AddressRecord> {
  const normalized = normalizeAddressValues(input)

  if (input.latitude === null || input.longitude === null) {
    throw new AddressRepositoryError(
      'Informe as coordenadas antes de salvar o endereço.',
    )
  }

  const payload = {
    usuario_id: userId,
    cep: normalizeCep(normalized.cep),
    logradouro: normalized.logradouro,
    numero: normalized.numero,
    bairro: normalized.bairro,
    complemento: normalized.complemento || null,
    municipio: normalized.municipio,
    uf: normalized.uf,
    latitude: roundCoordinate(input.latitude),
    longitude: roundCoordinate(input.longitude),
    precisao: input.precisao,
    geocoding_fonte: input.geocodingFonte,
    geocoding_label: input.geocodingLabel,
    consentimento_lgpd: true,
  }

  const { data, error } = await client
    .from('enderecos')
    .upsert(payload, { onConflict: 'usuario_id' })
    .select(ADDRESS_COLUMNS)
    .single()

  if (error) {
    if (error.code === '42501') {
      throw new AddressRepositoryError(
        'Sem permissão para salvar este endereço. Entre novamente na sua conta.',
      )
    }
    throw new AddressRepositoryError(
      'Não foi possível salvar o endereço. Confira os dados e tente novamente.',
    )
  }

  return data as unknown as AddressRecord
}

/**
 * Lista as versões do próprio endereço. A RLS também restringe as linhas,
 * mas o filtro explícito evita depender apenas dela.
 */
export async function listMyAddressVersions(
  client: SupabaseClient,
  userId: string,
  limit = 8,
): Promise<AddressVersionSummary[]> {
  const { data, error } = await client
    .from('versoes_endereco')
    .select(VERSION_COLUMNS)
    .eq('usuario_id', userId)
    .order('alterado_em', { ascending: false })
    .limit(limit)

  if (error) {
    throw new AddressRepositoryError(
      'Não foi possível carregar o histórico do endereço.',
    )
  }

  return (data as AddressVersionSummary[] | null) ?? []
}
