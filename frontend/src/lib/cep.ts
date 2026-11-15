import { env } from '@/config/env'
import { fetchJson, HttpError } from '@/lib/http'
import { isValidCep, normalizeCep } from '@/lib/addressValidation'
import type { CepResult } from '@/types/address'

export class CepLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CepLookupError'
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function readText(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Consulta o ViaCEP. O resultado preenche apenas os campos de endereço;
 * nunca é usado como coordenada exata da residência.
 */
export async function lookupCep(
  cep: string,
  signal?: AbortSignal,
): Promise<CepResult> {
  const digits = normalizeCep(cep)
  if (!isValidCep(digits)) {
    throw new CepLookupError('Informe um CEP válido com 8 dígitos.')
  }

  const base = ensureTrailingSlash(env.viaCepBaseUrl)
  const url = new URL(`${digits}/json/`, base)

  let payload: unknown
  try {
    payload = await fetchJson(url, { signal, timeoutMs: 10_000 })
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new CepLookupError('CEP não encontrado. Confira os números.')
    }
    throw new CepLookupError(
      'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
    )
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new CepLookupError('O serviço de CEP retornou uma resposta inválida.')
  }

  const data = payload as Record<string, unknown>
  if (data.erro === true || data.erro === 'true') {
    throw new CepLookupError('CEP não encontrado. Confira os números.')
  }

  const result: CepResult = {
    cep: readText(data, 'cep') || digits,
    logradouro: readText(data, 'logradouro'),
    complemento: readText(data, 'complemento'),
    bairro: readText(data, 'bairro'),
    localidade: readText(data, 'localidade'),
    uf: readText(data, 'uf').toUpperCase(),
  }

  if (!result.localidade || !result.uf) {
    throw new CepLookupError('O CEP não retornou município e UF válidos.')
  }

  return result
}
