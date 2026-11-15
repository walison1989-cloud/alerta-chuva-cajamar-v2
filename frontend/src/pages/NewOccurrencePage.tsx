import { PlusCircle } from 'lucide-react'
import { StagePage } from '@/components/layout/StagePage'

export function NewOccurrencePage() {
  return (
    <StagePage
      title="Registrar ocorrência"
      description="Informe alagamentos, transbordamentos e outros problemas observados no município."
      stage={5}
      icon={PlusCircle}
      scope={[
        'Tipo da ocorrência, descrição, data e horário do fato.',
        'Localização confirmada no mapa, com opção de usar a posição do aparelho.',
        'Foto opcional armazenada com acesso protegido, sem exposição pública do endereço.',
        'Status de verificação: pendente, verificado ou rejeitado, com histórico.',
        'Moderação no painel administrativo e registro de auditoria.',
      ]}
      note="O envio de ocorrências depende da autenticação e das políticas RLS já aplicadas. A coleta, a moderação e a publicação estão planejadas para a Etapa 5; nenhum dado é enviado por esta tela nesta etapa."
    />
  )
}
