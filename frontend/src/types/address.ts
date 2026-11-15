export type AddressPrecision = 'geocodificado' | 'ajustado_manual'

export interface AddressFormValues {
  cep: string
  logradouro: string
  numero: string
  bairro: string
  complemento: string
  municipio: string
  uf: string
}

export interface Coordinates {
  latitude: number | null
  longitude: number | null
}

export interface AddressInput extends AddressFormValues, Coordinates {
  precisao: AddressPrecision
  geocodingFonte: string | null
  geocodingLabel: string | null
}

export interface AddressRecord
  extends Omit<
    AddressInput,
    'complemento' | 'geocodingFonte' | 'geocodingLabel'
  > {
  id: string
  usuario_id: string
  complemento: string | null
  geocoding_fonte: string | null
  geocoding_label: string | null
  consentimento_lgpd: boolean
  created_at: string
  updated_at: string
}

export interface AddressVersionSummary {
  id: number
  operacao: 'INSERT' | 'UPDATE'
  alterado_em: string
  precisao: AddressPrecision | null
  geocoding_fonte: string | null
}

export interface GeocodeAddressDetails {
  country?: string
  countryCode?: string
  state?: string
  city?: string
  town?: string
  municipality?: string
  village?: string
  suburb?: string
  neighbourhood?: string
  road?: string
  houseNumber?: string
  postcode?: string
  regionCodes?: string[]
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  label: string
  provider: string
  /** `goodMatch` da OpenGeocoding: falso/ausente indica correspondência parcial. */
  goodMatch: boolean
  /** Verdadeiro quando algum componente do endereço não pôde ser confirmado. */
  approximate: boolean
  addressDetails: GeocodeAddressDetails
  attribution: string
  cached: boolean
}

export interface CepResult {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
}
