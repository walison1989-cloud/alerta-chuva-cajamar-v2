import { useCallback, useEffect, useState } from 'react'
import { fetchRainCatalog, unavailableSources } from '@/lib/rainSources'
import type { RainStation } from '@/types/rain'

export function useRainCatalog() {
  const [state, setState] = useState({ stations: [] as RainStation[], sources: unavailableSources(), isLoading: true })
  const [token, setToken] = useState(0)
  const refresh = useCallback(() => setToken(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let loading = false
    async function load() {
      if (loading) return
      loading = true
      try {
        const result = await fetchRainCatalog(controller.signal)
        if (active) setState({ ...result, isLoading: false })
      } catch {
        if (active) setState({ stations: [], sources: unavailableSources(), isLoading: false })
      } finally { loading = false }
    }
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 5 * 60 * 1000)
    return () => { active = false; controller.abort(); window.clearInterval(timer) }
  }, [token])
  return { ...state, refresh }
}
