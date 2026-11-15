import {
  CheckCircle2,
  Clock,
  Database,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import {
  formatDateTime,
  formatDateTimeShort,
  formatDuration,
  formatInteger,
  formatRelativeTime,
} from '@/lib/format'
import type { RainCollectionStatus, RainDataSourceMode } from '@/types/rain'

const STATUS_META: Record<
  string,
  {
    label: string
    tone: 'safe' | 'attention' | 'alert' | 'neutral'
    icon: typeof CheckCircle2
  }
> = {
  sucesso: { label: 'Concluída', tone: 'safe', icon: CheckCircle2 },
  parcial: { label: 'Concluída com ausências', tone: 'attention', icon: TriangleAlert },
  erro: { label: 'Falhou', tone: 'alert', icon: TriangleAlert },
  em_andamento: { label: 'Em andamento', tone: 'neutral', icon: LoaderCircle },
}

function StatusRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-right text-[13px] font-semibold text-slate-700">
        {value}
      </dd>
    </div>
  )
}

interface CollectionStatusCardProps {
  collection: RainCollectionStatus | null
  mode: RainDataSourceMode
}

export function CollectionStatusCard({
  collection,
  mode,
}: CollectionStatusCardProps) {
  if (!collection) {
    return (
      <div className="space-y-2">
        <header className="flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            Status da sincronização
          </h2>
        </header>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Nenhuma coleta registrada
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            A tabela de auditoria ainda não recebeu execuções do conector
            CEMADEN. O mapa pode estar exibindo leitura direta da fonte.
          </p>
        </div>
      </div>
    )
  }

  const meta = collection.status ? STATUS_META[collection.status] : null
  const StatusIcon = meta?.icon ?? Clock

  return (
    <div className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-700" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            Status da sincronização
          </h2>
        </div>
        <Badge tone={meta?.tone ?? 'neutral'}>
          <StatusIcon
            className={
              collection.status === 'em_andamento'
                ? 'h-3 w-3 animate-spin'
                : 'h-3 w-3'
            }
            aria-hidden="true"
          />
          {meta?.label ?? 'Sem status'}
        </Badge>
      </header>

      <dl className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-1.5">
        <StatusRow label="Fonte" value={collection.source} />
        <StatusRow
          label="Última tentativa"
          value={formatDateTimeShort(collection.lastAttemptAt)}
        />
        <StatusRow
          label="Último sucesso"
          value={formatDateTime(collection.lastSuccessAt)}
        />
        <StatusRow
          label="Conjunto atualizado em"
          value={formatDateTime(collection.payloadUpdatedAt)}
        />
        <StatusRow
          label="Estações recebidas"
          value={formatInteger(collection.stationsReceived)}
        />
        <StatusRow
          label="Estações no raio"
          value={formatInteger(collection.stationsNear)}
        />
        <StatusRow
          label={mode === 'cemaden-live' ? 'Com leitura' : 'Medições gravadas'}
          value={formatInteger(collection.measurementsSaved)}
        />
        <StatusRow
          label="Sem leitura válida"
          value={formatInteger(collection.measurementsWithoutReading)}
        />
        <StatusRow
          label="Duração"
          value={formatDuration(collection.durationMs)}
        />
      </dl>

      {collection.lastAttemptAt ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Tentativa {formatRelativeTime(Date.parse(collection.lastAttemptAt))}
        </p>
      ) : null}

      {collection.publicMessage ? (
        <p className="rounded-xl bg-white px-2.5 py-2 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-200/70">
          {collection.publicMessage}
        </p>
      ) : null}

      {mode === 'cemaden-live' ? (
        <p className="rounded-xl border border-attention-200 bg-attention-50 px-2.5 py-2 text-xs leading-relaxed text-attention-900">
          Este status vem da leitura direta do JSONP do CEMADEN. Nenhuma linha
          é gravada no Supabase e o horário é o de atualização do conjunto
          informado pela fonte.
        </p>
      ) : null}
    </div>
  )
}
