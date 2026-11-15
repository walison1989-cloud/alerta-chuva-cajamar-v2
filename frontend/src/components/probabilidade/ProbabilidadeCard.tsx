import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"

export interface ProbabilidadeCardProps {
  /** Versão do modelo (ex.: "2.0.0-preparacao") */
  versaoModelo: string
  /** Data do cálculo (ISO 8601) */
  dataCalculo: string
  /** Horizonte em horas (ex.: 24) */
  horizonteHoras: number
  /** Percentual de probabilidade (NULL se não calibrado) */
  percentual: number | null
  /** Qualidade dos dados: 'boa' | 'limitada' | 'sem_dados' | 'fora_cobertura' */
  qualidadeDados: string
  /** Fatores utilizados na avaliação */
  fatoresUtilizados: string[]
  /** Nível de risco descritivo (não probabilístico) */
  nivelRisco: string
  /** Mensagem explicativa */
  mensagem: string
  /** Fonte dos dados */
  fonte: string
  /** Indica se o modelo está calibrado */
  ehCalibrado: boolean
}

function qualidadeLabel(qualidade: string): string {
  switch (qualidade) {
    case "boa": return "Boa"
    case "limitada": return "Limitada"
    case "sem_dados": return "Sem dados"
    case "fora_cobertura": return "Fora da cobertura"
    default: return qualidade
  }
}

function qualidadeTone(qualidade: string): "brand" | "neutral" | "attention" | "alert" | "safe" {
  switch (qualidade) {
    case "boa": return "safe"
    case "limitada": return "neutral"
    case "sem_dados": return "attention"
    case "fora_cobertura": return "alert"
    default: return "neutral"
  }
}

export function ProbabilidadeCard(props: ProbabilidadeCardProps) {
  const {
    versaoModelo,
    dataCalculo,
    horizonteHoras,
    percentual,
    qualidadeDados,
    fatoresUtilizados,
    nivelRisco,
    mensagem,
    fonte,
    ehCalibrado,
  } = props

  const dataFormatada = new Date(dataCalculo).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  return (
    <Card className="p-4">
      <div className="mb-3">
        <div className="font-semibold">Motor Probabilístico 2.0</div>
        <Badge
          tone={ehCalibrado ? "safe" : "neutral"}
        >
          {ehCalibrado ? "Modelo calibrado" : "Modelo não calibrado"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div className="bg-slate-50 p-2 rounded">
          <div className="text-xs text-slate-500">Versão do modelo</div>
          <div className="font-mono text-xs">{versaoModelo}</div>
        </div>
        <div className="bg-slate-50 p-2 rounded">
          <div className="text-xs text-slate-500">Horizonte</div>
          <div className="font-mono text-xs">{horizonteHoras} horas</div>
        </div>
        <div className="bg-slate-50 p-2 rounded">
          <div className="text-xs text-slate-500">Data do cálculo</div>
          <div className="font-mono text-xs">{dataFormatada}</div>
        </div>
        <div className="bg-slate-50 p-2 rounded">
          <div className="text-xs text-slate-500">Qualidade dos dados</div>
          <Badge tone={qualidadeTone(qualidadeDados)} className="mt-1">
            {qualidadeLabel(qualidadeDados)}
          </Badge>
        </div>
      </div>

      <div className="bg-slate-50 p-3 rounded mb-3">
        <div className="text-xs text-slate-500 mb-1">
          Percentual de probabilidade ({horizonteHoras}h)
        </div>
        <div className="text-xl font-mono font-bold">
          {percentual === null ? "—" : `${percentual.toFixed(1)}%`}
        </div>
        {percentual === null && (
          <p className="text-xs text-slate-500 mt-1">
            Sem modelo calibrado. Não invente porcentagens.
          </p>
        )}
      </div>

      <div className="bg-slate-50 p-3 rounded mb-3">
        <div className="text-xs text-slate-500 mb-1">Nível de risco</div>
        <div className="text-sm font-medium">{nivelRisco}</div>
      </div>

      <div className="bg-slate-50 p-3 rounded mb-3">
        <div className="text-xs text-slate-500 mb-1">Mensagem</div>
        <p className="text-sm">{mensagem}</p>
      </div>

      {fatoresUtilizados.length > 0 && (
        <div className="bg-slate-50 p-3 rounded mb-3">
          <div className="text-xs text-slate-500 mb-1">
            Fatores utilizados
          </div>
          <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
            {fatoresUtilizados.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-slate-500 border-t pt-3">
        Fonte: {fonte}
      </div>
    </Card>
  )
}
