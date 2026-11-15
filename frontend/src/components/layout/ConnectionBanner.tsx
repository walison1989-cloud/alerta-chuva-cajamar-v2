import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export function ConnectionBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div
      className="border-b border-attention-200 bg-attention-100 px-4 py-2 text-center text-xs font-semibold text-attention-900"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5">
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        Você está offline. Dados salvos podem estar desatualizados.
      </span>
    </div>
  )
}
