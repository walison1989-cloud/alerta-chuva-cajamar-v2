/** Build-time rejection of privileged credentials; messages never include values. */
export function assertPublicBuildEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('VITE_')) continue
    if (/SECRET|SERVICE_ROLE|PASSWORD|PRIVATE/i.test(key) || /^(sb_secret_|og_|sk-)/.test(value)) {
      throw new Error(`Variável privada proibida no frontend: ${key}`)
    }
    if (value.startsWith('eyJ')) {
      try {
        const segment = value.split('.')[1]
        const payload = JSON.parse(atob(segment!.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
        if (payload.role === 'service_role') throw new Error('privileged')
      } catch (error) {
        if (error instanceof Error && error.message === 'privileged') {
          throw new Error(`Credencial privilegiada proibida no frontend: ${key}`)
        }
      }
    }
  }
}
