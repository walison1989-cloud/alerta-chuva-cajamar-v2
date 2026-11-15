import { ShieldCheck } from 'lucide-react'
import { StagePage } from '@/components/layout/StagePage'

export function AdminPage() {
  return (
    <StagePage
      title="Painel administrativo"
      description="Área restrita para acompanhar ocorrências, estações, integrações e auditoria."
      stage={5}
      icon={ShieldCheck}
      scope={[
        'Moderação e verificação de ocorrências com trilha de auditoria.',
        'Acompanhamento do estado das estações e da atualização de cada fonte.',
        'Monitoramento das integrações e dos erros de coleta.',
        'Gestão de usuários autorizados e papéis de acesso.',
        'Consulta aos registros de auditoria e às configurações do sistema.',
      ]}
      note="O painel será protegido por autenticação e RLS, com separação entre dados públicos e privados. A chave service_role nunca será exposta no frontend; operações privilegiadas rodarão em Edge Functions."
    />
  )
}
