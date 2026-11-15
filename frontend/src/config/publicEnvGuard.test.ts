import { describe, expect, it } from 'vitest'
import { assertPublicBuildEnv } from './publicEnvGuard'

describe('proteção do build público', () => {
  it('interrompe antes de gerar um bundle com credencial secreta', () => {
    expect(() => assertPublicBuildEnv({ VITE_SUPABASE_ANON_KEY: 'sb_secret_' + 'x'.repeat(30) })).toThrow(/Credencial|Variável/)
    expect(() => assertPublicBuildEnv({ VITE_SERVICE_ROLE_KEY: 'fixture' })).toThrow()
  })
  it('bloqueia JWT service_role sem imprimir seu valor', () => {
    const value = `eyJ0eXAiOiJKV1QifQ.${btoa(JSON.stringify({role:'service_role'}))}.fixture`
    expect(() => assertPublicBuildEnv({ VITE_SUPABASE_ANON_KEY: value })).toThrow('Credencial privilegiada')
    try { assertPublicBuildEnv({ VITE_SUPABASE_ANON_KEY: value }) } catch (error) {
      expect(String(error)).not.toContain(value)
    }
  })
  it('aceita configuração pública', () => {
    expect(() => assertPublicBuildEnv({ VITE_SUPABASE_ANON_KEY: 'sb_publishable_' + 'x'.repeat(30), VITE_APP_NAME: 'Cajamar' })).not.toThrow()
  })
})
