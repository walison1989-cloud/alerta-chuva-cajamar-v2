import { ExternalLink, Map, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { OFFICIAL_LINKS, SOURCE_OPEN_METEO } from '@/config/app'

const ROWS = [
  {
    label: 'Open-Meteo',
    role: 'Modelo meteorológico',
    href: SOURCE_OPEN_METEO.href,
    integrated: true,
  },
  {
    label: 'OpenStreetMap',
    role: 'Mapa base',
    href: 'https://www.openstreetmap.org/copyright',
    integrated: true,
  },
  {
    label: 'ViaCEP',
    role: 'Consulta de CEP',
    href: 'https://viacep.com.br/',
    integrated: true,
  },
  {
    label: 'OpenGeocoding',
    role: 'Geocodificação aproximada',
    href: 'https://opengeocoding.com/',
    integrated: true,
  },
  {
    label: 'CEMADEN',
    role: 'Estações e chuva acumulada em 24 h',
    href: OFFICIAL_LINKS.find((link) => link.label === 'CEMADEN')?.href ?? '',
    integrated: true,
  },
  {
    label: 'Supabase + PostGIS',
    role: 'Persistência, RLS e distâncias do imóvel',
    href: 'https://supabase.com/',
    integrated: true,
  },
  {
    label: 'SP Águas',
    role: 'Catálogo histórico de Ponunduva; sem leitura atual integrada',
    href: 'https://ph.spaguas.sp.gov.br/Pluviometricos',
    integrated: false,
    statusLabel: 'Catálogo',
  },
  {
    label: 'INMET',
    role: 'Consulta de catálogo no mapa; sem leitura de chuva integrada',
    href: 'https://portal.inmet.gov.br/servicos/mapa-de-esta%C3%A7%C3%B5es-meteorol%C3%B3gicas',
    integrated: false,
    statusLabel: 'Catálogo',
  },
  {
    label: 'ANA / HidroWeb',
    role: 'API automática depende de autorização da ANA',
    href: 'https://www.snirh.gov.br/hidroweb/',
    integrated: false,
    statusLabel: 'Acesso pendente',
  },
]

export function DataSourcesCard() {
  return (
    <Card className="p-5" aria-labelledby="fontes-dados">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-brand-50 p-2.5 text-brand-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="fontes-dados"
              className="text-base font-bold tracking-tight text-slate-900"
            >
              Fontes e transparência
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              O que alimenta cada informação
            </p>
          </div>
        </div>
      </header>

      <ul className="mt-4 space-y-2">
        {ROWS.map((row) => (
          <li key={row.label}>
            <a
              href={row.href || '#'}
              target={row.href ? '_blank' : undefined}
              rel={row.href ? 'noopener noreferrer' : undefined}
              className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 transition hover:border-brand-200 hover:bg-brand-50/60"
            >
              <Map className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">
                  {row.label}
                </p>
                <p className="text-xs text-slate-500">{row.role}</p>
              </div>
              <Badge tone={row.integrated ? 'safe' : 'neutral'}>
                {row.statusLabel ?? (row.integrated ? 'Ativo' : 'Não integrado')}
              </Badge>
              {row.href ? (
                <ExternalLink
                  className="h-3 w-3 text-slate-300"
                  aria-hidden="true"
                />
              ) : null}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Nenhuma medição de estação é simulada ou inventada no aplicativo. A
        condição atual e a previsão são saídas do modelo Open-Meteo,
        identificadas como tal, e não medições de pluviômetro. O acumulado de
        24 h do CEMADEN é exibido separado de qualquer medição por intervalo.
        O CEP preenche campos, mas não define a posição exata do imóvel.
        Resultados da OpenGeocoding usam dados © OpenStreetMap contributors
        (ODbL), Overture Maps Foundation, OpenAddresses contributors e GeoNames
        (CC BY 4.0, modified).
      </p>
    </Card>
  )
}
