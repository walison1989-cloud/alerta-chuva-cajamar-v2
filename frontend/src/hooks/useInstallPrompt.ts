import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface InstallPromptResult {
  canInstall: boolean
  isStandalone: boolean
  install: () => Promise<boolean>
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false

  const displayModeStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches

  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  return displayModeStandalone || iosStandalone
}

/** Captura o evento de instalação do Chromium e o estado de app instalado. */
export function useInstallPrompt(): InstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone)

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const handleInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null
    const handleDisplayMode = () => setIsStandalone(detectStandalone())

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    media?.addEventListener('change', handleDisplayMode)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
      media?.removeEventListener('change', handleDisplayMode)
    }
  }, [])

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false

    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      return choice.outcome === 'accepted'
    } catch {
      return false
    }
  }, [deferredPrompt])

  return {
    canInstall: Boolean(deferredPrompt) && !isStandalone,
    isStandalone,
    install,
  }
}
