import { AlertTriangle, Bell, CheckCircle2, CloudRain, HelpCircle, MapPin, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { env } from '@/config/env'
import { useAuth } from '@/hooks/useAuth'
import { useAvaliacaoPreventiva } from '@/hooks/useAvaliacaoPreventiva'
import { useTriagemHidrologica } from '@/hooks/useTriagemHidrologica'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { resumirRiscoEndereco } from '@/lib/statusRiscoEndereco'
import { classificarChuvaAgora } from '@/lib/chuvaAgora'
import { TriangulacaoChuvaCard } from '@/components/avaliacao/TriangulacaoChuvaCard'
import { PushNotificationsCard } from '@/components/avaliacao/PushNotificationsCard'

function PainelEndereco() {
  const { user } = useAuth()
  const query = useAvaliacaoPreventiva(user?.id ?? null)
  const triagemAutomatica = useTriagemHidrologica(query.address?.id ?? null)
  const status = resumirRiscoEndereco(query.avaliacao, {
    chuvaTriangulada: query.chuvaTriangulada,
    previsao: query.previsao,
    agora: query.avaliadoEm,
  })
  const carregando = query.isLoading || query.weatherIsLoading || query.estacoesEspaciaisLoading
  const estilo = status.status === 'risco'
    ? 'border-red-300 bg-red-50 text-red-950'
    : status.status === 'sem_indicios'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
      : status.status === 'acompanhamento'
        ? 'border-sky-300 bg-sky-50 text-sky-950'
      : 'border-amber-300 bg-amber-50 text-amber-950'
  const Icone = status.status === 'risco'
    ? AlertTriangle : status.status === 'sem_indicios' ? CheckCircle2 : HelpCircle
  const terreno = query.evidencias?.terreno
  const chuvaEstimativa = query.chuvaTriangulada?.suporteEspacial ? query.chuvaTriangulada.chuvaObservadaMm : null
  const chuva = chuvaEstimativa ?? query.avaliacao?.resultado.estacaoReferencia?.chuva24hMm
  const fonteChuva = chuvaEstimativa !== null
    ? query.chuvaTriangulada?.metodo === 'direta' ? 'Medição próxima (24 h)' : 'Chuva estimada (3 estações, 24 h)'
    : 'Chuva na estação de referência (24 h)' 
  const previsao = query.previsao?.precipMm24h
  const situacaoAgora = classificarChuvaAgora(query.weather?.current, query.weather?.fetchedAt)
  const chuvaAgoraIndicada = situacaoAgora === 'chuva_indicada'
  const condicaoAtual = query.weather?.current.condition.label ?? 'Indisponível'

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Risco de alagamento no meu endereço</h1>
        <p className="mt-2 text-sm text-slate-600">Acompanhamento preventivo com chuva, previsão, terreno e suscetibilidade.</p>
      </header>
      <Card className="p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <MapPin className="mt-1 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-slate-900">{query.origin === 'imovel' ? 'Endereço cadastrado' : 'Endereço não confirmado'}</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {query.origin === 'imovel' ? [query.address?.bairro, query.address?.municipio].filter(Boolean).join(' · ') : 'Confirme seu endereço para avaliar o local onde você mora.'}
            </p>
            <Link to="/meu-endereco" className="mt-2 inline-block text-sm font-semibold text-brand-700 underline underline-offset-2">Conferir localização</Link>
          </div>
        </div>
      </Card>
      <section aria-live="polite" className={`rounded-2xl border p-5 ${chuvaAgoraIndicada ? 'border-sky-300 bg-sky-50 text-sky-950' : 'border-slate-200 bg-white text-slate-800'}`}>
        <div className="flex items-start gap-3">
          <CloudRain className="mt-1 h-7 w-7 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold">{chuvaAgoraIndicada ? 'Chuva indicada agora perto do endereço' : situacaoAgora === 'sem_chuva_indicada' ? 'Sem chuva indicada agora pela previsão' : 'Condição de chuva atual indisponível'}</h2>
            <p className="mt-1 text-sm">{situacaoAgora === 'indisponivel' ? 'A medição estimada está ausente ou desatualizada. Isso não significa que não esteja chovendo.' : `${condicaoAtual} · Precipitação estimada no intervalo atual: ${query.weather!.current.precipitationMm.toFixed(1).replace('.', ',')} mm.`}</p>
            <p className="mt-2 text-xs">Fonte: Open-Meteo, grade meteorológica próxima ao endereço, não pluviômetro no imóvel. Horário da última consulta: {query.weather ? new Date(query.weather.fetchedAt).toLocaleString('pt-BR') : 'não disponível'}. A chuva local pode diferir do modelo.</p>
          </div>
        </div>
      </section>
      <section aria-live="polite" aria-busy={carregando} className={`rounded-3xl border-2 p-6 shadow-card sm:p-8 ${estilo}`}>
        <Icone className="h-10 w-10" aria-hidden="true" />
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide">Situação do endereço</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {carregando && !query.avaliacao ? 'Verificando dados…' : status.titulo}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed">{status.mensagem}</p>
        <div className="mt-4 rounded-xl border border-current/15 bg-white/70 px-4 py-3 text-sm" role="status">
          <strong>Alagamento neste endereço:</strong> {status.riscoAlagamento}
        </div>
        {status.avisoDados ? <p className="mt-2 text-xs font-medium">{status.avisoDados}</p> : null}
        <p className="mt-3 text-xs font-medium opacity-80">Avaliação experimental · Não é alerta oficial nem garantia de segurança.</p>
        {query.error ? <p role="alert" className="mt-3 text-sm font-semibold">{query.error}</p> : null}
        <Button type="button" variant="secondary" size="sm" className="mt-5" onClick={query.refresh} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
          Atualizar avaliação
        </Button>
      </section>
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">Dados verificados</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-slate-500">{fonteChuva}</dt><dd className="mt-1 font-bold text-slate-900">{typeof chuva === 'number' ? `${chuva.toFixed(1).replace('.', ',')} mm` : 'Sem leitura válida'}</dd></div>
          <div><dt className="text-slate-500">Chuva prevista (24 h)</dt><dd className="mt-1 font-bold text-slate-900">{typeof previsao === 'number' ? `${previsao.toFixed(1).replace('.', ',')} mm` : 'Indisponível'}</dd></div>
          <div><dt className="text-slate-500">Altura relativa do terreno</dt><dd className="mt-1 font-bold text-slate-900">{typeof terreno?.elevacaoRelativaM === 'number' ? `${terreno.elevacaoRelativaM.toFixed(1).replace('.', ',')} m` : 'Não obtida'}</dd></div>
          <div><dt className="text-slate-500">Exposição hidrológica</dt><dd className="mt-1 font-bold text-slate-900">{query.avaliacao?.resultado.diagnostico?.exposicao === 'confirmada' ? 'Confirmada' : 'Não comprovada'}</dd></div>
        </dl>
        {query.terrenoDiagnostico ? (
          <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
            <strong>Diagnóstico da altimetria:</strong> {query.terrenoDiagnostico}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">A altitude relativa não comprova sozinha que a água alcance o imóvel. Dados das estações também podem ter cobertura limitada.</p>
      </Card>
      {query.leituraTriangulada ? (
        <TriangulacaoChuvaCard
          leitura={query.leituraTriangulada}
          isLoading={query.estacoesEspaciaisLoading || query.weatherIsLoading}
          error={query.estacoesEspaciaisError}
        />
      ) : null}
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">Triagem automática no servidor</h2>
        {triagemAutomatica ? (
          <>
            <p className="mt-2 text-sm text-slate-700">Última avaliação: {new Date(triagemAutomatica.avaliado_em).toLocaleString('pt-BR')}.</p>
            <p className="mt-2 font-semibold text-slate-900">{triagemAutomatica.nivel === 'atencao_experimental' ? 'Atenção experimental: chuva e suscetibilidade no ponto' : triagemAutomatica.nivel === 'atencao_meteorologica' ? 'Acompanhamento meteorológico' : triagemAutomatica.nivel === 'sem_sinal_meteorologico' ? 'Sem sinais meteorológicos relevantes nos limites experimentais' : 'Dados insuficientes'}</p>
            <p className="mt-2 text-sm text-slate-700">Processos mapeados exatamente no local: {triagemAutomatica.processos.length ? triagemAutomatica.processos.map(item => item === 'inundacao' ? 'inundação' : item === 'enxurrada' ? 'enxurrada' : item).join(', ') : 'não identificados'}. Chuva atual na grade meteorológica: {triagemAutomatica.chuva_agora_modelo === null ? 'indisponível' : triagemAutomatica.chuva_agora_modelo ? 'indicada' : 'não indicada'}.</p>
            <p className="mt-2 text-xs text-slate-500">Triagem experimental, não é alerta de Defesa Civil nem confirmação de inundação ou segurança do imóvel.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Ainda não existe triagem automática registrada para este endereço. A análise da tela funciona de forma independente. O monitoramento contínuo exige ativação no servidor.</p>
        )}
      </Card>
      <PushNotificationsCard userId={user?.id ?? null} enderecoId={query.address?.id ?? null} />
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3"><Bell className="h-6 w-6 text-brand-700" aria-hidden="true" /><h2 className="text-lg font-bold text-slate-900">Outros canais de aviso: e-mail e celular</h2></div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Cadastre um contato e autorize o canal de aviso. O envio automático exige a configuração do serviço de notificações no servidor; o cadastro sozinho não ativa os disparos.</p>
        <Link to="/contatos" className={buttonStyles('primary', 'md', 'mt-4')}>Cadastrar ou verificar meu contato</Link>
      </Card>
      <p className="flex gap-2 text-sm text-slate-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Em emergência, acompanhe a Defesa Civil e ligue 199. Uma avaliação sem indícios não elimina todos os riscos.</p>
    </main>
  )
}

export function AvaliacaoPreventivaPage() {
  useDocumentTitle('Risco de alagamento no meu endereço')
  if (!env.experimentalAnalysisEnabled) {
    return <Card className="p-6"><h1 className="text-xl font-bold">Avaliação temporariamente indisponível</h1><p className="mt-2 text-sm text-slate-600">A análise experimental está desativada. Continue acompanhando os comunicados da Defesa Civil.</p></Card>
  }
  return <PainelEndereco />
}
