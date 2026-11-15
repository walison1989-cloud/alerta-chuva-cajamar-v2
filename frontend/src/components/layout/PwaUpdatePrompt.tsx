import { useEffect } from 'react'
import { RefreshCw, Wifi } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  })

  useEffect(() => {
    if (!offlineReady) return
    const timer = window.setTimeout(() => setOfflineReady(false), 6000)
    return () => window.clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null

  return (
    <div
      className="fixed inset-x-4 bottom-24 z-[120] mx-auto max-w-sm lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-app">
        {needRefresh ? (
          <>
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-brand-50 p-2 text-brand-700">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Nova versão disponível
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Atualize para carregar as melhorias mais recentes do
                  aplicativo.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="min-h-9 rounded-lg px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                Depois
              </button>
              <button
                type="button"
                onClick={() => void updateServiceWorker(true)}
                className="min-h-9 rounded-lg bg-brand-700 px-3 text-xs font-bold text-white transition hover:bg-brand-800"
              >
                Atualizar agora
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <Wifi className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">
                Pronto para usar offline
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                As telas e a última previsão consultada ficam disponíveis sem
                conexão.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOfflineReady(false)}
              className="ml-auto min-h-9 rounded-lg px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
              aria-label="Fechar aviso"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
