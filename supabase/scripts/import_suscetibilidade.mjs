#!/usr/bin/env node
/**
 * Importador reproduzível da Carta de Suscetibilidade de Cajamar (SGB/CPRM + IPT, 2017).
 *
 * Lê os shapefiles oficiais de inundação e enxurrada, valida o CRS de origem,
 * mantém as geometrias sem simplificação e gera um SQL idempotente para o
 * PostGIS. A transformação de SIRGAS 2000 / UTM 23S (EPSG:31983) para
 * WGS 84 (EPSG:4326) é feita pelo próprio PostGIS, com ST_Transform.
 *
 * Uso:
 *   node supabase/scripts/import_suscetibilidade.mjs \
 *     --source "C:\caminho\12.Suscetibilidade" \
 *     --zip "C:\caminho\sig_cajamar_sp_suscet.zip" \
 *     --out "supabase/scripts/out/etapa5_suscetibilidade.sql"
 *
 * O arquivo de saída contém metadados de proveniência, exclusão idempotente
 * das feições anteriores da mesma cartografia e a inserção validada das
 * geometrias. Nenhum dado é inventado: feições inválidas interrompem a geração.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = join(SCRIPT_DIR, 'out', 'etapa5_suscetibilidade.sql')

const SOURCE = {
  titulo:
    'Carta de suscetibilidade a movimentos gravitacionais de massa e inundações: município de Cajamar, SP',
  fonte: 'SGB/CPRM e IPT',
  editor: 'CPRM - Serviço Geológico do Brasil; IPT',
  municipio: 'Cajamar',
  uf: 'SP',
  escala: '1:25.000',
  anoPublicacao: 2017,
  mesPublicacao: 6,
  urlItem: 'https://rigeo.sgb.gov.br/items/ffa6864e-5fbd-4e3e-a1bd-28d22fe50cf4',
  urlDownload:
    'https://rigeo.sgb.gov.br/bitstreams/bce42cee-8dae-49bb-b2ce-fd65576ef5f6/download',
  licenca: 'Acesso aberto (open), conforme metadados do Rigeo/SGB',
  sridOrigem: 31983,
  sridDestino: 4326,
  citacao:
    'INSTITUTO DE PESQUISAS TECNOLÓGICAS; CPRM - SERVIÇO GEOLÓGICO DO BRASIL. Carta de suscetibilidade a movimentos gravitacionais de massa e inundações: município de Cajamar, SP. [S.l.]: CPRM; IPT, 2017. 1 mapa, color. Escala 1:25.000.',
}

const LAYERS = [
  {
    tipo: 'inundacao',
    arquivo: 'SuscetibilidadeInundacao',
    titulo: 'Suscetibilidade a inundação',
    processoPadrao: 'Inundação, alagamento e assoreamento',
  },
  {
    tipo: 'enxurrada',
    arquivo: 'SuscetibilidadeEnxurradas',
    titulo: 'Suscetibilidade a enxurrada',
    processoPadrao: 'Enxurrada',
  },
]

const CLASS_ORDER = { Alta: 3, Media: 2, Baixa: 1 }

function usage(message) {
  if (message) console.error(`\nERRO: ${message}\n`)
  console.error(
    [
      'Uso:',
      '  node supabase/scripts/import_suscetibilidade.mjs --source <pasta 12.Suscetibilidade> [opções]',
      '',
      'Opções:',
      '  --source <dir>   Pasta extraída com os shapefiles (obrigatório).',
      '  --zip <arquivo>  ZIP oficial, usado para registrar o SHA-256.',
      '  --out <arquivo>  SQL de saída (padrão: supabase/scripts/out/etapa5_suscetibilidade.sql).',
      '  --slug <texto>   Identificador estável da cartografia.',
      '  --unpublished    Gera a importação com publicada = false.',
      '  --help           Mostra esta ajuda.',
    ].join('\n'),
  )
  process.exit(message ? 1 : 0)
}

function parseArgs(argv) {
  const args = {
    source: null,
    zip: null,
    out: DEFAULT_OUT,
    slug: 'sgb-ipt-cajamar-2017-suscetibilidade',
    unpublished: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') usage()
    else if (arg === '--unpublished') args.unpublished = true
    else if (arg === '--source') args.source = argv[++i]
    else if (arg === '--zip') args.zip = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else if (arg === '--slug') args.slug = argv[++i]
    else usage(`Argumento desconhecido: ${arg}`)
  }

  if (!args.source) usage('Informe --source com a pasta 12.Suscetibilidade.')
  if (!existsSync(args.source)) usage(`Pasta não encontrada: ${args.source}`)
  if (args.zip && !existsSync(args.zip)) usage(`ZIP não encontrado: ${args.zip}`)
  if (!args.slug || !/^[a-z0-9][a-z0-9-]*$/.test(args.slug)) {
    usage('--slug deve conter apenas letras minúsculas, números e hífens.')
  }

  return args
}

function fail(message) {
  throw new Error(message)
}

function readText(file) {
  return readFileSync(file).toString('utf8').replace(/^\uFEFF/, '')
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function sha256Composite(files) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(basename(file))
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function detectDbfEncoding(cpgFile) {
  if (!existsSync(cpgFile)) return 'utf8'
  const value = readText(cpgFile).trim().toLowerCase()
  if (value.includes('utf-8') || value.includes('utf8')) return 'utf8'
  if (value.includes('1252') || value.includes('ansi')) return 'win1252'
  return 'utf8'
}

function decodeDbfText(buffer, encoding) {
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return buffer.toString('latin1')
  }
}

function parseDbf(file) {
  const buffer = readFileSync(file)
  if (buffer.length < 32) fail(`DBF muito curto: ${file}`)

  const numRecords = buffer.readUInt32LE(4)
  const headerLength = buffer.readUInt16LE(8)
  const recordLength = buffer.readUInt16LE(10)
  const encoding = detectDbfEncoding(file.replace(/\.dbf$/i, '.cpg'))
  const fields = []

  let offset = 32
  while (offset < headerLength) {
    if (buffer[offset] === 0x0d) break
    const name = buffer
      .toString('latin1', offset, offset + 11)
      .replace(/\0.*$/, '')
      .trim()
    const type = String.fromCharCode(buffer[offset + 11])
    const length = buffer[offset + 16]
    const decimals = buffer[offset + 17]
    if (!name) fail(`Campo DBF inválido em ${file}.`)
    fields.push({ name, type, length, decimals })
    offset += 32
  }

  const computedRecordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0)
  if (computedRecordLength !== recordLength) {
    fail(
      `DBF ${basename(file)}: recordLength=${recordLength}, esperado=${computedRecordLength}.`,
    )
  }

  const records = []
  for (let index = 0; index < numRecords; index++) {
    const start = headerLength + index * recordLength
    if (start + recordLength > buffer.length) {
      fail(`DBF ${basename(file)}: registro ${index + 1} fora do arquivo.`)
    }
    const deleted = buffer[start] === 0x2a
    let position = start + 1
    const row = {}
    for (const field of fields) {
      const raw = buffer.subarray(position, position + field.length)
      row[field.name] = decodeDbfText(raw, encoding).trim()
      position += field.length
    }
    if (!deleted) records.push(row)
  }

  if (records.length !== numRecords) {
    fail(
      `DBF ${basename(file)}: ${numRecords} registros declarados, ${records.length} válidos.`,
    )
  }

  return { encoding, fields, records }
}

function readShapefile(file) {
  const buffer = readFileSync(file)
  const fileCode = buffer.readInt32BE(0)
  const version = buffer.readInt32LE(28)
  const shapeType = buffer.readInt32LE(32)
  if (fileCode !== 9994) fail(`${basename(file)}: file code ${fileCode} inválido.`)
  if (version !== 1000) fail(`${basename(file)}: versão ${version} inválida.`)
  if (shapeType !== 5) {
    fail(`${basename(file)}: tipo ${shapeType} não é Polygon (5).`)
  }

  const records = []
  let offset = 100
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) fail(`${basename(file)}: cabeçalho truncado.`)
    const recordNumber = buffer.readInt32BE(offset)
    const contentLengthWords = buffer.readInt32BE(offset + 4)
    const contentStart = offset + 8
    const contentEnd = contentStart + contentLengthWords * 2
    if (contentEnd > buffer.length) fail(`${basename(file)}: registro truncado.`)
    const type = buffer.readInt32LE(contentStart)
    if (type !== 5) {
      fail(`${basename(file)}: registro ${recordNumber} não é Polygon (${type}).`)
    }

    let position = contentStart + 4 + 32
    const numParts = buffer.readInt32LE(position)
    position += 4
    const numPoints = buffer.readInt32LE(position)
    position += 4
    if (numParts < 1 || numPoints < 3) {
      fail(`${basename(file)}: geometria vazia no registro ${recordNumber}.`)
    }

    const parts = []
    for (let index = 0; index < numParts; index++) {
      const partStart = buffer.readInt32LE(position)
      position += 4
      if (partStart < 0 || partStart >= numPoints) {
        fail(`${basename(file)}: part index inválido no registro ${recordNumber}.`)
      }
      parts.push(partStart)
    }

    const points = []
    for (let index = 0; index < numPoints; index++) {
      const x = buffer.readDoubleLE(position)
      const y = buffer.readDoubleLE(position + 8)
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        fail(`${basename(file)}: coordenada não finita no registro ${recordNumber}.`)
      }
      points.push([x, y])
      position += 16
    }

    records.push({ recordNumber, parts, points })
    offset = contentEnd
  }

  return { shapeType, records }
}

function signedArea(ring) {
  let sum = 0
  for (let index = 0; index < ring.length - 1; index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[index + 1]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function pointInRing(point, ring) {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function buildMultiPolygon(record, fileLabel) {
  const rings = []
  for (let part = 0; part < record.parts.length; part++) {
    const start = record.parts[part]
    const end =
      part + 1 < record.parts.length ? record.parts[part + 1] : record.points.length
    const ring = record.points.slice(start, end)
    if (ring.length < 4) {
      fail(`${fileLabel}: anel com menos de 4 pontos no registro ${record.recordNumber}.`)
    }
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      fail(`${fileLabel}: anel aberto no registro ${record.recordNumber}.`)
    }
    const area = signedArea(ring)
    if (area === 0) {
      fail(`${fileLabel}: anel com área zero no registro ${record.recordNumber}.`)
    }
    rings.push({ ring, area })
  }

  const polygons = []
  for (const item of rings) {
    if (item.area < 0) {
      polygons.push({ outer: item.ring, holes: [] })
      continue
    }

    // Anel interno (buraco): associa ao menor anel externo que o contém.
    const containing = polygons
      .filter((polygon) => pointInRing(item.ring[0], polygon.outer))
      .sort((left, right) => Math.abs(signedArea(left.outer)) - Math.abs(signedArea(right.outer)))

    if (containing.length === 0) {
      fail(
        `${fileLabel}: buraco sem anel externo no registro ${record.recordNumber}.`,
      )
    }
    containing[0].holes.push(item.ring)
  }

  if (polygons.length === 0) {
    fail(`${fileLabel}: nenhum anel externo no registro ${record.recordNumber}.`)
  }

  return polygons
}

function formatNumber(value) {
  if (!Number.isFinite(value)) fail(`Coordenada não finita: ${value}`)
  let text = value.toFixed(6)
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '')
  return text === '-0' ? '0' : text
}

function ringWkt(ring) {
  return `(${ring.map(([x, y]) => `${formatNumber(x)} ${formatNumber(y)}`).join(',')})`
}

function polygonWkt(polygon) {
  return `(${[polygon.outer, ...polygon.holes].map(ringWkt).join(',')})`
}

function multiPolygonWkt(polygons) {
  return `MULTIPOLYGON(${polygons.map(polygonWkt).join(',')})`
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`
}

function validateProjection(prjFile) {
  if (!existsSync(prjFile)) fail(`Arquivo .prj ausente: ${prjFile}`)
  const text = readText(prjFile)
  if (!/SIRGAS_2000_UTM_Zone_23S/i.test(text)) {
    fail(`${basename(prjFile)} não declara SIRGAS_2000_UTM_Zone_23S.`)
  }
  if (!/"Central_Meridian",\s*-45\.0/.test(text)) {
    fail(`${basename(prjFile)} não declara meridiano central -45.`)
  }
  if (!/"False_Northing",\s*10000000\.0/.test(text)) {
    fail(`${basename(prjFile)} não declara falso norte 10.000.000 (hemisfério sul).`)
  }
}

function loadLayer(sourceDir, layer) {
  const base = join(sourceDir, layer.arquivo)
  const files = {
    shp: `${base}.shp`,
    shx: `${base}.shx`,
    dbf: `${base}.dbf`,
    prj: `${base}.prj`,
    cpg: `${base}.cpg`,
  }

  for (const [extension, file] of Object.entries(files)) {
    if (extension === 'cpg') continue
    if (!existsSync(file)) fail(`Arquivo ausente: ${file}`)
  }

  validateProjection(files.prj)
  const dbf = parseDbf(files.dbf)
  const shp = readShapefile(files.shp)
  if (dbf.records.length !== shp.records.length) {
    fail(
      `${layer.arquivo}: DBF tem ${dbf.records.length} registros e SHP tem ${shp.records.length}.`,
    )
  }

  const features = []
  for (let index = 0; index < shp.records.length; index++) {
    const record = shp.records[index]
    const row = dbf.records[index]
    const polygons = buildMultiPolygon(record, layer.arquivo)
    const wkt = multiPolygonWkt(polygons)
    const pontoCount = record.points.length

    const classe = (row.Classe ?? '').trim()
    if (!classe) fail(`${layer.arquivo}: registro ${index + 1} sem Classe.`)

    let classeOrdem = null
    if (layer.tipo === 'inundacao') {
      classeOrdem = CLASS_ORDER[classe]
      if (!classeOrdem) {
        fail(`${layer.arquivo}: classe de inundação desconhecida "${classe}".`)
      }
    } else if (layer.tipo === 'enxurrada' && classe !== 'Enxurrada') {
      fail(`${layer.arquivo}: classe de enxurrada inesperada "${classe}".`)
    }

    const processo =
      (row.Processo ?? '').trim() ||
      (layer.tipo === 'enxurrada' ? layer.processoPadrao : '')
    if (!processo) {
      fail(`${layer.arquivo}: registro ${index + 1} sem Processo.`)
    }

    features.push({
      tipo: layer.tipo,
      classe,
      classeOrdem,
      processo,
      fonteId: row.ID ? String(row.ID).trim() : null,
      ordemOrigem: index + 1,
      metadados: row,
      wkt,
      pontoCount,
      polygons: polygons.length,
    })
  }

  return { files, encoding: dbf.encoding, features }
}

function classCounts(features) {
  const counts = {}
  for (const feature of features) {
    counts[feature.classe] = (counts[feature.classe] ?? 0) + 1
  }
  return counts
}

function buildMetadata(layers, sourceInfo) {
  const camadas = {}
  for (const layer of layers) {
    camadas[layer.tipo] = {
      arquivo: `${layer.arquivo}.shp`,
      titulo: layer.titulo,
      feicoes: layer.features.length,
      classes: classCounts(layer.features),
      processo: layer.processoPadrao,
    }
  }

  return {
    citacao: SOURCE.citacao,
    tipo_acesso: 'open',
    srid_origem_nome: 'SIRGAS 2000 / UTM zone 23S (EPSG:31983)',
    srid_destino_nome: 'WGS 84 (EPSG:4326)',
    camadas,
    camadas_nao_importadas: [
      {
        arquivo: 'SuscetibilidadeMovimentoDeMassa.shp',
        motivo:
          'Processo de movimentos gravitacionais de massa (deslizamento e rastejo); fora do escopo de inundação/enxurrada desta entrega.',
      },
      {
        arquivo: 'SuscetibilidadeBacias.shp',
        motivo:
          'Síntese por bacias, sem distinção direta entre inundação e enxurrada; não usada para a camada de inundação.',
      },
    ],
    observacoes:
      'Geometrias oficiais importadas sem simplificação. A classe de suscetibilidade descreve a predisposição do terreno na carta; não é previsão de alagamento nem alerta em tempo real.',
    arquivo_origem: sourceInfo.arquivoOrigem,
    hash_sha256: sourceInfo.hash,
    encoding_dbf: Object.fromEntries(
      layers.map((layer) => [layer.tipo, layer.encoding]),
    ),
  }
}

function generateSql(args, layers, sourceInfo) {
  const allFeatures = layers.flatMap((layer) =>
    layer.features.map((feature) => ({ ...feature, layer })),
  )
  const expected = {
    inundacao: layers.find((layer) => layer.tipo === 'inundacao').features.length,
    enxurrada: layers.find((layer) => layer.tipo === 'enxurrada').features.length,
  }
  const published = !args.unpublished
  const metadata = buildMetadata(layers, sourceInfo)

  const values = allFeatures
    .map((feature) => {
      const classeOrdem =
        feature.classeOrdem === null ? 'NULL::smallint' : `${feature.classeOrdem}::smallint`
      return [
        '    (',
        `${sqlString(feature.tipo)}, `,
        `${sqlString(feature.classe)}, `,
        `${classeOrdem}, `,
        `${sqlString(feature.processo)}, `,
        `${sqlString(feature.fonteId)}, `,
        `${feature.ordemOrigem}, `,
        `${sqlJson(feature.metadados)}, `,
        `ST_Transform(ST_SetSRID(ST_GeomFromText(${sqlString(feature.wkt)}), ${SOURCE.sridOrigem}), ${SOURCE.sridDestino})`,
        ')',
      ].join('')
    })
    .join(',\n')

  const sql = `-- =====================================================================
-- Etapa 5 — importação idempotente da suscetibilidade de Cajamar
--
-- Gerado por: supabase/scripts/import_suscetibilidade.mjs
-- Fonte: ${SOURCE.titulo}
-- Editor: ${SOURCE.editor}
-- Escala: ${SOURCE.escala} · Publicação: ${SOURCE.anoPublicacao}-${String(
    SOURCE.mesPublicacao,
  ).padStart(2, '0')}
-- Item: ${SOURCE.urlItem}
-- Download: ${SOURCE.urlDownload}
-- Licença: ${SOURCE.licenca}
-- CRS de origem: ${SOURCE.sridOrigem} (SIRGAS 2000 / UTM 23S)
-- CRS de destino: ${SOURCE.sridDestino} (WGS 84)
-- Arquivo de origem: ${sourceInfo.arquivoOrigem}
-- SHA-256: ${sourceInfo.hash}
-- Feições: ${expected.inundacao} inundação + ${expected.enxurrada} enxurrada
--
-- A transformação de coordenadas é feita pelo PostGIS. As geometrias são
-- inseridas sem simplificação; qualquer feição inválida interrompe a
-- transação. A classe de suscetibilidade NÃO é previsão de alagamento.
-- =====================================================================

BEGIN;

INSERT INTO public.cartografias_suscetibilidade (
    slug,
    titulo,
    fonte,
    editor,
    municipio,
    uf,
    escala,
    ano_publicacao,
    mes_publicacao,
    url_item,
    url_download,
    licenca,
    srid_origem,
    srid_destino,
    arquivo_origem,
    hash_arquivo_sha256,
    publicada,
    metadados
) VALUES (
    ${sqlString(args.slug)},
    ${sqlString(SOURCE.titulo)},
    ${sqlString(SOURCE.fonte)},
    ${sqlString(SOURCE.editor)},
    ${sqlString(SOURCE.municipio)},
    ${sqlString(SOURCE.uf)},
    ${sqlString(SOURCE.escala)},
    ${SOURCE.anoPublicacao},
    ${SOURCE.mesPublicacao},
    ${sqlString(SOURCE.urlItem)},
    ${sqlString(SOURCE.urlDownload)},
    ${sqlString(SOURCE.licenca)},
    ${SOURCE.sridOrigem},
    ${SOURCE.sridDestino},
    ${sqlString(sourceInfo.arquivoOrigem)},
    ${sqlString(sourceInfo.hash)},
    ${published ? 'TRUE' : 'FALSE'},
    ${sqlJson(metadata)}
)
ON CONFLICT (slug) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    fonte = EXCLUDED.fonte,
    editor = EXCLUDED.editor,
    municipio = EXCLUDED.municipio,
    uf = EXCLUDED.uf,
    escala = EXCLUDED.escala,
    ano_publicacao = EXCLUDED.ano_publicacao,
    mes_publicacao = EXCLUDED.mes_publicacao,
    url_item = EXCLUDED.url_item,
    url_download = EXCLUDED.url_download,
    licenca = EXCLUDED.licenca,
    srid_origem = EXCLUDED.srid_origem,
    srid_destino = EXCLUDED.srid_destino,
    arquivo_origem = EXCLUDED.arquivo_origem,
    hash_arquivo_sha256 = EXCLUDED.hash_arquivo_sha256,
    publicada = EXCLUDED.publicada,
    importado_em = now(),
    metadados = EXCLUDED.metadados;

-- Remove apenas as feições desta cartografia. Outras cartografias ficam intactas.
DELETE FROM public.areas_suscetibilidade AS a
USING public.cartografias_suscetibilidade AS c
WHERE a.cartografia_id = c.id
  AND c.slug = ${sqlString(args.slug)};

WITH cart AS (
    SELECT id
    FROM public.cartografias_suscetibilidade
    WHERE slug = ${sqlString(args.slug)}
),
src (
    tipo,
    classe,
    classe_ordem,
    processo,
    fonte_id,
    ordem_origem,
    metadados,
    geom
) AS (
    VALUES
${values}
)
INSERT INTO public.areas_suscetibilidade (
    cartografia_id,
    tipo,
    classe,
    classe_ordem,
    processo,
    fonte_id,
    ordem_origem,
    area_ha,
    metadados,
    geom
)
SELECT
    cart.id,
    src.tipo,
    src.classe,
    src.classe_ordem,
    src.processo,
    src.fonte_id,
    src.ordem_origem,
    round((ST_Area(src.geom::geography) / 10000)::numeric, 8),
    src.metadados,
    src.geom
FROM src
CROSS JOIN cart;

-- Verificação pós-importação: contagem, SRID e validade. Qualquer divergência
-- reverte a transação inteira.
DO $$
DECLARE
    v_total BIGINT;
    v_inundacao BIGINT;
    v_enxurrada BIGINT;
    v_invalidas BIGINT;
    v_srid_errado BIGINT;
BEGIN
    SELECT
        count(*),
        count(*) FILTER (WHERE a.tipo = 'inundacao'),
        count(*) FILTER (WHERE a.tipo = 'enxurrada'),
        count(*) FILTER (WHERE NOT ST_IsValid(a.geom)),
        count(*) FILTER (WHERE ST_SRID(a.geom) <> 4326)
    INTO v_total, v_inundacao, v_enxurrada, v_invalidas, v_srid_errado
    FROM public.areas_suscetibilidade AS a
    JOIN public.cartografias_suscetibilidade AS c
      ON c.id = a.cartografia_id
    WHERE c.slug = ${sqlString(args.slug)};

    IF v_total <> ${expected.inundacao + expected.enxurrada} THEN
        RAISE EXCEPTION 'Importação de suscetibilidade: esperadas ${
          expected.inundacao + expected.enxurrada
        } feições, encontradas %', v_total;
    END IF;
    IF v_inundacao <> ${expected.inundacao} THEN
        RAISE EXCEPTION 'Importação de suscetibilidade: esperadas ${
          expected.inundacao
        } feições de inundação, encontradas %', v_inundacao;
    END IF;
    IF v_enxurrada <> ${expected.enxurrada} THEN
        RAISE EXCEPTION 'Importação de suscetibilidade: esperadas ${
          expected.enxurrada
        } feições de enxurrada, encontradas %', v_enxurrada;
    END IF;
    IF v_invalidas > 0 THEN
        RAISE EXCEPTION 'Importação de suscetibilidade: % geometria(s) inválida(s).', v_invalidas;
    END IF;
    IF v_srid_errado > 0 THEN
        RAISE EXCEPTION 'Importação de suscetibilidade: % geometria(s) fora do SRID 4326.', v_srid_errado;
    END IF;

    RAISE NOTICE 'Suscetibilidade importada: % feições (% inundação, % enxurrada), todas válidas em SRID 4326.',
        v_total, v_inundacao, v_enxurrada;
END;
$$;

COMMIT;
`

  return { sql, allFeatures, expected, metadata }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourceDir = resolve(args.source)
  const layers = LAYERS.map((layer) => ({ ...layer, ...loadLayer(sourceDir, layer) }))

  const sourceFiles = layers.flatMap((layer) => [
    layer.files.shp,
    layer.files.dbf,
    layer.files.prj,
  ])
  const sourceInfo = {
    arquivoOrigem: args.zip
      ? basename(args.zip)
      : `${basename(sourceDir)}/${layers.map((layer) => `${layer.arquivo}.shp`).join(', ')}`,
    hash: args.zip ? sha256File(args.zip) : sha256Composite(sourceFiles),
    zip: args.zip ? resolve(args.zip) : null,
  }

  const { sql, allFeatures, expected, metadata } = generateSql(args, layers, sourceInfo)

  const outFile = resolve(args.out)
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, sql, 'utf8')

  const totalPoints = allFeatures.reduce((sum, feature) => sum + feature.pontoCount, 0)
  const totalPolygons = allFeatures.reduce((sum, feature) => sum + feature.polygons, 0)

  console.log('Suscetibilidade de Cajamar — importador')
  console.log(`  Fonte: ${SOURCE.titulo}`)
  console.log(`  CRS: ${SOURCE.sridOrigem} -> ${SOURCE.sridDestino}`)
  console.log(`  SHA-256: ${sourceInfo.hash}`)
  console.log(`  Inundação: ${expected.inundacao} feições ${JSON.stringify(metadata.camadas.inundacao.classes)}`)
  console.log(`  Enxurrada: ${expected.enxurrada} feições ${JSON.stringify(metadata.camadas.enxurrada.classes)}`)
  console.log(`  Anéis/pontos: ${totalPolygons} polígonos, ${totalPoints} pontos`)
  console.log(`  SQL: ${outFile} (${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(2)} MB)`)
  if (args.unpublished) console.log('  publicada = false (importação de teste)')
}

try {
  main()
} catch (error) {
  console.error(`\nFALHA: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
