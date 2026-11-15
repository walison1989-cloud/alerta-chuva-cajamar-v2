export type SupplementalSource = 'INMET' | 'SP Águas' | 'ANA'
export interface RainSourceStatus {
  source: SupplementalSource
  status: 'catalogue' | 'authorization_required' | 'unavailable'
  count: number
  message: string
  url: string
  checkedAt?: string
}
