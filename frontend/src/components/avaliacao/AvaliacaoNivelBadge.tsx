import { Badge } from '@/components/ui/Badge'
import { AVALIACAO_NIVEL_META } from '@/lib/avaliacaoPreventiva'
import type { AvaliacaoNivel } from '@/types/avaliacaoPreventiva'

const BADGE_TONE: Record<
  AvaliacaoNivel,
  'neutral' | 'attention' | 'alert'
> = {
  dados_insuficientes: 'neutral',
  sem_sinal_experimental: 'neutral',
  atencao_experimental: 'attention',
  atencao_forte_experimental: 'alert',
}

interface AvaliacaoNivelBadgeProps {
  nivel: AvaliacaoNivel
  className?: string
}

export function AvaliacaoNivelBadge({
  nivel,
  className,
}: AvaliacaoNivelBadgeProps) {
  return (
    <Badge tone={BADGE_TONE[nivel]} className={className}>
      {AVALIACAO_NIVEL_META[nivel].label}
    </Badge>
  )
}
