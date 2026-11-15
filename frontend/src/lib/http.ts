export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

interface FetchJsonOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * Consulta HTTP com timeout e cancelamento externo. Não inclui credenciais
 * nem cabeçalhos secretos: as APIs usadas nesta etapa são públicas.
 */
export async function fetchJson(
  url: URL | string,
  { timeoutMs = 12_000, signal }: FetchJsonOptions = {},
): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const abortFromCaller = () => controller.abort()

  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abortFromCaller, { once: true })
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new HttpError(
        response.status,
        `A consulta externa respondeu com status ${response.status}.`,
      )
    }

    return await response.json()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(
        0,
        timedOut
          ? 'A consulta demorou mais que o esperado. Tente novamente.'
          : 'A consulta foi cancelada.',
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
