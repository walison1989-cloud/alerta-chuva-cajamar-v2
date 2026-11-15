/**
 * Página de cadastro e gerenciamento de contatos do morador (Fase 2).
 *
 * Permite cadastrar, editar e excluir contatos (celular/e-mail), definir
 * preferências por canal e gerenciar o consentimento. Não envia e-mails,
 * SMS nem notificações reais.
 */

import { useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { useContatos } from '@/hooks/useContatos'
import { ContatoList } from '@/components/contatos/ContatoList'
import { ContatoForm } from '@/components/contatos/ContatoForm'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import type { ContatoFormValues, ContatoResume } from '@/types/contatos'

export function ContatosPage() {
  useDocumentTitle('Meus contatos')
  const location = useLocation()
  const voltarPara = location.state?.voltarPara ?? '/meu-endereco'

  const {
    contatos,
    contatoEmEdicao,
    isLoading,
    isRefreshing,
    error,
    isCreating,
    isUpdating,
    createError,
    updateError,
    deleteError,
    revokeError,
    carregarContatos,
    selecionarContato,
    criarContato,
    atualizarContato,
    excluirContato,
    revogarConsentimento,
    limparErros,
  } = useContatos()

  const [novaVisivel, setNovaVisivel] = useState<boolean>(false)

  const lidarNovo = useCallback(() => {
    setNovaVisivel(true)
    selecionarContato(null)
  }, [selecionarContato])

  const lidarEditar = useCallback(
    (contato: ContatoResume) => {
      // A edição acontece dentro do próprio card, em um único formulário.
      // Não abrir também o formulário de criação evita duplicação.
      setNovaVisivel(false)
      selecionarContato(contato)
    },
    [selecionarContato],
  )

  const lidarCancelarEdicao = useCallback(() => {
    setNovaVisivel(false)
    selecionarContato(null)
  }, [selecionarContato])

  const lidarSalvar = useCallback(
    async (values: ContatoFormValues): Promise<boolean> => {
      const ok = await criarContato(values)
      if (ok) {
        setNovaVisivel(false)
        selecionarContato(null)
        return true
      }
      return false
    },
    [criarContato, selecionarContato],
  )

  const lidarSalvarEdicao = useCallback(
    async (contatoId: number, values: ContatoFormValues): Promise<boolean> => {
      const ok = await atualizarContato(contatoId, values)
      if (ok) {
        setNovaVisivel(false)
        selecionarContato(null)
        return true
      }
      return false
    },
    [atualizarContato, selecionarContato],
  )

  if (isLoading && contatos.length === 0) {
    return (
      <Card className="p-8 text-center" aria-busy="true">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
          <Skeleton className="h-4 w-1/2 rounded animate-pulse" />
          <p className="text-[13px] text-slate-500">Carregando contatos…</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to={voltarPara} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Voltar
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Meus contatos
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Guarde celular e/ou e-mail na sua conta. Esta versão ainda não envia avisos.
            Você controla as preferências e pode
            revogar o consentimento a qualquer momento.
          </p>
        </div>
      </div>

      {error && !contatos.length ? (
        <div className="rounded-xl border border-attention-200 bg-attention-50 p-4" role="alert">
          <p className="text-sm font-bold text-attention-900">
            Não foi possível carregar os contatos
          </p>
          <p className="mt-1 text-[13px] text-attention-800">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void carregarContatos()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5" aria-labelledby="contatos-lista">
          <header className="flex items-start justify-between gap-2 mb-4">
            <div className="flex items-start gap-2.5">
              <span className="rounded-2xl bg-brand-50 p-2 text-brand-700">
                <span className="text-brand-700" aria-hidden="true">&#9742;</span>
              </span>
              <div>
                <h2 id="contatos-lista" className="text-sm font-bold tracking-tight text-slate-900">
                  Seus contatos
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {error ? 'Consulta indisponível; quantidade não confirmada' : `${contatos.length} contato(s) cadastrado(s)`}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={lidarNovo}
              disabled={isCreating || Boolean(error)}
            >
              Novo contato
            </Button>
          </header>
          {error && contatos.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">Não foi possível verificar seus contatos. Use “Tentar novamente” acima. Não é possível afirmar que a lista está vazia.</p> : <ContatoList
            contatos={contatos}
            contatoEmEdicao={contatoEmEdicao}
            isLoading={false}
            isRefreshing={isRefreshing}
            error={null}
            isUpdating={isUpdating}
            updateError={updateError}
            deleteError={deleteError}
            revokeError={revokeError}
            onNovo={lidarNovo}
            onEditar={lidarEditar}
            onSalvarEdicao={lidarSalvarEdicao}
            onExcluir={excluirContato}
            onRevogar={revogarConsentimento}
            onCancelarEdicao={lidarCancelarEdicao}
            limparErros={limparErros}
          />}
        </Card>

        <Card className="p-5" aria-labelledby="preferencias-contato">
          <header className="flex items-start justify-between gap-2 mb-4">
            <div className="flex items-start gap-2.5">
              <span className="rounded-2xl bg-brand-50 p-2 text-brand-700">
                <span className="text-brand-700" aria-hidden="true">&#10004;</span>
              </span>
              <div>
                <h2 id="preferencias-contato" className="text-sm font-bold tracking-tight text-slate-900">
                  Como funciona
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Consentimento, canais e verificação
                </p>
              </div>
            </div>
          </header>
          <ul className="space-y-3 text-[13px] leading-relaxed text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-3 w-3 shrink-0 text-brand-700" aria-hidden="true">
                <span className="rounded-full bg-brand-700 text-xs flex items-center justify-center text-white">1</span>
              </span>
              <div>
                <p className="text-slate-800 font-semibold">
                  Cadastre celular com DDD ou e-mail
                </p>
                <p className="mt-0.5 text-slate-500">
                  Os dados são validados antes de salvar.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-3 w-3 shrink-0 text-brand-700" aria-hidden="true">
                <span className="rounded-full bg-brand-700 text-xs flex items-center justify-center text-white">2</span>
              </span>
              <div>
                <p className="text-slate-800 font-semibold">
                  Escolha os canais de recebimento
                </p>
                <p className="mt-0.5 text-slate-500">
                  Interno (app), e-mail e SMS são independentes.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-3 w-3 shrink-0 text-brand-700" aria-hidden="true">
                <span className="rounded-full bg-brand-700 text-xs flex items-center justify-center text-white">3</span>
              </span>
              <div>
                <p className="text-slate-800 font-semibold">
                  Dê consentimento explícito
                </p>
                <p className="mt-0.5 text-slate-500">
                  Você pode revogar a qualquer momento. Nenhum e-mail ou SMS é
                  enviado agora.
                </p>
              </div>
            </li>
          </ul>
        </Card>
      </div>

      {novaVisivel && (
        <Card className="p-5" aria-labelledby="form-novo-contato">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex items-start gap-2.5">
              <span className="rounded-2xl bg-brand-50 p-2 text-brand-700">
                <span className="text-brand-700" aria-hidden="true">&#43;</span>
              </span>
              <div>
                <h2 id="form-novo-contato" className="text-sm font-bold tracking-tight text-slate-900">
                  {contatoEmEdicao ? 'Editar contato' : 'Novo contato'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {contatoEmEdicao
                    ? 'Atualize os dados do contato selecionado.'
                    : 'Preencha os campos abaixo para cadastrar um novo contato.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={lidarCancelarEdicao}
              className="rounded-xl p-1.5 text-slate-500 hover:text-slate-600 hover:bg-slate-100 transition"
              aria-label="Fechar formulário"
            >
              <span className="text-brand-700" aria-hidden="true">&#215;</span>
            </button>
          </div>
          <ContatoForm
            contato={contatoEmEdicao}
            onSalvar={lidarSalvar}
            onCancelar={lidarCancelarEdicao}
            isSaving={isCreating || isUpdating}
            saveError={createError || updateError}
          />
        </Card>
      )}
    </div>
  )
}
