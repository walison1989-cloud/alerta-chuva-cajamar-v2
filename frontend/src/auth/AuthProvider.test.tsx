import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthProvider } from './AuthProvider'
import { useAuth } from '@/hooks/useAuth'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }))
vi.mock('@/lib/supabase', () => {
  const client = { auth: mocks }
  return { getSupabaseClient: () => client }
})
vi.mock('@/lib/auth', () => ({ signOut: () => mocks.signOut() }))
let notify: (event: AuthChangeEvent, session: Session | null) => void
const session = (id: string) => ({ user: { id } }) as Session

function PrivatePanel() {
  const { user } = useAuth()
  const [privateData, setPrivateData] = useState('empty')
  return <><p>{user?.id ?? 'guest'}</p><p role="status">{privateData}</p><button onClick={() => setPrivateData(`${user?.id}-private`)}>Load</button></>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.onAuthStateChange.mockImplementation(callback => {
    notify = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
})

describe('isolamento de conta', () => {
  it('limpa o estado privado quando A é substituído por B', async () => {
    render(<AuthProvider><PrivatePanel /></AuthProvider>)
    await act(async () => notify('SIGNED_IN', session('A')))
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(screen.getByRole('status')).toHaveTextContent('A-private')
    await act(async () => notify('SIGNED_IN', session('B')))
    expect(screen.getByText('B')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('empty')
  })
  it('uma leitura inicial atrasada não restaura a conta anterior', async () => {
    let resolve!: (value: unknown) => void
    mocks.getSession.mockReturnValue(new Promise(done => { resolve = done }))
    render(<AuthProvider><PrivatePanel /></AuthProvider>)
    await act(async () => notify('SIGNED_IN', session('B')))
    await act(async () => resolve({ data: { session: session('A') }, error: null }))
    expect(screen.getByText('B')).toBeVisible()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })
  it('logout remove caches persistentes antigos de coordenadas', async () => {
    render(<AuthProvider><PrivatePanel /></AuthProvider>)
    await act(async () => notify('SIGNED_IN', session('A')))
    localStorage.setItem('alerta-chuva-cajamar:weather:v1:imovel:-23.4,-46.8', '{}')
    await act(async () => notify('SIGNED_OUT', null))
    expect(localStorage.length).toBe(0)
    expect(screen.getByText('guest')).toBeVisible()
  })
})
