import type {
  AddressFormValues,
  Coordinates,
} from '@/types/address'

/**
 * Caixa envolvente generosa ao redor do município de Cajamar, derivada da
 * bounding box pública do OpenStreetMap/Nominatim com margem de segurança.
 * Serve apenas para avisar sobre um ponto claramente fora da área — não é
 * limite oficial de município nem área de risco.
 */
export const CAJAMAR_AREA = Object.freeze({
  minLatitude: -23.4906,
  maxLatitude: -23.2179,
  minLongitude: -47.002,
  maxLongitude: -46.7597,
})

export type AddressField =
  | keyof AddressFormValues
  | 'coordenadas'
  | 'consentimento'
  | 'pontoConfirmado'

export type AddressErrors = Partial<Record<AddressField, string>>

export interface AddressValidationResult {
  errors: AddressErrors
  warnings: string[]
}

export function normalizeCep(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function formatCep(value: string): string {
  const digits = normalizeCep(value)
  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits
}

export function isValidCep(value: string): boolean {
  return /^\d{8}$/.test(normalizeCep(value))
}

export function normalizeAddressValues(
  values: AddressFormValues,
): AddressFormValues {
  return {
    cep: normalizeCep(values.cep),
    logradouro: values.logradouro.trim(),
    numero: values.numero.trim(),
    bairro: values.bairro.trim(),
    complemento: values.complemento.trim(),
    municipio: values.municipio.trim(),
    uf: values.uf.trim().toUpperCase(),
  }
}

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export function isWithinCajamarArea(
  latitude: number,
  longitude: number,
): boolean {
  return (
    latitude >= CAJAMAR_AREA.minLatitude &&
    latitude <= CAJAMAR_AREA.maxLatitude &&
    longitude >= CAJAMAR_AREA.minLongitude &&
    longitude <= CAJAMAR_AREA.maxLongitude
  )
}

export function validateAddress(
  values: AddressFormValues,
  coordinates: Coordinates,
  consentimento: boolean,
): AddressValidationResult {
  const errors: AddressErrors = {}
  const warnings: string[] = []
  const normalized = normalizeAddressValues(values)

  if (!isValidCep(normalized.cep)) {
    errors.cep = 'Informe um CEP com 8 dígitos.'
  }
  if (normalized.logradouro.length < 3) {
    errors.logradouro = 'Informe o logradouro com pelo menos 3 caracteres.'
  }
  if (normalized.numero.length < 1) {
    errors.numero = 'Informe o número. Use “S/N” quando não houver.'
  }
  if (normalized.bairro.length < 2) {
    errors.bairro = 'Informe o bairro.'
  }
  if (normalized.municipio.length < 2) {
    errors.municipio = 'Informe o município.'
  }
  if (!/^[A-Z]{2}$/.test(normalized.uf)) {
    errors.uf = 'Informe a UF com 2 letras.'
  }

  const { latitude, longitude } = coordinates
  if (latitude === null || longitude === null) {
    errors.coordenadas =
      'Localize o endereço ou marque o ponto no mapa antes de salvar.'
  } else if (!isValidCoordinate(latitude, longitude)) {
    errors.coordenadas =
      'As coordenadas são inválidas. Latitude deve estar entre -90 e 90 e longitude entre -180 e 180.'
  } else if (!isWithinCajamarArea(latitude, longitude)) {
    warnings.push(
      'O ponto está fora da área estimada de Cajamar. Confirme no mapa antes de salvar.',
    )
  }

  if (!consentimento) {
    errors.consentimento =
      'É necessário autorizar o armazenamento do endereço para continuar.'
  }

  return { errors, warnings }
}

export function hasAddressErrors(errors: AddressErrors): boolean {
  return Object.keys(errors).length > 0
}
