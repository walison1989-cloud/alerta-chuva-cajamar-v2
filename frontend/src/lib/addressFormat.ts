import type { AddressRecord } from '@/types/address'

/**
 * Rótulo curto do endereço privado. Usado apenas em componentes
 * autenticados e no marcador privado do mapa.
 */
export function formatAddressLabel(address: AddressRecord): string {
  const street = [address.logradouro, address.numero].filter(Boolean).join(', ')
  const district = address.bairro ? ` · ${address.bairro}` : ''
  const city = [address.municipio, address.uf].filter(Boolean).join('/')
  return `${street}${district}${city ? ` · ${city}` : ''}`
}
