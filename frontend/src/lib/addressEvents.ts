/**
 * Sinal de atualização do endereço do morador.
 *
 * O formulário de `/meu-endereco` e o mapa de `/mapa` são páginas distintas.
 * Depois de salvar, o mapa precisa recarregar o ponto privado mesmo que a
 * atualização tenha acontecido em outra aba. O evento local cobre a mesma aba e
 * o BroadcastChannel cobre as demais; nada é enviado ao servidor por aqui.
 */

export const ADDRESS_UPDATED_EVENT = 'alerta:endereco-atualizado'

const ADDRESS_CHANNEL = 'alerta-endereco'

export function notifyAddressUpdated(): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new Event(ADDRESS_UPDATED_EVENT))

  try {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(ADDRESS_CHANNEL)
    channel.postMessage({ type: 'endereco-atualizado', at: Date.now() })
    channel.close()
  } catch {
    // Navegadores antigos ou modo privado restrito: o evento local basta.
  }
}

export function subscribeAddressUpdated(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  // A mesma atualização chega pelo evento local e pelo BroadcastChannel.
  // Deduplicar evita duas recargas completas do mapa.
  let lastHandledAt = 0
  const listener = () => {
    const now = Date.now()
    if (now - lastHandledAt < 250) return
    lastHandledAt = now
    handler()
  }

  window.addEventListener(ADDRESS_UPDATED_EVENT, listener)

  let channel: BroadcastChannel | null = null
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(ADDRESS_CHANNEL)
      channel.onmessage = listener
    }
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener(ADDRESS_UPDATED_EVENT, listener)
    try {
      channel?.close()
    } catch {
      // Sem consequência: o canal já pode ter sido fechado.
    }
  }
}
