import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

export interface TriagemPublica {
  nivel: 'dados_insuficientes' | 'sem_sinal_meteorologico' | 'atencao_meteorologica' | 'atencao_experimental'
  processos: string[]
  chuva_agora_modelo: boolean | null
  avaliado_em: string
}

export function useTriagemHidrologica(enderecoId: string | null): TriagemPublica | null {
  const [state, setState] = useState<{enderecoId: string | null; triagem: TriagemPublica | null}>({enderecoId: null, triagem: null})
  useEffect(() => {
    const client = getSupabaseClient()
    if (!enderecoId || !client) return
    let mounted = true
    const load = async () => {
      const { data, error } = await client.from('triagens_hidrologicas')
        .select('nivel,processos,chuva_agora_modelo,avaliado_em')
        .eq('endereco_id', enderecoId)
        .order('avaliado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (mounted) setState({enderecoId, triagem: !error && data ? data as TriagemPublica : null})
    }
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5 * 60_000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [enderecoId])
  return state.enderecoId === enderecoId ? state.triagem : null
}
