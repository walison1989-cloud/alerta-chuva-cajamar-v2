import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'

describe('configuração pública do aplicativo', () => {
  it('expõe um município válido e coordenadas dentro dos limites', () => {
    expect(env.municipality.name.length).toBeGreaterThan(0)
    expect(env.municipality.state).toHaveLength(2)
    expect(env.municipality.latitude).toBeGreaterThanOrEqual(-90)
    expect(env.municipality.latitude).toBeLessThanOrEqual(90)
    expect(env.municipality.longitude).toBeGreaterThanOrEqual(-180)
    expect(env.municipality.longitude).toBeLessThanOrEqual(180)
  })

  it('usa uma URL HTTPS para a fonte meteorológica', () => {
    expect(env.openMeteoBaseUrl.startsWith('https://')).toBe(true)
    expect(env.timezone.length).toBeGreaterThan(0)
  })

  it('não inclui a chave service_role no bundle público', () => {
    expect(Object.keys(env)).not.toContain('supabaseServiceRoleKey')
    expect(JSON.stringify(env)).not.toContain('service_role')
    expect(JSON.stringify(env)).not.toContain('SUPABASE_SERVICE_ROLE')
  })
})
