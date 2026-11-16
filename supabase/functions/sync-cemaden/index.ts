// =====================================================================
// Edge Function: sync-cemaden
//
// Sincroniza as estações pluviométricas do CEMADEN com o Postgres/PostGIS.
// A função é server-to-server: exige o header `x-sync-secret`, usa a chave
// service_role apenas no servidor e nunca devolve segredos.
//
// Deploy:
//   npx supabase functions deploy sync-cemaden --no-verify-jwt --project-ref ...
//   npx supabase secrets set CEMADEN_SYNC_SECRET=UM_SEGREDO_LONGO
//
// Agendamento (externo ou pg_cron/pg_net) deve chamar via POST:
//   curl -X POST ".../functions/v1/sync-cemaden" \
//     -H "x-sync-secret: $CEMADEN_SYNC_SECRET"
//
// Fonte: https://resources.cemaden.gov.br/dados/311_24.json (JSONP).
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  CAJAMAR_CENTER,
  CEMADEN_PLUVIOMETRIC_ENDPOINT,
  CemadenParseError,
  DEFAULT_RADIUS_KM,
  parseCemadenJsonp,
  selectStationsNear,
  toEstacaoRow,
  toMedicaoRow,
  type MedicaoUpsertRow,
} from '../_shared/cemaden.ts'

const REQUEST_TIMEOUT_MS = 20_000
const RETRY_DELAY_MS = 1_200
const UPSERT_CHUNK_SIZE = 100

function env(name: string, fallback = ''): string {
  return (Deno.env.get(name) ?? fallback).trim()
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function clampRadius(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RADIUS_KM
  return Math.min(Math.max(value, 1), 100)
}

function describeError(error: unknown): string {
  if (error instanceof CemadenParseError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Erro desconhecido na sincronização.'
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function fetchCemaden(endpoint: string): Promise<string> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'User-Agent':
            'AlertaChuvaCajamar/0.3 (monitoramento municipal; contato do projeto)',
          Referer: 'https://mapainterativo.cemaden.gov.br/',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`CEMADEN respondeu HTTP ${response.status}.`)
      }

      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Não foi possível consultar o CEMADEN.')
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json(405, {
      ok: false,
      code: 'method_not_allowed',
      message: 'Use POST para sincronizar a fonte CEMADEN.',
    })
  }

  const expectedSecret = env('CEMADEN_SYNC_SECRET')
  if (!expectedSecret) {
    return json(503, {
      ok: false,
      code: 'sync_not_configured',
      message:
        'A sincronização não está configurada (secret CEMADEN_SYNC_SECRET ausente).',
    })
  }

  const providedSecret = request.headers.get('x-sync-secret') ?? ''
  if (!safeEqual(providedSecret, expectedSecret)) {
    return json(401, {
      ok: false,
      code: 'unauthorized',
      message: 'Credencial de sincronização inválida.',
    })
  }

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json(503, {
      ok: false,
      code: 'supabase_not_configured',
      message: 'A sincronização não está configurada no servidor.',
    })
  }

  const endpoint = env(
    'CEMADEN_ENDPOINT',
    CEMADEN_PLUVIOMETRIC_ENDPOINT,
  )
  const radiusKm = clampRadius(Number(env('CEMADEN_RADIUS_KM', '30')))
  const startedAt = Date.now()
  const collectedAt = new Date().toISOString()

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let logId: number | null = null
  try {
    const { data: logRow, error: logError } = await client
      .from('coletas_fonte')
      .insert({
        fonte: 'CEMADEN',
        endpoint,
        status: 'em_andamento',
        mensagem_publica: 'Sincronização em andamento.',
      })
      .select('id')
      .single()

    if (logError) {
      console.error('[sync-cemaden] não foi possível abrir o log:', logError.message)
    } else if (logRow && typeof logRow.id === 'number') {
      logId = logRow.id
    }

    const raw = await fetchCemaden(endpoint)
    const payload = parseCemadenJsonp(raw)
    const selected = selectStationsNear(payload.stations, radiusKm)

    if (selected.length === 0) {
      throw new CemadenParseError(
        'A fonte respondeu, mas nenhuma estação de Cajamar/entorno foi encontrada.',
      )
    }

    const stationRows = selected.map((station) =>
      toEstacaoRow(station, payload.updatedAt),
    )

    // A coleta NÃO deve reativar estações administrativamente desativadas.
    // Preservar ativa=false mesmo se o payload externo voltar a listá-las.
    const { data: existingStatus, error: statusError } = await client
      .from('estacoes')
      .select('codigo_estacao,ativa')
      .in('codigo_estacao', stationRows.map((item) => item.codigo_estacao))
    if (statusError) {
      throw new Error('Falha ao preservar o status ativo das estações.')
    }
    const inactiveCodes = new Set(
      (existingStatus ?? [])
        .filter((item) => item.ativa === false)
        .map((item) => item.codigo_estacao),
    )
    for (const station of stationRows) {
      if (inactiveCodes.has(station.codigo_estacao)) station.ativa = false
    }

    let stationsUpserted = 0
    for (const batch of chunk(stationRows, UPSERT_CHUNK_SIZE)) {
      const { error } = await client
        .from('estacoes')
        .upsert(batch, { onConflict: 'codigo_estacao' })
      if (error) {
        throw new Error(`Falha ao gravar estações: ${error.message}`)
      }
      stationsUpserted += batch.length
    }

    const codes = selected.map((station) => station.codestacao)
    const { data: savedStations, error: readError } = await client
      .from('estacoes')
      .select('id_estacao,codigo_estacao')
      .in('codigo_estacao', codes)

    if (readError) {
      throw new Error(`Falha ao reler estações gravadas: ${readError.message}`)
    }

    const idByCode = new Map<string, number>()
    for (const row of savedStations ?? []) {
      if (
        typeof row.codigo_estacao === 'string' &&
        typeof row.id_estacao === 'number'
      ) {
        idByCode.set(row.codigo_estacao, row.id_estacao)
      }
    }

    const measurementRows: MedicaoUpsertRow[] = []
    let withoutReading = 0

    for (const station of selected) {
      const idEstacao = idByCode.get(station.codestacao)
      if (idEstacao === undefined) {
        throw new Error(
          `Estação ${station.codestacao} não pôde ser identificada após o upsert.`,
        )
      }

      const measurement = toMedicaoRow(
        station,
        idEstacao,
        payload.updatedAt,
        collectedAt,
      )

      if (measurement) {
        measurementRows.push(measurement)
      } else {
        withoutReading += 1
      }
    }

    // `ignoreDuplicates: true` + `.select()` retorna apenas as linhas realmente
    // inseridas. Sem o select, o log contaria também as já existentes e
    // inflaria `medicoes_gravadas` em reexecuções do mesmo horário.
    let measurementsSaved = 0
    for (const batch of chunk(measurementRows, UPSERT_CHUNK_SIZE)) {
      const { data: inserted, error } = await client
        .from('medicoes_chuva')
        .upsert(batch, {
          onConflict: 'id_estacao,data_hora',
          ignoreDuplicates: true,
        })
        .select('id_medicao')
      if (error) {
        throw new Error(`Falha ao gravar medições: ${error.message}`)
      }
      measurementsSaved += inserted?.length ?? 0
    }

    const durationMs = Date.now() - startedAt
    const status = withoutReading > 0 ? 'parcial' : 'sucesso'
    const publicMessage =
      withoutReading > 0
        ? `Sincronização concluída. ${withoutReading} estação(ões) sem leitura válida nesta coleta; ausência de medição não significa ausência de chuva.`
        : 'Sincronização concluída com leituras oficiais do CEMADEN.'

    if (logId !== null) {
      const { error: updateError } = await client
        .from('coletas_fonte')
        .update({
          concluido_em: new Date().toISOString(),
          status,
          estacoes_recebidas: payload.stations.length,
          estacoes_no_raio: selected.length,
          medicoes_gravadas: measurementsSaved,
          medicoes_sem_leitura: withoutReading,
          payload_atualizado_em: payload.updatedAt,
          duracao_ms: durationMs,
          mensagem_publica: publicMessage,
          erro_interno: null,
          metadados: {
            endpoint,
            raio_km: radiusKm,
            centro: CAJAMAR_CENTER,
            parser: 'cemaden-311_24-v1',
          },
        })
        .eq('id', logId)

      if (updateError) {
        console.error(
          '[sync-cemaden] não foi possível fechar o log:',
          updateError.message,
        )
      }
    }

    return json(200, {
      ok: true,
      source: 'CEMADEN',
      status,
      updatedAt: payload.updatedAt,
      collectedAt,
      stationsReceived: payload.stations.length,
      stationsNear: selected.length,
      stationsUpserted,
      measurementsSaved,
      measurementsWithoutReading: withoutReading,
      radiusKm,
      durationMs,
      message: publicMessage,
    })
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const internalMessage = describeError(error).slice(0, 1000)
    console.error('[sync-cemaden] falha:', internalMessage)

    if (logId !== null) {
      const { error: updateError } = await client
        .from('coletas_fonte')
        .update({
          concluido_em: new Date().toISOString(),
          status: 'erro',
          duracao_ms: durationMs,
          mensagem_publica:
            'A sincronização com o CEMADEN falhou. Os últimos dados válidos permanecem disponíveis, se existirem.',
          erro_interno: internalMessage,
        })
        .eq('id', logId)

      if (updateError) {
        console.error(
          '[sync-cemaden] não foi possível registrar a falha:',
          updateError.message,
        )
      }
    }

    return json(502, {
      ok: false,
      code: 'sync_failed',
      message:
        'A sincronização com o CEMADEN falhou. Os últimos dados válidos permanecem disponíveis, se existirem.',
      durationMs,
    })
  }
})
