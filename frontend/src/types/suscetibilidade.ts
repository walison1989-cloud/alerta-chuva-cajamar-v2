import type { MultiPolygon } from 'geojson'

export type SuscetibilidadeTipo = 'inundacao' | 'enxurrada'

export type SuscetibilidadeClasse = 'Alta' | 'Media' | 'Baixa' | 'Enxurrada'

/**
 * Feição pública da carta oficial. A geometria já vem em WGS 84 (SRID 4326),
 * transformada pelo PostGIS a partir de SIRGAS 2000 / UTM 23S.
 */
export interface SuscetibilidadeFeature {
  id: number
  cartografiaSlug: string
  tipo: SuscetibilidadeTipo
  classe: SuscetibilidadeClasse
  classeOrdem: number | null
  processo: string
  areaHa: number
  geojson: MultiPolygon
}

/** Metadados públicos de proveniência da cartografia importada. */
export interface CartografiaSuscetibilidade {
  id: number
  slug: string
  titulo: string
  fonte: string
  editor: string
  municipio: string
  uf: string
  escala: string
  anoPublicacao: number | null
  mesPublicacao: number | null
  urlItem: string
  urlDownload: string | null
  licenca: string | null
  sridOrigem: number
  sridDestino: number
  importadoEm: string | null
  totalInundacao: number
  totalEnxurrada: number
  areaHaInundacao: number
  areaHaEnxurrada: number
  metadados: Record<string, unknown>
}

/**
 * Resultado da consulta autenticada ancorada em auth.uid(). Nunca contém as
 * coordenadas do imóvel: apenas a relação da área oficial com o ponto privado.
 */
export interface AreaSuscetibilidadeProxima {
  id: number
  cartografiaSlug: string
  tipo: SuscetibilidadeTipo
  classe: SuscetibilidadeClasse
  classeOrdem: number | null
  processo: string
  areaHa: number
  contemPonto: boolean
  distanciaM: number
}

export interface SuscetibilidadeSnapshot {
  cartografia: CartografiaSuscetibilidade | null
  features: SuscetibilidadeFeature[]
}
