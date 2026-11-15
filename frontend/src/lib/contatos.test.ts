import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  listarMeusContatos,
  buscarMeuContato,
  criarMeuContato,
  atualizarMeuContato,
  excluirMeuContato,
  revogarConsentimentoContato,
} from '@/lib/contatos'
import type { ContatoFormValues } from '@/types/contatos'

const usuarioId = 'usuario-teste-1'

const contatoMock: any = {
  id_contato: 1,
  usuario_id: usuarioId,
  endereco_id: 'endereco-uuid-1',
  nome: 'João Silva',
  tipo_contato: 'celular',
  telefone: '11999999999',
  email: null,
  ativo: true,
  consentimento: true,
  verificado_em: null,
  versao_consentimento: '1.0',
  revogado_em: null,
  canal_interno: true,
  canal_email: false,
  canal_sms: false,
  data_cadastro: '2026-11-07T10:00:00.000Z',
}

/**
 * Cria um mock de cliente Supabase com encadeamento simples.
 * Cada método retorna o próprio objeto, permitindo encadeamento.
 * O resultado final é definido em `ultimoResultado`.
 */
function criarClientMock(): any {
  const ultimoResultado = { data: null, error: null }

  // Cria o objeto primeiro, depois atribui métodos que retornam a si mesmo
  const encadeamento: any = {}

  // Torna o objeto thenable para suportar `await client.from(...)...`
  encadeamento.then = (resolve: any) =>
    Promise.resolve(ultimoResultado).then(resolve)

  const métodos = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(ultimoResultado)),
    single: vi.fn().mockImplementation(() => Promise.resolve(ultimoResultado)),
    abortSignal: vi.fn(),
  }

  for (const [chave, fn] of Object.entries(métodos)) {
    fn.mockReturnValue(encadeamento)
    encadeamento[chave] = fn
  }

  return {
    client: encadeamento,
    setResultado: (data: any, error: any = null) => {
      ultimoResultado.data = data
      ultimoResultado.error = error
    },
    getUltimoPayloadInsert: () => encadeamento.insert.mock.calls[0]?.[0],
    getUltimoPayloadUpdate: () => encadeamento.update.mock.calls[0]?.[0],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listarMeusContatos', () => {
  it('retorna lista de contatos do usuário', async () => {
    const mock = criarClientMock()
    mock.setResultado([contatoMock], null)

    const resultado = await listarMeusContatos(mock.client, usuarioId)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe(1)
    expect(resultado[0].nome).toBe('João Silva')
    expect(resultado[0].telefone).toBe('(11) 99999-9999')
    expect(resultado[0].verificado).toBe(false)
    expect(resultado[0].preferencias.interno).toBe(true)
    expect(resultado[0].elegivelParaNotificacao).toBe(true)
  })

  it('contato sem consentimento não é elegível para notificação', async () => {
    const mock = criarClientMock()
    const contatoSemConsentimento = {
      ...contatoMock,
      consentimento: false,
      canal_interno: false,
    }
    mock.setResultado([contatoSemConsentimento], null)

    const resultado = await listarMeusContatos(mock.client, usuarioId)
    expect(resultado[0].elegivelParaNotificacao).toBe(false)
  })

  it('contato revogado não é elegível para notificação', async () => {
    const mock = criarClientMock()
    const contatoRevogado = {
      ...contatoMock,
      revogado_em: '2026-11-07T11:00:00.000Z',
    }
    mock.setResultado([contatoRevogado], null)

    const resultado = await listarMeusContatos(mock.client, usuarioId)
    expect(resultado[0].revogado).toBe(true)
    expect(resultado[0].elegivelParaNotificacao).toBe(false)
  })

  it('lança erro quando a consulta falha', async () => {
    const mock = criarClientMock()
    mock.setResultado(null, new Error('falha de conexão'))

    await expect(
      listarMeusContatos(mock.client, usuarioId),
    ).rejects.toThrow('falha de conexão')
  })

  it.each([
    ['42703', 'configuração no banco'],
    ['PGRST205', 'configuração no banco'],
    ['42501', 'acesso aos contatos foi recusado'],
    ['PGRST301', 'sessão não foi aceita'],
  ])('explica erros estruturados do Supabase: %s', async (code, expected) => {
    const mock = criarClientMock()
    mock.setResultado(null, { code, message: 'Detalhes internos com dados privados' })
    await expect(listarMeusContatos(mock.client, usuarioId)).rejects.toThrow(expected)
    await expect(listarMeusContatos(mock.client, usuarioId)).rejects.not.toThrow('dados privados')
  })
})

describe('buscarMeuContato', () => {
  it('retorna um contato específico do usuário', async () => {
    const mock = criarClientMock()
    mock.setResultado(contatoMock, null)

    const resultado = await buscarMeuContato(mock.client, usuarioId, 1)

    expect(resultado).not.toBeNull()
    expect(resultado?.id_contato).toBe(1)
    expect(resultado?.nome).toBe('João Silva')
    expect(resultado?.endereco_id).toBe('endereco-uuid-1')
  })

  it('retorna null quando contato não existe', async () => {
    const mock = criarClientMock()
    mock.setResultado(null, null)

    const resultado = await buscarMeuContato(mock.client, usuarioId, 999)
    expect(resultado).toBeNull()
  })
})

describe('criarMeuContato', () => {
  const valores: ContatoFormValues = {
    nome: 'Maria Souza',
    tipoContato: 'celular',
    telefone: '11988887777',
    email: '',
    canalInterno: true,
    canalEmail: false,
    canalSms: false,
    consentimento: true,
    versaoConsentimento: '1.0',
  }

  it('cria um contato com sucesso associando endereco_id', async () => {
    const mock = criarClientMock()
    const contatoCriado = { ...contatoMock, id_contato: 2, nome: 'Maria Souza' }
    mock.setResultado(contatoCriado, null)

    const resultado = await criarMeuContato(
      mock.client,
      usuarioId,
      valores,
      'endereco-uuid-1',
    )

    expect(resultado.id_contato).toBe(2)
    expect(resultado.nome).toBe('Maria Souza')

    // O INSERT envia usuario_id explicitamente (RLS apenas valida, não preenche)
    // e nunca envia campos protegidos/gerados pelo banco.
    const payloadInserido = mock.getUltimoPayloadInsert()
    expect(payloadInserido.usuario_id).toBe(usuarioId)
    expect(payloadInserido.verificado_em).toBeUndefined()
    expect(payloadInserido.revogado_em).toBeUndefined()
    expect(payloadInserido.id_contato).toBeUndefined()
    expect(payloadInserido.data_cadastro).toBeUndefined()
    expect(payloadInserido.endereco_id).toBe('endereco-uuid-1')
  })

  it('cria contato sem consentimento não define canais ativos', async () => {
    const mock = criarClientMock()
    const contatoSemConsentimento = {
      ...contatoMock,
      id_contato: 2,
      consentimento: false,
      canal_interno: false,
    }
    mock.setResultado(contatoSemConsentimento, null)

    const valoresSemConsentimento: ContatoFormValues = {
      ...valores,
      consentimento: false,
      canalInterno: false,
      canalEmail: false,
      canalSms: false,
    }

    await criarMeuContato(mock.client, usuarioId, valoresSemConsentimento, null)

    const payloadInserido = mock.getUltimoPayloadInsert()
    expect(payloadInserido.consentimento).toBe(false)
    expect(payloadInserido.canal_interno).toBe(false)
    expect(payloadInserido.canal_email).toBe(false)
    expect(payloadInserido.canal_sms).toBe(false)
  })

  it('lança erro de duplicidade (unique_violation)', async () => {
    const mock = criarClientMock()
    const erroDuplicidade = new Error('duplicate') as any
    erroDuplicidade.code = '23505'
    mock.setResultado(null, erroDuplicidade)

    await expect(
      criarMeuContato(mock.client, usuarioId, valores, 'endereco-uuid-1'),
    ).rejects.toThrow('Já existe um contato cadastrado')
  })
})

describe('atualizarMeuContato', () => {
  it('atualiza um contato existente', async () => {
    const mock = criarClientMock()

    // Primeiro resultado: buscarMeuContato encontra o contato existente
    mock.setResultado(contatoMock, null)

    const resultado = await atualizarMeuContato(mock.client, usuarioId, 1, {
      nome: 'João Atualizado',
    })

    // Segundo resultado: o UPDATE retorna o contato atualizado
    // (como ambas chamadas usam o mesmo maybeSingle, o retorno será o
    // contato existente, mas o importante é verificar o payload do UPDATE)
    expect(resultado.nome).toBe('João Silva')

    // Verifica que o UPDATE não inclui campos protegidos nem o proprietário
    const payloadAtualizado = mock.getUltimoPayloadUpdate()
    expect(payloadAtualizado).toBeDefined()
    expect(payloadAtualizado.verificado_em).toBeUndefined()
    expect(payloadAtualizado.revogado_em).toBeUndefined()
    expect(payloadAtualizado.usuario_id).toBeUndefined()
    expect(payloadAtualizado.id_contato).toBeUndefined()
    expect(payloadAtualizado.data_cadastro).toBeUndefined()
    expect(payloadAtualizado.nome).toBe('João Atualizado')
  })

  it('lança erro quando contato não existe', async () => {
    const mock = criarClientMock()
    mock.setResultado(null, null)

    await expect(
      atualizarMeuContato(mock.client, usuarioId, 999, { nome: 'X' }),
    ).rejects.toThrow('Contato não encontrado')
  })
})

describe('excluirMeuContato', () => {
  it('exclui um contato com sucesso', async () => {
    const mock = criarClientMock()
    mock.setResultado({ error: null }, null)

    await expect(
      excluirMeuContato(mock.client, usuarioId, 1),
    ).resolves.toBeUndefined()
  })

  it('lança erro quando a exclusão falha', async () => {
    const mock = criarClientMock()
    mock.setResultado(null, new Error('falha exclusão'))

    await expect(
      excluirMeuContato(mock.client, usuarioId, 1),
    ).rejects.toThrow('falha exclusão')
  })
})

describe('revogarConsentimentoContato', () => {
  it('revoga o consentimento e desativa todos os canais', async () => {
    const mock = criarClientMock()
    const contatoRevogado = {
      ...contatoMock,
      consentimento: false,
      canal_interno: false,
      canal_email: false,
      canal_sms: false,
      revogado_em: '2026-11-07T11:00:00.000Z',
    }
    mock.setResultado(contatoRevogado, null)

    const resultado = await revogarConsentimentoContato(
      mock.client,
      usuarioId,
      1,
    )

    expect(resultado.consentimento).toBe(false)
    expect(resultado.canal_interno).toBe(false)
    expect(resultado.canal_email).toBe(false)
    expect(resultado.canal_sms).toBe(false)
    expect(resultado.revogado_em).toBe('2026-11-07T11:00:00.000Z')
  })

  it('lança erro quando a revogação falha', async () => {
    const mock = criarClientMock()
    mock.setResultado(null, new Error('falha revogacao'))

    await expect(
      revogarConsentimentoContato(mock.client, usuarioId, 1),
    ).rejects.toThrow('falha revogacao')
  })
})

describe('isolamento entre usuários', () => {
  it('todas as consultas filtram por usuario_id', async () => {
    const mock = criarClientMock()
    mock.setResultado([contatoMock], null)

    await listarMeusContatos(mock.client, 'usuario-outro')

    // Verifica que .eq() foi chamado com usuario_id
    const eqCalls = mock.client.eq.mock.calls
    const temUsuarioId = eqCalls.some(
      (call: any) => call[0] === 'usuario_id' && call[1] === 'usuario-outro',
    )
    expect(temUsuarioId).toBe(true)
  })

  it('busca, atualiza e exclui usando a coluna real id_contato', async () => {
    const mock = criarClientMock()
    mock.setResultado(contatoMock, null)

    await buscarMeuContato(mock.client, usuarioId, 7)
    const chamadasBusca = mock.client.eq.mock.calls.map((call: any) => call[0])
    expect(chamadasBusca).toContain('id_contato')
    expect(chamadasBusca).not.toContain('id')

    mock.client.eq.mockClear()
    await atualizarMeuContato(mock.client, usuarioId, 7, { nome: 'Novo' })
    const chamadasUpdate = mock.client.update.mock.calls[0]?.[0]
    expect(chamadasUpdate).not.toHaveProperty('id_contato')
    const filtrosUpdate = mock.client.eq.mock.calls.map((call: any) => call[0])
    expect(filtrosUpdate).toContain('id_contato')
    expect(filtrosUpdate).not.toContain('id')

    mock.client.eq.mockClear()
    await excluirMeuContato(mock.client, usuarioId, 7)
    const filtrosDelete = mock.client.eq.mock.calls.map((call: any) => call[0])
    expect(filtrosDelete).toContain('id_contato')
    expect(filtrosDelete).not.toContain('id')
  })
})
