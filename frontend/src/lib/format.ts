const MM_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const TEMPERATURE_FORMATTER = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
})

export function formatMm(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${MM_FORMATTER.format(Math.max(0, value))} mm`
}

export function formatTemperature(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${TEMPERATURE_FORMATTER.format(value)} °C`
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

/**
 * Formata "2026-11-05T19:30" sem converter de fuso: a Open-Meteo já devolve
 * o horário local de Cajamar quando timezone=America/Sao_Paulo.
 */
export function formatApiDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return value || '—'
  const [, , month, day, hour, minute] = match
  return `${day}/${month} às ${hour}:${minute}`
}

export function formatApiTime(value: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(value)
  return match ? `${match[1]}h` : value
}

export function formatDayLabel(date: string, index: number): string {
  if (index === 0) return 'Hoje'
  if (index === 1) return 'Amanhã'

  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date

  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(parsed)

  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp)
  const minutes = Math.floor(diffMs / 60_000)

  if (minutes < 1) return 'agora mesmo'
  if (minutes < 60) return `há ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`

  const days = Math.floor(hours / 24)
  return `há ${days} d`
}

export function formatTodayLong(): string {
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatLatitude(value: number): string {
  return `${value.toFixed(5)}°`
}

export function formatLongitude(value: number): string {
  return `${value.toFixed(5)}°`
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Formata um instante ISO (UTC vindo do CEMADEN/Supabase) no horário de
 * Brasília. O CEMADEN informa `atualizado` em UTC; a interface precisa deixar
 * claro que o valor exibido já foi convertido.
 */
export function formatDateTime(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return DATE_TIME_FORMATTER.format(date).replace(',', ' às')
}

export function formatDateTimeShort(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  if (value < 1_000) return `${Math.round(value)} ms`
  return `${(value / 1_000).toFixed(1).replace('.', ',')} s`
}
