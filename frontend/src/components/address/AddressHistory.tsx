import { Clock3, History } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import type { AddressVersionSummary } from '@/types/address'

interface AddressHistoryProps {
  versions: AddressVersionSummary[]
  isLoading: boolean
  error: string | null
}

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : DATE_FORMATTER.format(parsed)
}

export function AddressHistory({
  versions,
  isLoading,
  error,
}: AddressHistoryProps) {
  return (
    <Card className="p-5" aria-labelledby="historico-endereco">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-slate-100 p-2.5 text-slate-600">
          <History className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="historico-endereco"
            className="text-base font-bold tracking-tight text-slate-900"
          >
            Histórico de alterações
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Cada criação ou atualização gera uma versão no banco
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <p className="mt-4 text-xs leading-relaxed text-attention-800">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && versions.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          Nenhuma versão registrada ainda. O histórico aparece depois do
          primeiro salvamento.
        </p>
      ) : null}

      {!isLoading && !error && versions.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"
            >
              <Clock3
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700">
                  {version.operacao === 'INSERT'
                    ? 'Endereço criado'
                    : 'Endereço atualizado'}
                </p>
                <p className="text-xs text-slate-500">
                  {formatTimestamp(version.alterado_em)}
                  {version.precisao
                    ? ` · ${
                        version.precisao === 'geocodificado'
                          ? 'ponto geocodificado'
                          : 'ponto ajustado manualmente'
                      }`
                    : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  )
}
