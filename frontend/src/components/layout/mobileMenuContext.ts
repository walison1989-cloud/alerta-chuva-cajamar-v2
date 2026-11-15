import { createContext, useContext } from 'react'

export interface MobileMenuContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const MobileMenuContext = createContext<MobileMenuContextValue | null>(
  null,
)

export function useMobileMenu(): MobileMenuContextValue {
  const value = useContext(MobileMenuContext)
  if (!value) {
    throw new Error('useMobileMenu deve ser usado dentro de MobileMenuProvider.')
  }
  return value
}
