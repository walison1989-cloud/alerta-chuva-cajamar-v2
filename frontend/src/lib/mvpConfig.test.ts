import { describe, expect, it } from 'vitest'
import { isPublicSupabaseKey } from '@/config/env'
describe('chaves públicas do Supabase', () => {
  it('aceita publishable e JWT anon, rejeita segredos e tokens inválidos', () => {
    expect(isPublicSupabaseKey('sb_publishable_' + 'x'.repeat(30))).toBe(true)
    expect(isPublicSupabaseKey('sb_secret_' + 'x'.repeat(30))).toBe(false)
    const token = (role: string) => `eyJ0eXAiOiJKV1QifQ.${btoa(JSON.stringify({role}))}.signature`
    expect(isPublicSupabaseKey(token('anon'))).toBe(true)
    expect(isPublicSupabaseKey(token('service_role'))).toBe(false)
    expect(isPublicSupabaseKey('invalid')).toBe(false)
  })
})
