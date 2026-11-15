import { env } from '@/config/env'

export const APP_NAME = env.appName
export const MUNICIPALITY = env.municipality
export const PROJECT_STAGE = {
  current: 5,
  total: 5,
  label: 'Clima, chuva observada e mapa de Cajamar',
} as const

export const SOURCE_CEMADEN = {
  label: 'CEMADEN',
  href: 'https://www.cemaden.gov.br/',
  mapHref: 'https://mapainterativo.cemaden.gov.br/',
  endpoint: 'https://resources.cemaden.gov.br/dados/311_24.json',
} as const

export const SOURCE_OPEN_METEO = {
  label: 'Open-Meteo',
  href: 'https://open-meteo.com/',
  termsHref: 'https://open-meteo.com/en/terms',
} as const

export interface OfficialLink {
  label: string
  description: string
  href: string
}

export const OFFICIAL_LINKS: OfficialLink[] = [
  {
    label: 'CEMADEN',
    description: 'Monitoramento de desastres naturais',
    href: 'https://www.cemaden.gov.br/',
  },
  {
    label: 'Defesa Civil de São Paulo',
    description: 'Avisos e orientações do estado',
    href: 'https://www.defesacivil.sp.gov.br/',
  },
  {
    label: 'SP Águas',
    description: 'Dados hidrológicos e pluviométricos',
    href: 'https://www.spaguas.sp.gov.br/',
  },
  {
    label: 'Prefeitura de Cajamar',
    description: 'Comunicados oficiais do município',
    href: 'https://www.cajamar.sp.gov.br/',
  },
]

export const EMERGENCY_NUMBERS = [
  {
    label: 'Defesa Civil',
    number: '199',
    href: 'tel:199',
  },
  {
    label: 'Bombeiros',
    number: '193',
    href: 'tel:193',
  },
] as const

export const LEGAL_DISCLAIMER =
  'Projeto independente, informativo e experimental. Não substitui a Defesa Civil, o Corpo de Bombeiros ou qualquer órgão oficial.'
