/**
 * Formulário de cadastro/edição de contato do morador (Fase 2).
 *
 * Valida telefone brasileiro com DDD e e-mail. Não simula confirmação
 * de celular nem de e-mail. Se não houver provedor de verificação, o
 * contato permanece como não verificado.
 */

import { useId, useState } from 'react'
import { X, Phone, Mail, Loader2, AlertTriangle } from 'lucide-react'
import { focusFirstInvalid } from '@/lib/formFocus'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  validarFormularioContato,
  validarTelefoneBrasileiro,
  validarEmail,
} from '@/lib/contatoValidation'
import type { ContatoFormValues, ContatoResume } from '@/types/contatos'

const VERSAO_CONSENTIMENTO = '1.0'

const TEXTO_CONSENTIMENTO =
  'Eu autorizo o Alerta de Chuva Cajamar a utilizar este contato para enviar avisos preventivos relacionados à localização do meu imóvel, respeitando as preferências de canal selecionadas. Posso revogar este consentimento a qualquer momento.'

export function ContatoForm({
  contato,
  onSalvar,
  onCancelar,
  isSaving,
  saveError,
}: {
  contato: ContatoResume | null
  onSalvar: (values: ContatoFormValues) => Promise<boolean>
  onCancelar: () => void
  isSaving: boolean
  saveError: string | null
}) {
  const formId=useId()
  const [values, setValues] = useState<ContatoFormValues>({
    nome: contato?.nome ?? '',
    tipoContato: (contato?.tipoContato as ContatoFormValues['tipoContato']) ?? 'celular',
    telefone: contato?.telefone ? extrairDigitos(contato.telefone) : '',
    email: contato?.email ?? '',
    canalInterno: contato?.preferencias.interno ?? true,
    canalEmail: contato?.verificado ? contato.preferencias.email : false,
    canalSms: contato?.verificado ? contato.preferencias.sms : false,
    consentimento: contato?.consentimento ?? false,
    versaoConsentimento: VERSAO_CONSENTIMENTO,
  })

  const [erros, setErros] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Sem provedor real de verificação de celular/e-mail, os canais externos
  // ficam desabilitados. A constraint do banco também impede ativá-los
  // enquanto verificado_em for nulo.
  const canaisExternosDisponiveis = Boolean(contato?.verificado)

  const campoTocado = (campo: string) => Boolean(touched[campo])
  const erroCampo = (campo: string) =>
    campoTocado(campo) ? erros[campo] : null

  const marcaTocado = (campo: string) => {
    setTouched((prev) => ({ ...prev, [campo]: true }))
  }

  const limparErroCampo = (campo: string) => {
    setErros((prev) => {
      const novo = { ...prev }
      delete novo[campo]
      return novo
    })
  }

  const telefoneValido = validarTelefoneBrasileiro(values.telefone)
  const emailValido = validarEmail(values.email)

  const lidarMudancaTexto = (campo: keyof ContatoFormValues) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const valor = e.target.value
      setValues((prev) => ({ ...prev, [campo]: valor }))
      limparErroCampo(campo)
    }
  }

  const lidarMudancaSelect = (campo: keyof ContatoFormValues) => {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      const valor = e.target.value
      setValues((prev) => ({ ...prev, [campo]: valor as ContatoFormValues[keyof ContatoFormValues] }))
      limparErroCampo(campo)
    }
  }

  const lidarMudancaCheckbox = (campo: keyof ContatoFormValues) => {
    return () => {
      setValues((prev) => ({ ...prev, [campo]: !prev[campo] as boolean }))
      limparErroCampo(campo)
    }
  }

  const lidarSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const resultado = validarFormularioContato({
      nome: values.nome,
      tipoContato: values.tipoContato,
      telefone:
        values.tipoContato === 'celular' || values.tipoContato === 'outro'
          ? values.telefone
          : null,
      email: values.tipoContato === 'email' ? values.email : null,
      consentimento: values.consentimento,
      versaoConsentimento: values.versaoConsentimento,
    })
    setErros(resultado.erros)
    setTouched({
      nome: true,
      tipoContato: true,
      telefone: true,
      email: true,
      consentimento: true,
      versaoConsentimento: true,
    })
    if (!resultado.valido) { focusFirstInvalid(e.currentTarget); return }

    const valoresParaSalvar: ContatoFormValues = {
      ...values,
      canalEmail: canaisExternosDisponiveis ? values.canalEmail : false,
      canalSms: canaisExternosDisponiveis ? values.canalSms : false,
      telefone:
        values.tipoContato === 'celular' || values.tipoContato === 'outro'
          ? telefoneValido.digitos ?? ''
          : '',
      email:
        values.tipoContato === 'email'
          ? emailValido.normalizado ?? ''
          : '',
    }
    await onSalvar(valoresParaSalvar)
  }

  const tipoEhCelularOuOutro =
    values.tipoContato === 'celular' || values.tipoContato === 'outro'
  const tipoEhEmail = values.tipoContato === 'email'

  const jaVerificado = contato?.verificado

  const inputClass = 'flex min-h-12 w-full min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-700 focus:ring-1 focus:ring-brand-700 disabled:bg-slate-50 disabled:text-slate-500 transition-colors'

  return (
    <Card className="space-y-4 p-5 sm:p-6" aria-labelledby="formulario-contato">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="rounded-2xl bg-brand-50 p-2 text-brand-700">
            {contato ? (
              <Phone className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Mail className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <div>
            <h2
              id="formulario-contato"
              className="text-sm font-bold tracking-tight text-slate-900"
            >
              {contato ? 'Editar contato' : 'Novo contato'}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              {contato
                ? 'Revise seus dados e suas preferências. Você pode revogar o consentimento a qualquer momento.'
                : 'Guarde celular ou e-mail na sua conta. Esta versão ainda não envia notificações.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancelar}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-600 hover:bg-slate-100 transition"
          aria-label="Fechar formulário"
          disabled={isSaving}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <form noValidate aria-busy={isSaving || undefined} onSubmit={lidarSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor={`${formId}-nome`}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              Nome
              <span className="text-attention-700" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              autoComplete="name"
              id={formId+"-nome"} name="nome" value={values.nome}
              onChange={lidarMudancaTexto('nome')}
              onBlur={() => marcaTocado('nome')}
              placeholder="João da Silva"
              className={inputClass}
              aria-invalid={campoTocado('nome') && !!erroCampo('nome')}
              aria-describedby={campoTocado('nome') && erros.nome ? formId+'-erro-nome' : undefined}
              disabled={isSaving}
            />
            {campoTocado('nome') && erroCampo('nome') ? (
              <p id={formId+"-erro-nome"} className="text-xs text-attention-700" role="alert">
                {erroCampo('nome')}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`${formId}-tipoContato`}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              Tipo de contato
              <span className="text-attention-700" aria-hidden="true">*</span>
            </label>
            <select
              id={formId+"-tipoContato"} name="tipoContato" value={values.tipoContato}
              onChange={lidarMudancaSelect('tipoContato')}
              onBlur={() => marcaTocado('tipoContato')}
              className={inputClass}
              aria-invalid={campoTocado('tipoContato') && !!erroCampo('tipoContato')}
              aria-describedby={erros.tipoContato ? formId+'-erro-tipoContato' : undefined}
              disabled={isSaving}
            >
              <option value="celular">Celular</option>
              <option value="email">E-mail</option>
              <option value="outro">Outro</option>
            </select>
            {campoTocado('tipoContato') && erroCampo('tipoContato') ? (
              <p id={formId+'-erro-tipoContato'} className="text-xs text-attention-700" role="alert">
                {erroCampo('tipoContato')}
              </p>
            ) : null}
          </div>
        </div>

        {tipoEhCelularOuOutro && (
          <div className="space-y-1.5">
            <label
              htmlFor={`${formId}-telefone`}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              Celular com DDD
              <span className="text-attention-700" aria-hidden="true">*</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              id={formId+"-telefone"} name="telefone" value={values.telefone}
              onChange={lidarMudancaTexto('telefone')}
              onBlur={() => marcaTocado('telefone')}
              placeholder="(11) 99999-9999"
              className={inputClass}
              aria-invalid={campoTocado('telefone') && !!erroCampo('telefone')}
              aria-describedby={campoTocado('telefone') && erros.telefone ? formId+'-erro-telefone' : undefined}
              disabled={isSaving}
            />
            {campoTocado('telefone') && erroCampo('telefone') ? (
              <p id={formId+"-erro-telefone"} className="text-xs text-attention-700" role="alert">
                {erroCampo('telefone')}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              Exemplo: (11) 99999-9999. Apenas dígitos são armazenados.
            </p>
          </div>
        )}

        {tipoEhEmail && (
          <div className="space-y-1.5">
            <label
              htmlFor={`${formId}-email`}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              E-mail
              <span className="text-attention-700" aria-hidden="true">*</span>
            </label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              id={formId+"-email"} name="email" value={values.email}
              onChange={lidarMudancaTexto('email')}
              onBlur={() => marcaTocado('email')}
              placeholder="joao@email.com"
              className={inputClass}
              aria-invalid={campoTocado('email') && !!erroCampo('email')}
              aria-describedby={campoTocado('email') && erros.email ? formId+'-erro-email' : undefined}
              disabled={isSaving}
            />
            {campoTocado('email') && erroCampo('email') ? (
              <p id={formId+"-erro-email"} className="text-xs text-attention-700" role="alert">
                {erroCampo('email')}
              </p>
            ) : null}
          </div>
        )}

        <fieldset className="border border-slate-200/60 rounded-xl p-3">
          <legend className="text-xs font-bold text-slate-700 px-1">
            Preferências de recebimento
          </legend>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={values.canalInterno}
                disabled={isSaving}
                onChange={lidarMudancaCheckbox('canalInterno')}
                className="rounded bg-slate-100 border-slate-300 text-brand-700 focus:ring-brand-500"
                aria-label="Receber avisos internos no aplicativo"
              />
              <span className="text-xs text-slate-600">
                Notificações internas no app
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={values.canalEmail}
                onChange={lidarMudancaCheckbox('canalEmail')}
                className="rounded bg-slate-100 border-slate-300 text-brand-700 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Receber avisos por e-mail"
                disabled={isSaving || !canaisExternosDisponiveis}
              />
              <span className="text-xs text-slate-600">
                E-mail
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={values.canalSms}
                onChange={lidarMudancaCheckbox('canalSms')}
                className="rounded bg-slate-100 border-slate-300 text-brand-700 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Receber avisos por SMS"
                disabled={isSaving || !canaisExternosDisponiveis}
              />
              <span className="text-xs text-slate-600">
                SMS (integração futura)
              </span>
            </label>
          </div>
          {!canaisExternosDisponiveis ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              O envio por e-mail e SMS ainda não está disponível. As preferências ficam registradas na sua conta; esta versão não envia avisos.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="border border-slate-200/60 rounded-xl p-3">
          <legend className="text-xs font-bold text-slate-700 px-1">
            Consentimento
            <span className="text-attention-700" aria-hidden="true">*</span>
          </legend>
          <div className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              id={formId+"-consentimento"}
              checked={values.consentimento}
              disabled={isSaving}
              aria-invalid={campoTocado('consentimento') && Boolean(erros.consentimento)}
              aria-describedby={erros.consentimento ? formId+'-erro-consentimento' : undefined}
              onChange={lidarMudancaCheckbox('consentimento')}
              className="mt-0.5 rounded bg-slate-100 border-slate-300 text-brand-700 focus:ring-brand-500"
              required
              aria-label="Concordo com o recebimento de avisos preventivos"
            />
            <label htmlFor={formId+"-consentimento"} className="text-sm leading-relaxed text-slate-600">
              {TEXTO_CONSENTIMENTO}
              <br />
              <span className="text-xs text-slate-500">
                Versão do texto: {values.versaoConsentimento}.{' '}
                {jaVerificado ? (
                  <>
                    Contato já verificado.{' '}
                    <span className="font-semibold text-brand-700">
                      O consentimento pode ser revogado a qualquer momento.
                    </span>
                  </>
                ) : (
                  <>
                    Este contato ainda não foi verificado por um provedor
                    autorizado. Nenhuma confirmação de celular ou e-mail será
                    simulada.
                  </>
                )}
              </span>
            </label>
          </div>
          {campoTocado('consentimento') && erroCampo('consentimento') ? (
            <p id={formId+"-erro-consentimento"} className="mt-1 text-sm text-attention-800" role="alert">
              {erroCampo('consentimento')}
            </p>
          ) : null}
        </fieldset>

        {saveError ? (
          <div className="rounded-xl border border-attention-200 bg-attention-50 p-3" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 text-attention-700" aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-attention-900">
              {saveError}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancelar}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Salvando…
              </>
            ) : contato ? (
              'Atualizar contato'
            ) : (
              'Cadastrar contato'
            )}
          </Button>
        </div>
      </form>
    </Card>
  )
}

/**
 * Extrai apenas dígitos de um telefone formatado para exibição.
 */
function extrairDigitos(telefoneFormatado: string | null | undefined): string {
  if (!telefoneFormatado) return ''
  return telefoneFormatado.replace(/\D/g, '')
}
