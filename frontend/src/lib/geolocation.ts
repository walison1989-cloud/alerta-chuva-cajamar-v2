/**
 * Localização pelo GPS do dispositivo.
 *
 * A Geolocation API só funciona em contexto seguro (HTTPS, localhost ou
 * 127.0.0.1). Em HTTP por IP de rede local o navegador bloqueia a chamada, por
 * isso a interface precisa avisar antes de o morador tentar.
 *
 * Nenhuma coordenada é estimada aqui: ou o navegador entrega uma posição real
 * com a precisão informada, ou a promessa é rejeitada com um motivo claro.
 */

export type GeolocationFailureCode =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'unavailable'
  | 'timeout'
  | 'invalid-position'

export class GeolocationError extends Error {
  readonly code: GeolocationFailureCode

  constructor(code: GeolocationFailureCode, message: string) {
    super(message)
    this.name = 'GeolocationError'
    this.code = code
  }
}

export interface DevicePosition {
  latitude: number
  longitude: number
  /** Precisão horizontal informada pelo navegador, em metros. */
  accuracyMeters: number
}

export interface SecureContextInfo {
  isSecure: boolean
  protocol: string
  hostname: string
  isLoopback: boolean
  isPrivateNetwork: boolean
  warning: string | null
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const PRIVATE_NETWORK_HOST =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.local)$/i

function isPrivateNetworkHost(hostname: string): boolean {
  return PRIVATE_NETWORK_HOST.test(hostname) || hostname.endsWith('.local')
}

/**
 * Descreve o contexto de segurança do navegador sem acessar APIs de rede.
 * Recebe os valores por parâmetro para poder ser testado sem simular o DOM.
 */
export function describeSecureContext(input: {
  isSecureContext: boolean | undefined
  protocol: string
  hostname: string
}): SecureContextInfo {
  const hostname = input.hostname.trim().toLowerCase()
  const isLoopback = LOOPBACK_HOSTS.has(hostname)
  const isPrivateNetwork = isPrivateNetworkHost(hostname)
  // `isSecureContext` é a fonte autoritativa: navegadores tratam localhost e
  // 127.0.0.1 como seguros mesmo em HTTP. Quando a propriedade não existe,
  // assumimos contexto seguro para não bloquear ambientes sem suporte.
  const isSecure =
    input.isSecureContext !== false ||
    isLoopback

  let warning: string | null = null
  if (!isSecure && isPrivateNetwork) {
    warning =
      'Você está acessando o aplicativo por um endereço de rede local via HTTP. O navegador só libera o GPS em HTTPS ou em localhost. Abra em http://localhost:5173, use HTTPS ou selecione o ponto no mapa.'
  } else if (!isSecure) {
    warning =
      'Este endereço não está em HTTPS nem em localhost. O navegador pode bloquear o GPS. Use HTTPS ou selecione o ponto no mapa.'
  }

  return {
    isSecure,
    protocol: input.protocol,
    hostname,
    isLoopback,
    isPrivateNetwork,
    warning,
  }
}

/** Lê o contexto atual do navegador. Em SSR/teste sem window, assume seguro. */
export function getSecureContextInfo(): SecureContextInfo {
  if (typeof window === 'undefined') {
    return describeSecureContext({
      isSecureContext: true,
      protocol: '',
      hostname: '',
    })
  }

  const location = window.location
  return describeSecureContext({
    isSecureContext: window.isSecureContext,
    protocol: location?.protocol ?? '',
    hostname: location?.hostname ?? '',
  })
}

function validationError(): GeolocationError {
  return new GeolocationError(
    'invalid-position',
    'O dispositivo retornou uma coordenada inválida. Tente novamente ou selecione o ponto no mapa.',
  )
}

export interface RequestPositionOptions {
  /** Tempo máximo total para obter a posição. */
  timeoutMs?: number
  /** Idade máxima aceitável de uma posição em cache. 0 força leitura nova. */
  maximumAgeMs?: number
  /** Permite injetar uma implementação nos testes. */
  geolocation?: Geolocation | null
  /** Permite forçar o resultado da verificação de contexto nos testes. */
  isSecureContext?: boolean
}

/**
 * Solicita a posição atual ao navegador. A permissão é pedida apenas quando o
 * morador clica no botão; nunca em segundo plano.
 */
export function requestCurrentPosition(
  options: RequestPositionOptions = {},
): Promise<DevicePosition> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const maximumAgeMs = options.maximumAgeMs ?? 0

  const secure =
    options.isSecureContext ??
    (typeof window === 'undefined' ? true : window.isSecureContext !== false)

  if (!secure) {
    return Promise.reject(
      new GeolocationError(
        'insecure-context',
        'O GPS só funciona em HTTPS ou em localhost. Abra o aplicativo por um endereço seguro ou selecione o ponto no mapa.',
      ),
    )
  }

  const geolocation =
    options.geolocation ??
    (typeof navigator === 'undefined' ? null : navigator.geolocation)

  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    return Promise.reject(
      new GeolocationError(
        'unsupported',
        'Este navegador não oferece localização por GPS. Selecione o ponto no mapa.',
      ),
    )
  }

  return new Promise<DevicePosition>((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position?.coords?.latitude)
        const longitude = Number(position?.coords?.longitude)
        const rawAccuracy = Number(position?.coords?.accuracy)

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          reject(validationError())
          return
        }

        resolve({
          latitude,
          longitude,
          accuracyMeters:
            Number.isFinite(rawAccuracy) && rawAccuracy >= 0
              ? Math.round(rawAccuracy)
              : 0,
        })
      },
      (error) => {
        const code = Number(error?.code)
        if (code === 1) {
          reject(
            new GeolocationError(
              'permission-denied',
              'Permissão de localização negada. Autorize o GPS nas configurações do navegador ou selecione o ponto no mapa.',
            ),
          )
          return
        }
        if (code === 2) {
          reject(
            new GeolocationError(
              'unavailable',
              'Não foi possível obter sua localização agora. Verifique se o GPS está ligado e tente novamente, ou selecione o ponto no mapa.',
            ),
          )
          return
        }
        if (code === 3) {
          reject(
            new GeolocationError(
              'timeout',
              'O tempo para obter a localização esgotou. Tente novamente em um local aberto ou selecione o ponto no mapa.',
            ),
          )
          return
        }
        reject(
          new GeolocationError(
            'unavailable',
            'Não foi possível obter sua localização. Tente novamente ou selecione o ponto no mapa.',
          ),
        )
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs,
      },
    )
  })
}

/** Formata a precisão em metros sem transformar ausência em zero. */
export function formatAccuracy(accuracyMeters: number | null): string | null {
  if (accuracyMeters === null || !Number.isFinite(accuracyMeters)) return null
  if (accuracyMeters <= 0) return 'precisão não informada'
  if (accuracyMeters < 1000) return `±${Math.round(accuracyMeters)} m`
  return `±${(accuracyMeters / 1000).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} km`
}
