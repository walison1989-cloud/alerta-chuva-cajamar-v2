import type { SupabaseClient } from '@supabase/supabase-js'
import type { MultiPolygon } from 'geojson'
import type {
  AreaSuscetibilidadeProxima,
  CartografiaSuscetibilidade,
  SuscetibilidadeClasse,
  SuscetibilidadeFeature,
  SuscetibilidadeSnapshot,
  SuscetibilidadeTipo,
} from '@/types/suscetibilidade'

/** Raio padrão da consulta do imóvel: 500 m. Não é raio de risco. */
export const SUSCETIBILIDADE_RAIO_M = 500
export const SUSCETIBILIDADE_LIMITE = 20

export const SUSCETIBILIDADE_FONTE = {
  label: 'SGB/CPRM e IPT',
  escala: '1:25.000',
  ano: 2017,
  href: 'https://rigeo.sgb.gov.br/items/ffa6864e-5fbd-4e3e-a1bd-28d22fe50cf4',
} as const

/**
 * Metadados de exibição das classes originais da carta. A ordem não é uma
 * escala de risco: é apenas a ordem de legenda usada pela fonte.
 */
export const SUSCETIBILIDADE_META: Record<
  SuscetibilidadeClasse,
  { label: string; color: string; description: string }
> = {
  Alta: {
    label: 'Alta',
    color: '#b91c1c',
    description:
      'Planícies aluviais e terrenos baixos com maior predisposição na carta.',
  },
  Media: {
    label: 'Média',
    color: '#ea580c',
    description:
      'Terraços fluviais baixos e flancos de encosta, com predisposição intermediária.',
  },
  Baixa: {
    label: 'Baixa',
    color: '#ca8a04',
    description:
      'Áreas marginais ou de menor predisposição relativa na carta.',
  },
  Enxurrada: {
    label: 'Enxurrada',
    color: '#7c3aed',
    description:
      'Trechos mapeados como suscetíveis a fluxos rápidos de água e sedimentos.',
  },
}

export const SUSCETIBILIDADE_NOTA =
  'Suscetibilidade descreve a predisposição do terreno na carta oficial. Não é previsão de alagamento, não indica chuva e não substitui alertas da Defesa Civil.'

const TIPOS: SuscetibilidadeTipo[] = ['inundacao', 'enxurrada']
const CLASSES: SuscetibilidadeClasse[] = [
  'Alta',
  'Media',
  'Baixa',
  'Enxurrada',
]

export class SuscetibilidadeRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SuscetibilidadeRepositoryError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readText(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readInteger(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = readNumber(source, key)
  return value === null ? null : Math.trunc(value)
}

function readTipo(value: string | null): SuscetibilidadeTipo | null {
  return value && TIPOS.includes(value as SuscetibilidadeTipo)
    ? (value as SuscetibilidadeTipo)
    : null
}

function readClasse(value: string | null): SuscetibilidadeClasse | null {
  return value && CLASSES.includes(value as SuscetibilidadeClasse)
    ? (value as SuscetibilidadeClasse)
    : null
}

function isMultiPolygon(value: unknown): value is MultiPolygon {
  const record = asRecord(value)
  return record?.type === 'MultiPolygon' && Array.isArray(record.coordinates)
}

/**
 * Normaliza uma linha da view pública. Feições sem id, classe reconhecida,
 * geometria MultiPolygon ou área positiva são descartadas em vez de exibidas
 * como se fossem oficiais.
 */
export function mapSuscetibilidadeFeatureRow(
  row: unknown,
): SuscetibilidadeFeature | null {
  const source = asRecord(row)
  if (!source) return null

  const id = readInteger(source, 'id')
  const cartografiaSlug = readText(source, 'cartografia_slug')
  const tipo = readTipo(readText(source, 'tipo'))
  const classe = readClasse(readText(source, 'classe'))
  const processo = readText(source, 'processo')
  const areaHa = readNumber(source, 'area_ha')
  const geojson = source.geojson

  if (id === null || !cartografiaSlug || !tipo || !classe) return null
  if (!processo || areaHa === null || areaHa <= 0) return null
  if (!isMultiPolygon(geojson)) return null

  return {
    id,
    cartografiaSlug,
    tipo,
    classe,
    classeOrdem: readInteger(source, 'classe_ordem'),
    processo,
    areaHa,
    geojson,
  }
}

export function mapCartografiaRow(
  row: unknown,
): CartografiaSuscetibilidade | null {
  const source = asRecord(row)
  if (!source) return null

  const id = readInteger(source, 'id')
  const slug = readText(source, 'slug')
  const titulo = readText(source, 'titulo')
  const fonte = readText(source, 'fonte')
  const editor = readText(source, 'editor')
  const escala = readText(source, 'escala')
  const urlItem = readText(source, 'url_item')

  if (id === null || !slug || !titulo || !fonte || !editor) return null
  if (!escala || !urlItem) return null

  const metadados = asRecord(source.metadados)

  return {
    id,
    slug,
    titulo,
    fonte,
    editor,
    municipio: readText(source, 'municipio') ?? '',
    uf: readText(source, 'uf') ?? '',
    escala,
    anoPublicacao: readInteger(source, 'ano_publicacao'),
    mesPublicacao: readInteger(source, 'mes_publicacao'),
    urlItem,
    urlDownload: readText(source, 'url_download'),
    licenca: readText(source, 'licenca'),
    sridOrigem: readInteger(source, 'srid_origem') ?? 0,
    sridDestino: readInteger(source, 'srid_destino') ?? 4326,
    importadoEm: readText(source, 'importado_em'),
    totalInundacao: readInteger(source, 'total_inundacao') ?? 0,
    totalEnxurrada: readInteger(source, 'total_enxurrada') ?? 0,
    areaHaInundacao: readNumber(source, 'area_ha_inundacao') ?? 0,
    areaHaEnxurrada: readNumber(source, 'area_ha_enxurrada') ?? 0,
    metadados: metadados ?? {},
  }
}

export function mapAreaProximaRow(
  row: unknown,
): AreaSuscetibilidadeProxima | null {
  const source = asRecord(row)
  if (!source) return null

  const id = readInteger(source, 'id')
  const cartografiaSlug = readText(source, 'cartografia_slug')
  const tipo = readTipo(readText(source, 'tipo'))
  const classe = readClasse(readText(source, 'classe'))
  const processo = readText(source, 'processo')
  const areaHa = readNumber(source, 'area_ha')
  const distanciaM = readNumber(source, 'distancia_m')

  if (id === null || !cartografiaSlug || !tipo || !classe) return null
  if (!processo || areaHa === null || distanciaM === null) return null

  return {
    id,
    cartografiaSlug,
    tipo,
    classe,
    classeOrdem: readInteger(source, 'classe_ordem'),
    processo,
    areaHa,
    contemPonto: source.contem_ponto === true,
    distanciaM,
  }
}

/**
 * Carrega a camada pública (GeoJSON) e os metadados da carta publicada.
 * Quando a migration ainda não foi aplicada, lança um erro acionável — a
 * interface mostra a indisponibilidade, nunca uma camada inventada.
 */
export async function fetchSuscetibilidadePublica(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<SuscetibilidadeSnapshot> {
  const featureBuilder = client
    .from('vw_areas_suscetibilidade_publicas')
    .select('*')
    .limit(1000)
  if (signal) featureBuilder.abortSignal(signal)

  const cartografiaBuilder = client
    .from('vw_cartografias_suscetibilidade_publicas')
    .select('*')
    .limit(1)
  if (signal) cartografiaBuilder.abortSignal(signal)

  const [featuresResult, cartografiaResult] = await Promise.all([
    featureBuilder,
    cartografiaBuilder,
  ])

  if (featuresResult.error) {
    throw new SuscetibilidadeRepositoryError(
      'A camada oficial de suscetibilidade ainda não está publicada no Supabase. Aplique a migration e a importação da Etapa 5.',
    )
  }

  const features = ((featuresResult.data ?? []) as unknown[])
    .map(mapSuscetibilidadeFeatureRow)
    .filter((item): item is SuscetibilidadeFeature => item !== null)
    .sort((left, right) => {
      const order =
        (right.classeOrdem ?? 0) - (left.classeOrdem ?? 0)
      if (order !== 0) return order
      return left.tipo.localeCompare(right.tipo) || left.id - right.id
    })

  const cartografia = cartografiaResult.error
    ? null
    : (((cartografiaResult.data ?? []) as unknown[])
        .map(mapCartografiaRow)
        .find((item): item is CartografiaSuscetibilidade => item !== null) ??
      null)

  return { cartografia, features }
}

/**
 * Consulta ancorada no endereço privado do usuário. O navegador não envia
 * coordenadas: o PostGIS usa auth.uid() e devolve apenas classe, distância e
 * se o ponto está contido na área.
 */
export async function fetchSuscetibilidadeDoMorador(
  client: SupabaseClient,
  radiusM = SUSCETIBILIDADE_RAIO_M,
  limit = SUSCETIBILIDADE_LIMITE,
  signal?: AbortSignal,
): Promise<AreaSuscetibilidadeProxima[]> {
  const builder = client.rpc('areas_suscetibilidade_do_morador', {
    p_raio_m: radiusM,
    p_limite: limit,
  })
  if (signal) builder.abortSignal(signal)

  const { data, error } = await builder
  if (error) {
    throw new SuscetibilidadeRepositoryError(
      'Não foi possível consultar a suscetibilidade do imóvel. Confirme se a migration da Etapa 5 foi aplicada e se há endereço cadastrado.',
    )
  }

  return ((data ?? []) as unknown[])
    .map(mapAreaProximaRow)
    .filter((item): item is AreaSuscetibilidadeProxima => item !== null)
}

export function formatAreaSuscetibilidade(areaHa: number): string {
  if (!Number.isFinite(areaHa) || areaHa <= 0) return '—'
  if (areaHa < 0.01) {
    const m2 = areaHa * 10_000
    return `${new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: 1,
    }).format(m2)} m²`
  }
  return `${new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
  }).format(areaHa)} ha`
}

export function formatDistanciaSuscetibilidade(
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value < 1000) return `${Math.round(value)} m`
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 1000)} km`
}

export function describeTipoSuscetibilidade(
  tipo: SuscetibilidadeTipo,
): string {
  return tipo === 'inundacao'
    ? 'Suscetibilidade a inundação'
    : 'Suscetibilidade a enxurrada'
}
