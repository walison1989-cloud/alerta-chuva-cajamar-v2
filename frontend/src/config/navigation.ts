import {
  FlaskConical,
  Home,
  Map,
  MapPin,
  Mail,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react'
import { env } from '@/config/env'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  end?: boolean
  stage: number
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Início',
    shortLabel: 'Início',
    description: 'Condições e previsão',
    icon: Home,
    end: true,
    stage: 1,
  },
  {
    to: '/mapa',
    label: 'Mapa',
    shortLabel: 'Mapa',
    description: 'Estações e ocorrências',
    icon: Map,
    stage: 3,
  },
  {
    to: '/ocorrencias/nova',
    label: 'Registrar ocorrência',
    shortLabel: 'Ocorrência',
    description: 'Informar alagamento',
    icon: PlusCircle,
    stage: 5,
  },
  {
    to: '/meu-endereco',
    label: 'Meu endereço',
    shortLabel: 'Endereço',
    description: 'Cadastrar localização',
    icon: MapPin,
    stage: 4,
  },
  {
    to: '/contatos',
    label: 'Meus contatos',
    shortLabel: 'Contatos',
    description: 'Celular, e-mail e preferências',
    icon: Mail,
    stage: 6,
  },
  {
    to: '/analise-preventiva',
    label: 'Análise preventiva',
    shortLabel: 'Análise',
    description: 'Leitura experimental',
    icon: FlaskConical,
    stage: 5,
  },
  {
    to: '/painel',
    label: 'Painel administrativo',
    shortLabel: 'Painel',
    description: 'Gestão e auditoria',
    icon: ShieldCheck,
    stage: 5,
  },
]


export const MAIN_NAV = NAV_ITEMS.filter(item =>
  item.to !== '/ocorrencias/nova' && item.to !== '/painel' &&
  (item.to !== '/analise-preventiva' || env.experimentalAnalysisEnabled),
)
