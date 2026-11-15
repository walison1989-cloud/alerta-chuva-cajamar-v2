import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from '@/auth/AuthContext'
import { signOut as signOutRequest } from '@/lib/auth'
import { clearPrivateWeatherCache } from '@/hooks/useWeather'
import { getSupabaseClient } from '@/lib/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getSupabaseClient()
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(client))

  const previousUser = useRef<string | null>(null)

  useEffect(() => {
    clearPrivateWeatherCache()
    if (!client) {
      return
    }

    let active = true
    let authEventReceived = false

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      authEventReceived = true
      const nextUser = nextSession?.user.id ?? null
      if (previousUser.current !== nextUser) clearPrivateWeatherCache()
      previousUser.current = nextUser
      setSession(nextSession)
      setIsLoading(false)
    })

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (!error && !authEventReceived) {
          previousUser.current = data.session?.user.id ?? null
          setSession(data.session)
        }
        setIsLoading(false)
      })
      .catch(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client])

  const signOut = useCallback(async () => {
    await signOutRequest()
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: Boolean(client),
      signOut,
    }),
    [client, isLoading, session, signOut],
  )

  return <AuthContext.Provider value={value}><Fragment key={session?.user.id ?? 'guest'}>{children}</Fragment></AuthContext.Provider>
}
