import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { buildPrompt } from '@/lib/prompt-builder'
import { applyPricingToRow } from '@/lib/product-pricing'
import type { ProductPricingRules } from '@/lib/product-pricing'

// ─── Vercel max function duration ─────────────────────────────────────────────
export const maxDuration = 300

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT       = 5
const MAX_DAILY_VARIANTS   = 50_000
const BATCH_SIZE           = 5    // small batches → Claude stays consistent across products
const PARALLEL_BATCHES     = 1    // sequential — allows anchor product system

// Pricing: https://www.anthropic.com/pricing
const COST_INPUT  = 3    / 1_000_000   // $3.00 per MTok
const COST_CACHED = 0.30 / 1_000_000   // $0.30 per MTok (cache read)
const COST_OUTPUT = 15   / 1_000_000   // $15.00 per MTok

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

function escapeCSV(val: unknown): string {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowsToCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => headers.map(h => escapeCSV(row[h])).join(',')),
  ]
  return lines.join('\r\n')
}

function parseJSONResponse(text: string): unknown[] {
  // Direct parse
  try { return JSON.parse(text) } catch { /* try next */ }
  // Strip markdown fences
  const stripped = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
  try { return JSON.parse(stripped) } catch { /* try next */ }
  // Extract first JSON array
  const m = stripped.match(/\[[\s\S]*\]/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* fail */ } }
  throw new Error(`Unparseable response: ${text.slice(0, 200)}`)
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemMessage(
  client:           Record<string, unknown>,
  profile:          Record<string, unknown> | null,
  template:         Record<string, unknown> | null,
  special:          string | null,
  imageEnabled:     boolean,
  promptVariables?: Record<string, string> | null,
): string {
  const parts: string[] = []

  // Base system prompt
  parts.push(
    String(template?.system_prompt ?? '') ||
    'You are an expert e-commerce product listing optimizer. Rewrite product listings to maximize conversion and search visibility.'
  )

  // Client context
  parts.push(`
Client Context:
- Store: ${client.store_name}
- Niche: ${client.niche ?? 'general'}
- Market: ${client.market ?? 'international'}
- Language: ${client.language ?? 'english'}
- Title preference: ${client.title_preference ?? 'medium'}
- Description style: ${client.description_style ?? 'neutral'}`.trim())

  // Profile instructions
  if (profile) {
    const pLines: string[] = []
    if (profile.tone_of_voice)                pLines.push(`- Tone of voice: ${profile.tone_of_voice}`)
    if (profile.title_structure)              pLines.push(`- Title structure: ${profile.title_structure}`)
    if (profile.description_length)           pLines.push(`- Description length: ${profile.description_length}`)
    if (profile.keyword_strategy)             pLines.push(`- Keyword strategy: ${profile.keyword_strategy}`)
    if (profile.special_standing_instructions) pLines.push(`- Standing instructions: ${profile.special_standing_instructions}`)
    if (pLines.length) parts.push(`\nProfile Instructions:\n${pLines.join('\n')}`)
  }

  // Template instructions
  if (template) {
    if (template.title_instructions)       parts.push(`\nTitle Instructions:\n${template.title_instructions}`)
    if (template.description_instructions) parts.push(`\nDescription Instructions:\n${template.description_instructions}`)
    if (template.seo_instructions)         parts.push(`\nSEO Instructions:\n${template.seo_instructions}`)
    if (template.formatting_rules)         parts.push(`\nFormatting Rules:\n${template.formatting_rules}`)
    if (imageEnabled) {
      if (template.alt_text_instructions)  parts.push(`\nImage Alt Text Instructions:\n${template.alt_text_instructions}`)
      if (template.filename_instructions)  parts.push(`\nFilename Instructions:\n${template.filename_instructions}`)
    }
  }

  // Batch-level special instructions
  if (special?.trim()) {
    parts.push(`\nAdditional instructions for this batch: ${special.trim()}`)
  }

  parts.push('\nCRITICAL: Respond ONLY with valid JSON. No markdown. No explanation.')

  const rawMessage = parts.join('\n')

  // Apply {{variable}} substitution from client profile
  if (promptVariables && Object.keys(promptVariables).length > 0) {
    return rawMessage.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (match: string, name: string) => {
      return (promptVariables as Record<string, string>)[name] ?? match
    })
  }
  return rawMessage
}

// ─── Field categories ─────────────────────────────────────────────────────────

// TEXT fields: generated per product, copied to all variant rows
const TEXT_OUTPUT_FIELDS = new Set([
  'title', 'description', 'tags',
  'seo_title', 'seo_description',
  'image_alt_text', 'alt_text',
])

// ─── Price / SKU rule types ────────────────────────────────────────────────────

type PriceRule = {
  action:    'set' | 'multiply' | 'add' | 'subtract' | 'round'
  value:     number
  apply_to:  'variant_price' | 'variant_compare_at_price' | 'both'
  based_on?: 'variant_price' | 'variant_compare_at_price'
  round_to?: string   // '.99' | '.95' | '.00'
}

type SkuRule = {
  action: 'set' | 'prefix' | 'suffix' | 'replace'
  value:  string
  find?:  string   // only for 'replace'
}

function parseNum(s: string): number {
  return parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')) || 0
}

function applyPriceRule(
  rule:          PriceRule,
  currentPrice:  string,
  currentComp:   string,
): { price: string; compareAt: string } {
  let p  = parseNum(currentPrice)
  let ca = parseNum(currentComp)

  function calc(val: number, base?: number): number {
    const ref = base ?? val
    switch (rule.action) {
      case 'set':      return rule.value
      case 'multiply': return ref * rule.value
      case 'add':      return val + rule.value
      case 'subtract': return Math.max(0, val - rule.value)
      case 'round': {
        const suffix = String(rule.round_to ?? '.99')
        const dec    = parseFloat('0' + (suffix.includes('.') ? suffix.slice(suffix.indexOf('.')) : '.99'))
        const floored = Math.floor(val)
        const candidate = floored + dec
        return candidate >= val ? candidate : candidate + 1
      }
    }
  }

  if (rule.apply_to === 'variant_price' || rule.apply_to === 'both') {
    const base = rule.based_on === 'variant_compare_at_price' ? ca : undefined
    p = calc(p, base)
  }
  if (rule.apply_to === 'variant_compare_at_price' || rule.apply_to === 'both') {
    const base = rule.based_on === 'variant_price' ? p : undefined
    ca = calc(ca, base)
  }

  const fmt = (n: number) => n > 0 ? n.toFixed(2) : ''
  return { price: fmt(p), compareAt: fmt(ca) }
}

function applySkuRule(rule: SkuRule, currentSku: string): string {
  switch (rule.action) {
    case 'set':     return rule.value
    case 'prefix':  return rule.value + currentSku
    case 'suffix':  return currentSku + rule.value
    case 'replace': return rule.find
      ? currentSku.replace(new RegExp(rule.find, 'g'), rule.value)
      : rule.value
  }
}

// ─── Shopify column constants ─────────────────────────────────────────────────

const SHOPIFY_DETECT_COLS = ['handle', 'title', 'body (html)', 'vendor']

function isShopifyHeaders(headers: string[]): boolean {
  const lower = new Set(headers.map(h => h.toLowerCase()))
  return SHOPIFY_DETECT_COLS.every(c => lower.has(c))
}

// ─── Product row type ─────────────────────────────────────────────────────────

type ProductRow = {
  index:          number
  title:          string
  description:    string
  price:          string
  sku:            string
  tags:           string
  type:           string
  vendor:         string
  variantSummary: string
  options:        { name: string; values: string[] }[]  // structured for translation
  hasImages:      boolean
}

// ─── Variant option parser ────────────────────────────────────────────────────

function parseVariantOptions(
  variantGroup:  Record<string, string>[],
  headers:       string[],
): { summary: string; options: { name: string; values: string[] }[] } {
  const groups: { name: string; values: string[] }[] = []
  for (let i = 1; i <= 3; i++) {
    const nameCol  = headers.find(h => h.toLowerCase() === `option${i} name`)
    const valueCol = headers.find(h => h.toLowerCase() === `option${i} value`)
    if (!nameCol || !valueCol) continue
    const optName = String(variantGroup[0][nameCol] ?? '').trim()
    if (!optName || optName.toLowerCase() === 'title') continue
    const values = [...new Set(
      variantGroup.map(v => String(v[valueCol] ?? '').trim()).filter(Boolean)
    )]
    if (values.length) groups.push({ name: optName, values })
  }
  return {
    summary: groups.map(g => `${g.name}: ${g.values.join(', ')}`).join(' | '),
    options: groups,
  }
}

// ─── Batch message builder ────────────────────────────────────────────────────

function buildBatchMessage(
  batch:          ProductRow[],
  imageEnabled:   boolean,
  outputColumns:  string[],
  hasPriceRule:   boolean,
  hasSkuRule:     boolean,
  anchorText?:    string,
): string {
  // Separate text fields from data fields
  const textFields = outputColumns.filter(k => TEXT_OUTPUT_FIELDS.has(k))
  if (imageEnabled && !textFields.includes('image_alt_text')) textFields.push('image_alt_text')

  const dataFields = outputColumns.filter(k =>
    !TEXT_OUTPUT_FIELDS.has(k) &&
    !['variant_price', 'variant_compare_at_price', 'variant_sku'].includes(k)
  )

  const allFields = [...textFields, ...dataFields]
  if (hasPriceRule)  allFields.push('price_rule')
  if (hasSkuRule)    allFields.push('sku_rule')

  const lines: string[] = [
    `Process these ${batch.length} product listing(s) according to the instructions.`,
    `Return a JSON array of exactly ${batch.length} object(s).`,
    `Each object must have these fields: ${allFields.join(', ')}.`,
    '',
  ]

  if (hasPriceRule) {
    lines.push('For price_rule, return an object with:')
    lines.push('  { "action": "set"|"multiply"|"add"|"subtract"|"round", "value": number, "apply_to": "variant_price"|"variant_compare_at_price"|"both", "based_on"?: "variant_price"|"variant_compare_at_price", "round_to"?: ".99"|".95"|".00" }')
    lines.push('The same rule applies to ALL variants of the product. Do not return a specific price.')
    lines.push('')
  }

  if (hasSkuRule) {
    lines.push('For sku_rule, return an object with:')
    lines.push('  { "action": "set"|"prefix"|"suffix"|"replace", "value": string, "find"?: string }')
    lines.push('The rule is applied to each variant\'s current SKU. Do not return a specific SKU.')
    lines.push('')
  }

  for (const p of batch) {
    lines.push(`Product ${p.index + 1}:`)
    lines.push(`Title: ${p.title || '(empty)'}`)
    lines.push(`Description: ${p.description || '(empty)'}`)
    if (p.tags)    lines.push(`Tags: ${p.tags}`)
    if (p.vendor)  lines.push(`Vendor: ${p.vendor}`)
    if (p.type)    lines.push(`Type: ${p.type}`)
    if (p.price)   lines.push(`Price: ${p.price}`)
    if (p.sku)     lines.push(`Current SKU: ${p.sku}`)
    if (p.options.length > 0) {
      p.options.forEach(opt => lines.push(`Option ${opt.name}: ${opt.values.join(', ')}`))
    } else if (p.variantSummary) {
      lines.push(`Variants: ${p.variantSummary}`)
    }
    lines.push(`Has images: ${p.hasImages ? 'yes' : 'no'}`)
    lines.push('')
  }

  lines.push(`Return JSON array with exactly ${batch.length} object(s).`)

  if (anchorText) {
    lines.push('')
    lines.push(anchorText)
  }

  return lines.join('\n')
}

// ─── Result type ──────────────────────────────────────────────────────────────

type OptionTranslation = {
  name:           string
  translatedName: string
  values:         { original: string; translated: string }[]
}

type OptResult = {
  title:               string
  description:         string
  tags:                string
  seo_title:           string
  seo_description:     string
  alt_text:            string
  filename_suggestion: string
  title_attribute:     string
  option_translations: OptionTranslation[]
  // Dynamic extra columns (simple values applied to all rows)
  extras:              Record<string, string>
  // Rule-based mutations applied to every row
  price_rule:          PriceRule | null
  sku_rule:            SkuRule   | null
}

// ─── SKU builder ──────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildVariantSku(
  skuStructure:       string,
  translatedTitle:    string,
  translatedRow:      Record<string, string>,
  optionTranslations: OptionTranslation[],
  headers:            string[],
): string {
  const components = skuStructure.split('-').map(c => c.trim().toLowerCase()).filter(Boolean)
  const parts: string[] = []

  for (const comp of components) {
    if (comp === 'title') {
      const s = slugify(translatedTitle)
      if (s) parts.push(s)
      continue
    }

    // Match component keyword to an option name (original or translated)
    const trans = optionTranslations.find(t =>
      slugify(t.name) === comp ||
      slugify(t.translatedName) === comp ||
      t.name.toLowerCase() === comp ||
      t.translatedName.toLowerCase() === comp
    )
    if (!trans) continue

    // Find which option column this maps to in this variant row
    for (let i = 1; i <= 3; i++) {
      const nameCol  = headers.find(h => h.toLowerCase() === `option${i} name`)
      const valueCol = headers.find(h => h.toLowerCase() === `option${i} value`)
      if (!nameCol || !valueCol) continue
      const rowOptName = String(translatedRow[nameCol] ?? '').trim()
      // Match by translated or original name
      if (
        rowOptName.toLowerCase() === trans.translatedName.toLowerCase() ||
        rowOptName.toLowerCase() === trans.name.toLowerCase()
      ) {
        const val = String(translatedRow[valueCol] ?? '').trim()
        const s = slugify(val)
        if (s) parts.push(s)
        break
      }
    }
  }

  return parts.filter(Boolean).join('-')
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

export async function runPipeline(uploadId: string): Promise<void> {
  const startTime = Date.now()

  // 1. Load upload record
  const { data: upload, error: upErr } = await supabase
    .from('uploads').select('*').eq('id', uploadId).single()
  if (upErr || !upload) throw new Error('Upload not found')

  // 2. Set status → processing + start timestamp
  const { error: procErr } = await supabase
    .from('uploads').update({
      status:                'processing',
      processing_started_at: new Date().toISOString(),
    }).eq('id', uploadId)
  if (procErr) throw new Error(procErr.message)
  await logActivity({ action: 'upload_processing_started', upload_id: uploadId, va_id: String(upload.va_id), source: 'system', details: `Processing started for upload ${uploadId}` })

  // 3. Load client
  const { data: client, error: cErr } = await supabase
    .from('clients').select('*').eq('id', upload.client_id).single()
  if (cErr || !client) throw new Error('Client not found')

  const clientLanguage     = String((client as Record<string, unknown>).language ?? '').toLowerCase().trim()
  const isTranslation      = clientLanguage !== 'english' && clientLanguage !== 'en' && clientLanguage !== ''
  // Resolved sku structure: client override → template default → global default (handled in buildPrompt)
  // promptSku is set after buildPrompt call below — use a placeholder here, overwrite after
  let clientSkuStructure   = String((client as Record<string, unknown>).sku_structure ?? '').trim()

  // 4-5. (handled inside buildPrompt — see lib/prompt-builder.ts)

  // 6. Download input file
  if (!upload.input_file_path) throw new Error('No input file path')
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from('uploads').download(upload.input_file_path)
  if (dlErr || !fileBlob) throw new Error(`Download failed: ${dlErr?.message ?? 'no data'}`)

  // 7. Parse file → rows
  const fileBuffer = await fileBlob.arrayBuffer()
  const wb         = XLSX.read(fileBuffer, { type: 'array' })
  const sheetName  = (upload.sheet_name as string | null) || wb.SheetNames[0]
  const ws         = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]]
  const allRows    = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
  if (!allRows.length) throw new Error('No data rows found in file')

  const headers      = Object.keys(allRows[0])
  const variantRows  = allRows  // all rows = variants

  // 8. Apply column mapping + resolve output_columns
  // output_columns is now its own JSONB column; fall back to __output_columns in column_mapping for old uploads
  const rawColMap = (upload.column_mapping as Record<string, unknown> | null) ?? {}
  const outputColumns: string[] =
    Array.isArray((upload as Record<string, unknown>).output_columns)
      ? ((upload as Record<string, unknown>).output_columns as string[])
      : Array.isArray(rawColMap.__output_columns)
        ? (rawColMap.__output_columns as string[])
        : ['title', 'description', 'tags', 'seo_title', 'seo_description']

  const fieldToCol: Record<string, string> = {}
  for (const [field, col] of Object.entries(rawColMap)) {
    if (field.startsWith('__')) continue
    if (typeof col === 'string' && col) fieldToCol[field] = col
  }

  // Map from output_column key → CSV header for extra fields
  const EXTRA_COL_CSV: Record<string, string[]> = {
    variant_price:            ['Variant Price', 'Price', 'price'],
    variant_compare_at_price: ['Variant Compare At Price', 'Compare At Price'],
    variant_sku:              ['Variant SKU', 'SKU', 'sku'],
    vendor:                   ['Vendor', 'vendor'],
    type:                     ['Type', 'Product Type', 'type'],
  }

  // Resolve which extra CSV column to write for each extra output key
  const extraOutputCols: { key: string; csvCol: string }[] = []
  for (const key of outputColumns) {
    if (['title', 'description', 'tags', 'seo_title', 'seo_description'].includes(key)) continue
    if (['image_alt_text', 'alt_text', 'image_filename', 'image_title'].includes(key)) continue  // handled by imageEnabled
    const candidates = EXTRA_COL_CSV[key] ?? [key]
    const found = candidates.find(c => headers.includes(c))
    if (found) extraOutputCols.push({ key, csvCol: found })
    else {
      // Use the key itself as the new column name if not found in headers
      extraOutputCols.push({ key, csvCol: key })
    }
  }

  // 9. Group variants by product (Handle → Title → each row is its own product)
  // parentIndexByKey: maps group-key → index of the FIRST (parent) row for that product
  const handleCol = headers.find(h => h.toLowerCase() === 'handle')
  const titleCol  = fieldToCol.title
    || headers.find(h => ['title', 'product title', 'name', 'product name'].includes(h.toLowerCase()))

  const groupKeyOf = (row: Record<string, string>, idx: number): string => {
    if (handleCol) return String(row[handleCol] ?? '').trim() || `__row_${idx}`
    if (titleCol)  return String(row[titleCol]  ?? '').trim() || `__row_${idx}`
    return `__row_${idx}`
  }

  // parentIdx[i] = index of the parent row for variant i
  const parentIdx: number[] = new Array(variantRows.length)
  const firstSeen = new Map<string, number>()
  for (let i = 0; i < variantRows.length; i++) {
    const key = groupKeyOf(variantRows[i], i)
    if (!firstSeen.has(key)) firstSeen.set(key, i)
    parentIdx[i] = firstSeen.get(key)!
  }

  // Unique parent indices = the rows we actually send to Claude
  const parentIndices = [...new Set(parentIdx)]

  // Group all variant rows by parent for variant summary
  const variantsByParent = new Map<number, Record<string, string>[]>()
  for (let i = 0; i < variantRows.length; i++) {
    const pIdx = parentIdx[i]
    const g = variantsByParent.get(pIdx) ?? []
    g.push(variantRows[i])
    variantsByParent.set(pIdx, g)
  }

  // Detect image column (Shopify: "Image Src", generic: mapped image field)
  const imageSrcCol = fieldToCol.image
    || headers.find(h => h.toLowerCase() === 'image src')
    || headers.find(h => h.toLowerCase().startsWith('image'))

  const parentProductRows: ProductRow[] = parentIndices.map((rowIdx, batchPos) => {
    const row   = variantRows[rowIdx]
    const group = variantsByParent.get(rowIdx) ?? [row]
    const { summary: variantSummary, options } = parseVariantOptions(group, headers)
    const hasImages = imageSrcCol
      ? group.some(v => String(v[imageSrcCol] ?? '').trim() !== '')
      : false
    return {
      index:          batchPos,
      title:          fieldToCol.title       ? String(row[fieldToCol.title]       ?? '') : '',
      description:    fieldToCol.description ? String(row[fieldToCol.description] ?? '') : '',
      price:          fieldToCol.price       ? String(row[fieldToCol.price]       ?? '') : '',
      sku:            fieldToCol.sku         ? String(row[fieldToCol.sku]         ?? '') : '',
      tags:           fieldToCol.tags        ? String(row[fieldToCol.tags]        ?? '') : '',
      type:           fieldToCol.type        ? String(row[fieldToCol.type]        ?? '') : '',
      vendor:         fieldToCol.vendor      ? String(row[fieldToCol.vendor]      ?? '') : '',
      variantSummary,
      options,
      hasImages,
    }
  })

  console.log(`[process-upload] ${variantRows.length} variants → ${parentIndices.length} unique products to optimize`)

  // Determine if price/sku rules are needed (based on output_columns)
  const hasPriceRule = outputColumns.some(k =>
    k === 'variant_price' || k === 'variant_compare_at_price'
  )
  const hasSkuRule = outputColumns.includes('variant_sku')

  // Resolve CSV columns for price/sku rule targets
  const priceCol      = headers.find(h => h === 'Variant Price')            ?? fieldToCol.price      ?? ''
  const compareAtCol  = headers.find(h => h === 'Variant Compare At Price') ?? ''
  const skuCsvCol     = headers.find(h => h === 'Variant SKU')              ?? fieldToCol.sku        ?? ''

  // 10. Image settings
  const imgSettings    = (upload as Record<string, unknown>).image_settings as Record<string, boolean> | null | undefined
  const imageEnabled   = !!(imgSettings?.alt_text || imgSettings?.filename || imgSettings?.title_attribute)

  // 11. Build system message via layered prompt builder (same for all batches → cached)
  const { system: sysBase, title: titleInstr, description: descInstr, skuStructure: promptSku } = await buildPrompt(
    upload.client_id as string,
    upload.special_instructions as string | null,
    imageEnabled,
    (upload as Record<string, unknown>).prompt_id as string | null,
  )
  // buildPrompt already applies the fallback chain (client → template → default)
  clientSkuStructure = promptSku

  const systemContent = [
    'You are a product listing optimization engine. You follow instructions EXACTLY. Do NOT vary your format between products. Product 1 and product 200 MUST follow the same structure. No improvising. No creative interpretation of format.\n\n',
    sysBase,
    titleInstr  ? `\n\n## TITLE INSTRUCTIONS — APPLY EXACTLY, SAME FORMAT FOR EVERY PRODUCT\n${titleInstr}`      : '',
    descInstr   ? `\n\n## DESCRIPTION INSTRUCTIONS — APPLY EXACTLY, SAME FORMAT FOR EVERY PRODUCT\n${descInstr}` : '',
    '\n\nCRITICAL: Respond ONLY with valid JSON array. No markdown. No explanation. Every product MUST follow the same structure.',
  ].join('')

  // 12. Claude API — parallel batch processing of PARENT rows only
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let totalInput = 0, totalOutput = 0, totalCached = 0
  let batchesCompleted = 0, batchesFailed = 0, apiCallsCount = 0

  const parentResults: (OptResult | null)[] = new Array(parentIndices.length).fill(null)
  const batchCount  = Math.ceil(parentProductRows.length / BATCH_SIZE)
  const roundCount  = Math.ceil(batchCount / PARALLEL_BATCHES)

  // Helper: one API call with retry
  async function callClaude(batchIdx: number, batchSlice: ProductRow[], anchorText?: string): Promise<{
    batchIdx: number
    tokens: { input: number; output: number; cached: number }
    parsed: Record<string, string>[] | null
  }> {
    const userContent = buildBatchMessage(batchSlice, imageEnabled, outputColumns, hasPriceRule, hasSkuRule, anchorText)
    let response: Anthropic.Message | null = null
    let lastErr: Error | null = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await anthropic.messages.create({
          model:       'claude-sonnet-4-6',
          max_tokens:  8192,
          temperature: 0,   // deterministic output — critical for consistency
          system: [
            {
              type:          'text',
              text:          systemContent,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cache_control: { type: 'ephemeral' } as any,
            },
          ],
          messages: [{ role: 'user', content: userContent }],
        })
        break
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        const status = (err as { status?: number }).status
        console.error(`[process-upload] batch ${batchIdx} attempt ${attempt + 1} error:`, lastErr.message)
        if (status === 429) {
          const retryAfter = parseInt(
            String((err as { headers?: Record<string, string> }).headers?.['retry-after'] ?? '10'), 10,
          ) || 10
          void logActivity({ action: 'api_rate_limited', upload_id: uploadId, va_id: String(upload.va_id), source: 'api', severity: 'warning', details: `Rate limited on batch ${batchIdx} (attempt ${attempt + 1}), retrying after ${retryAfter}s` })
          await sleep(retryAfter * 1000)
        } else if (status != null && status >= 500) {
          await sleep(5000)
        } else if (attempt < 2) {
          await sleep(2000)
        }
      }
    }

    if (!response) {
      console.error(`[process-upload] batch ${batchIdx} failed after 3 attempts: ${lastErr?.message}`)
      return { batchIdx, tokens: { input: 0, output: 0, cached: 0 }, parsed: null }
    }

    const usage = response.usage as Anthropic.Usage & { cache_read_input_tokens?: number }
    const tokens = {
      input:  usage.input_tokens  ?? 0,
      output: usage.output_tokens ?? 0,
      cached: usage.cache_read_input_tokens ?? 0,
    }
    void logActivity({ action: 'api_call_made', upload_id: uploadId, va_id: String(upload.va_id), source: 'api', details: `Batch ${batchIdx}: ${batchSlice.length} products, ${tokens.input}/${tokens.output} tokens in/out`, metadata: { batch_index: batchIdx, products: batchSlice.length, input_tokens: tokens.input, output_tokens: tokens.output, cached_tokens: tokens.cached } })
    try {
      const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
      console.log(`[process-upload] batch ${batchIdx} raw (first 200): ${rawText.slice(0, 200)}`)
      const parsed = parseJSONResponse(rawText) as Record<string, string>[]
      return { batchIdx, tokens, parsed }
    } catch (parseErr: unknown) {
      console.error(`[process-upload] batch ${batchIdx} parse error:`, parseErr instanceof Error ? parseErr.message : parseErr)
      return { batchIdx, tokens, parsed: null }
    }
  }

  // Anchor: after batch 0, inject first 2 input→output examples into all subsequent batches
  let anchorText = ''

  // Process in sequential rounds (PARALLEL_BATCHES=1 → one batch per round)
  for (let round = 0; round < roundCount; round++) {
    const promises: ReturnType<typeof callClaude>[] = []
    for (let i = 0; i < PARALLEL_BATCHES; i++) {
      const b = round * PARALLEL_BATCHES + i
      if (b >= batchCount) break
      const batchSlice = parentProductRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
      promises.push(callClaude(b, batchSlice, b > 0 ? anchorText : undefined))
    }

    const roundResults = await Promise.all(promises)

    for (const { batchIdx, tokens, parsed } of roundResults) {
      totalInput  += tokens.input
      totalOutput += tokens.output
      totalCached += tokens.cached
      apiCallsCount++
      if (parsed) batchesCompleted++; else batchesFailed++

      if (!parsed) continue
      const batchSlice = parentProductRows.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE)

      // Validate output count matches input count
      if (parsed.length !== batchSlice.length) {
        console.warn(`[process-upload] batch ${batchIdx} count mismatch: expected ${batchSlice.length}, got ${parsed.length}`)
      }

      for (let i = 0; i < batchSlice.length; i++) {
        const item     = parsed[i] ?? {}
        const pIdx     = batchIdx * BATCH_SIZE + i
        const orig     = parentProductRows[pIdx]

        // Validate title/description are present and non-empty
        const title = String(item.title ?? '').trim()
        const description = String(item.description ?? '').trim()
        if (!title || title.length < 3) {
          console.warn(`[process-upload] batch ${batchIdx} product ${i + 1}: title missing or too short ("${title}")`)
        }
        if (!description || description.length < 10) {
          console.warn(`[process-upload] batch ${batchIdx} product ${i + 1}: description missing or too short`)
        }

        // Log style consistency check against anchor
        console.log(`[process-upload] batch ${batchIdx} product ${i + 1} title: "${title.substring(0, 80)}"`)

        // Collect simple extra data fields (non-rule, non-price)
        const extras: Record<string, string> = {}
        for (const { key } of extraOutputCols) {
          if (['variant_price', 'variant_compare_at_price', 'variant_sku'].includes(key)) continue
          if (key in item) extras[key] = String(item[key] ?? '')
        }

        // Extract rule objects (type-guard the shape)
        const rawPriceRule = (item as Record<string, unknown>).price_rule
        const priceRule: PriceRule | null =
          hasPriceRule && rawPriceRule && typeof rawPriceRule === 'object' &&
          'action' in rawPriceRule && 'value' in rawPriceRule && 'apply_to' in rawPriceRule
            ? rawPriceRule as PriceRule
            : null

        const rawSkuRule = (item as Record<string, unknown>).sku_rule
        const skuRule: SkuRule | null =
          hasSkuRule && rawSkuRule && typeof rawSkuRule === 'object' &&
          'action' in rawSkuRule && 'value' in rawSkuRule
            ? rawSkuRule as SkuRule
            : null

        const rawOptionTrans = (item as Record<string, unknown>).option_translations
        const optionTranslations: OptionTranslation[] = Array.isArray(rawOptionTrans)
          ? (rawOptionTrans as OptionTranslation[])
          : []

        parentResults[pIdx] = {
          title:               title       || orig.title,
          description:         description || orig.description,
          tags:                String(item.tags                ?? orig.tags),
          seo_title:           String(item.seo_title           ?? ''),
          seo_description:     String(item.seo_description     ?? ''),
          alt_text:            String(item.alt_text ?? item.image_alt_text ?? ''),
          filename_suggestion: String(item.filename_suggestion ?? ''),
          title_attribute:     String(item.title_attribute     ?? ''),
          option_translations: optionTranslations,
          extras,
          price_rule:          priceRule,
          sku_rule:            skuRule,
        }
      }

      // Build anchor from first batch result (few-shot for all subsequent batches)
      if (batchIdx === 0 && !anchorText && parsed.length >= 1) {
        const anchorCount = Math.min(2, batchSlice.length)
        const examples = batchSlice.slice(0, anchorCount).map((inp, i) => ({
          input:  { title: inp.title, description: inp.description },
          output: { title: String(parsed[i]?.title ?? ''), description: String(parsed[i]?.description ?? '') },
        }))
        anchorText = `## STYLE REFERENCE — Follow this EXACT format for all remaining products\n${JSON.stringify(examples, null, 2)}`
        console.log(`[process-upload] anchor set from batch 0 (${anchorCount} examples)`)
      }
    }

    console.log(`[process-upload] round ${round + 1}/${roundCount} done (${promises.length} batches)`)
  }

  // Build per-variant results: copy parent result to all its variants
  const parentResultByRowIdx = new Map<number, OptResult | null>()
  for (let p = 0; p < parentIndices.length; p++) {
    parentResultByRowIdx.set(parentIndices[p], parentResults[p])
  }
  const results: (OptResult | null)[] = variantRows.map((_row, i) => {
    const pIdx = parentIdx[i]
    return parentResultByRowIdx.get(pIdx) ?? null
  })

  // 13. Build output rows (one per variant)
  const isShopify       = isShopifyHeaders(headers)
  const hasPartialFail  = results.some(r => r === null)

  // Precompute option column names (same for all rows in a Shopify CSV)
  const optionCols: { nameCol: string; valueCol: string }[] = []
  for (let oi = 1; oi <= 3; oi++) {
    const nameCol  = headers.find(h => h.toLowerCase() === `option${oi} name`)
    const valueCol = headers.find(h => h.toLowerCase() === `option${oi} value`)
    if (nameCol && valueCol) optionCols.push({ nameCol, valueCol })
  }

  // Shopify already has SEO Title / SEO Description / Image Alt Text columns
  // For non-Shopify we add them as new columns at the end
  const seoTitleCol    = headers.find(h => h.toLowerCase() === 'seo title')    || 'SEO Title'
  const seoDescCol     = headers.find(h => h.toLowerCase() === 'seo description') || 'SEO Description'
  const imgAltCol      = headers.find(h => h.toLowerCase() === 'image alt text')  || 'Image Alt Text'

  const outputRows: Record<string, string>[] = variantRows.map((row, i) => {
    const result      = results[i]
    const isParentRow = parentIdx[i] === i
    const out: Record<string, string> = {}

    // Copy ALL original columns first
    for (const h of headers) out[h] = String(row[h] ?? '')

    if (result) {
      // ── TEXT fields → write to ALL rows (title + description shared by all variants)
      if (fieldToCol.title)       out[fieldToCol.title]       = result.title
      if (fieldToCol.description) out[fieldToCol.description] = result.description
      if (fieldToCol.tags)        out[fieldToCol.tags]        = result.tags

      // SEO fields → parent row only (Shopify: overwrite existing col; non-Shopify: new col)
      if (isParentRow) {
        out[seoTitleCol] = result.seo_title
        out[seoDescCol]  = result.seo_description
        if (imageEnabled) out[imgAltCol] = result.alt_text
        if (!isShopify && imageEnabled) {
          out['Image Filename Suggestion'] = result.filename_suggestion
          out['Image Title']               = result.title_attribute
        }
      }

      // ── Simple DATA extras (vendor, type, etc.) → write to ALL rows
      for (const { key, csvCol } of extraOutputCols) {
        if (key in result.extras) out[csvCol] = result.extras[key]
      }

      // ── Price rule → apply to EVERY row using its own current price
      if (result.price_rule) {
        const { price: newPrice, compareAt: newCompareAt } = applyPriceRule(
          result.price_rule,
          priceCol     ? String(row[priceCol]     ?? '') : '',
          compareAtCol ? String(row[compareAtCol] ?? '') : '',
        )
        if (priceCol && (result.price_rule.apply_to === 'variant_price' || result.price_rule.apply_to === 'both')) {
          out[priceCol] = newPrice
        }
        if (compareAtCol && (result.price_rule.apply_to === 'variant_compare_at_price' || result.price_rule.apply_to === 'both')) {
          out[compareAtCol] = newCompareAt
        }
      }

      // ── SKU rule → apply to EVERY row using its own current SKU
      if (result.sku_rule && skuCsvCol) {
        out[skuCsvCol] = applySkuRule(result.sku_rule, String(row[skuCsvCol] ?? ''))
      }

      // ── Option translations → apply to EVERY row (name + value per option)
      if ((isTranslation || clientSkuStructure) && result.option_translations.length > 0) {
        for (const { nameCol, valueCol } of optionCols) {
          const origOptName = String(row[nameCol] ?? '').trim()
          if (!origOptName) continue
          const trans = result.option_translations.find(
            t => t.name.toLowerCase() === origOptName.toLowerCase()
          )
          if (!trans) continue
          if (isTranslation && trans.translatedName) out[nameCol] = trans.translatedName
          const origValue = String(row[valueCol] ?? '').trim()
          if (origValue && isTranslation) {
            const vt = trans.values.find(v => v.original === origValue)
            if (vt) out[valueCol] = vt.translated
          }
        }

        // Build SKU from translated values (after translations applied above)
        if (clientSkuStructure && skuCsvCol) {
          const builtSku = buildVariantSku(clientSkuStructure, result.title, out, result.option_translations, headers)
          if (builtSku) out[skuCsvCol] = builtSku
        }
      }

    } else if (!isShopify) {
      // Add empty new columns for non-optimized rows
      if (!headers.includes(seoTitleCol)) out[seoTitleCol] = ''
      if (!headers.includes(seoDescCol))  out[seoDescCol]  = ''
      if (imageEnabled && !headers.includes(imgAltCol)) {
        out[imgAltCol]                   = ''
        out['Image Filename Suggestion'] = ''
        out['Image Title']               = ''
      }
    }

    if (hasPartialFail) {
      out['Optimization Status'] = result ? 'optimized' : 'failed'
    }

    return out
  })

  // 13b. Apply client-level pricing rules (if configured)
  if (priceCol) {
    const { data: pricingProfile } = await supabase
      .from('client_profiles')
      .select('max_discount, competitor_price_diff, price_ending, pricing_basis')
      .eq('client_id', String(upload.client_id))
      .maybeSingle()

    if (pricingProfile?.pricing_basis && pricingProfile.pricing_basis !== 'manual') {
      const pricingRules: ProductPricingRules = {
        maxDiscount:        (pricingProfile.max_discount         as number | null) ?? null,
        competitorPriceDiff:(pricingProfile.competitor_price_diff as number | null) ?? null,
        priceEnding:        (pricingProfile.price_ending          as string | null) ?? null,
        pricingBasis:       (pricingProfile.pricing_basis         as string | null) ?? null,
      }
      let pricingApplied = 0
      for (let i = 0; i < outputRows.length; i++) {
        const updated = applyPricingToRow(outputRows[i], priceCol, compareAtCol ?? '', pricingRules)
        if (updated[priceCol] !== outputRows[i][priceCol]) pricingApplied++
        outputRows[i] = updated
      }
      console.log(`[process-upload] pricing rules applied to ${pricingApplied}/${outputRows.length} rows (basis=${pricingProfile.pricing_basis})`)
    }
  }

  // 14. Serialize output file
  const isXLSX = upload.file_type === 'xlsx'
  let outputBuf: Buffer
  let outputExt: string
  let contentType: string

  if (isXLSX) {
    const outWb  = XLSX.utils.book_new()
    const outWs  = XLSX.utils.json_to_sheet(outputRows)
    XLSX.utils.book_append_sheet(outWb, outWs, 'Optimized')
    const raw    = XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' }) as Buffer | Uint8Array
    outputBuf    = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    outputExt    = 'xlsx'
    contentType  = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  } else {
    outputBuf    = Buffer.from(rowsToCSV(outputRows), 'utf-8')
    outputExt    = 'csv'
    contentType  = 'text/csv'
  }

  // 15. Upload output to storage
  const outputPath = `${upload.va_id}/${upload.client_id}/${Date.now()}-output.${outputExt}`
  const { error: ulErr } = await supabase.storage
    .from('uploads')
    .upload(outputPath, outputBuf, { contentType, upsert: false })
  if (ulErr) throw new Error(`Storage upload failed: ${ulErr.message}`)

  // 16. Cost calculation
  const regularInput = totalInput - totalCached
  const costUSD =
    regularInput * COST_INPUT +
    totalCached  * COST_CACHED +
    totalOutput  * COST_OUTPUT

  // 17. Finalize upload record
  const processingTime  = Math.round((Date.now() - startTime) / 1000)
  const optimizedVariants = results.filter(Boolean).length
  const optimizedProducts = parentResults.filter(Boolean).length

  console.log(
    `[process-upload] done: ${optimizedProducts}/${parentIndices.length} products (${optimizedVariants}/${variantRows.length} variants) optimized, ` +
    `tokens in=${totalInput} cached=${totalCached} out=${totalOutput}, ` +
    `cost=$${costUSD.toFixed(6)}, time=${processingTime}s`
  )

  await supabase.from('uploads').update({
    status:                   'done',
    output_file_path:         outputPath,
    // Timestamps
    processing_completed_at:  new Date().toISOString(),
    processing_time_seconds:  processingTime,
    // Batch tracking
    batches_total:            batchCount,
    batches_completed:        batchesCompleted,
    batches_failed:           batchesFailed,
    // Product counts
    products_optimized:       optimizedProducts,
    products_failed:          parentIndices.length - optimizedProducts,
    // API tokens
    api_input_tokens:         totalInput,
    api_output_tokens:        totalOutput,
    api_cached_tokens:        totalCached,
    api_cost_usd:             Math.round(costUSD * 1_000_000) / 1_000_000,
    api_calls_count:          apiCallsCount,
  }).eq('id', uploadId)

  await logActivity({ action: 'upload_processing_completed', upload_id: uploadId, va_id: String(upload.va_id), source: 'system', details: `${optimizedProducts}/${parentIndices.length} products optimized in ${processingTime}s`, metadata: { products_optimized: optimizedProducts, products_failed: parentIndices.length - optimizedProducts, variants_total: variantRows.length, api_calls: apiCallsCount, cost_usd: Math.round(costUSD * 1e6) / 1e6, time_seconds: processingTime } })

  // 18. Notification
  const vaRate    = (client as unknown as Record<string, unknown>).va_rate_per_product as number | null | undefined
  const partialMsg = optimizedProducts < parentIndices.length
    ? ` ${parentIndices.length - optimizedProducts} product(s) could not be optimized and retain their original text.`
    : ''

  let notifTitle: string
  let notifMsg:   string

  if (vaRate != null && vaRate > 0) {
    const earned = optimizedProducts * vaRate
    notifTitle = `+$${earned.toFixed(2)} earned — ${String(client.store_name)}`
    notifMsg   = `${optimizedProducts} products optimized.${partialMsg} Ready to download.`
  } else {
    notifTitle = `${String(client.store_name)}: ${optimizedProducts} products optimized`
    notifMsg   = `${optimizedProducts < parentIndices.length ? `${parentIndices.length - optimizedProducts} product(s) could not be optimized and retain their original text. ` : ''}Ready to download.`
  }

  await supabase.from('notifications').insert({
    va_id:   upload.va_id,
    type:    'upload_done',
    title:   notifTitle,
    message: notifMsg,
    is_read: false,
  })

  // 19. Lock output if VA has outstanding/overdue invoice
  const { data: unpaidBill } = await supabase
    .from('billing')
    .select('id, total_amount, month')
    .eq('va_id', upload.va_id)
    .in('status', ['outstanding', 'overdue'])
    .order('generated_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (unpaidBill) {
    await supabase.from('uploads').update({
      output_locked:    true,
      output_locked_at: new Date().toISOString(),
    }).eq('id', uploadId)

    const lockAmount = `$${(unpaidBill.total_amount as number).toFixed(0)}`
    const lockRate   = (client as unknown as Record<string, unknown>).va_rate_per_product as number | null | undefined
    const lockEarned = lockRate != null && lockRate > 0 ? optimizedProducts * lockRate : null

    const lockTitle = lockEarned != null
      ? `File locked — pay ${lockAmount} to download your $${lockEarned.toFixed(2)} earnings`
      : `File locked — pay ${lockAmount} to download`
    const lockMsg = lockEarned != null
      ? `Your output file is ready but locked due to an unpaid HigherUp share of ${lockAmount}. You earned $${lockEarned.toFixed(2)} on this upload — pay to unlock and keep earning.`
      : `Your output file is ready but locked due to an unpaid invoice of ${lockAmount}. Pay to unlock your file.`

    await supabase.from('notifications').insert({
      va_id:   upload.va_id,
      type:    'output_locked',
      title:   lockTitle,
      message: lockMsg,
      is_read: false,
    })
  }
}

// ─── Failure helper ───────────────────────────────────────────────────────────

async function markFailed(uploadId: string, message: string): Promise<void> {
  await supabase.from('uploads')
    .update({
      status:                  'failed',
      error_message:           message,
      processing_completed_at: new Date().toISOString(),
    })
    .eq('id', uploadId)

  const { data: u } = await supabase
    .from('uploads').select('va_id, store_name').eq('id', uploadId).single()
  if (u) {
    await supabase.from('notifications').insert({
      va_id:   u.va_id,
      type:    'upload_failed',
      title:   'Processing failed',
      message,
      is_read: false,
    })
    await logActivity({ action: 'upload_processing_failed', upload_id: uploadId, va_id: String(u.va_id), source: 'system', severity: 'error', details: message })
  }
}

// ─── POST /api/process-upload ─────────────────────────────────────────────────

export async function POST(req: Request) {
  // Parse body
  let uploadId: string
  try {
    const body = await req.json()
    uploadId   = body.uploadId
    if (!uploadId) return Response.json({ error: 'Missing uploadId' }, { status: 400 })
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Load upload
  const { data: upload, error: fetchErr } = await supabase
    .from('uploads')
    .select('id, va_id, client_id, status, product_row_count')
    .eq('id', uploadId)
    .single()
  if (fetchErr || !upload) return Response.json({ error: 'Upload not found' }, { status: 404 })

  // ── Variant rate limit: max 50,000 variants per VA per day ───────────────
  const thisUploadVariants = upload.product_row_count ?? 0
  if (thisUploadVariants > MAX_DAILY_VARIANTS) {
    await markFailed(uploadId, 'This file exceeds the 50,000 product limit.')
    return Response.json({ error: 'File exceeds 50,000 product limit' }, { status: 400 })
  }

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const { data: todayUploads } = await supabase
    .from('uploads')
    .select('product_row_count')
    .eq('va_id', upload.va_id)
    .neq('id', uploadId)
    .gte('uploaded_at', dayStart.toISOString())
  const usedToday = (todayUploads ?? []).reduce((s, u) => s + ((u as { product_row_count?: number }).product_row_count ?? 0), 0)

  if (usedToday + thisUploadVariants > MAX_DAILY_VARIANTS) {
    const msg = `Daily product limit reached (${usedToday.toLocaleString()}/50,000). Try again tomorrow.`
    await markFailed(uploadId, msg)
    return Response.json({ error: msg }, { status: 429 })
  }

  // ── Queue: max 5 concurrent jobs ──────────────────────────────────────────
  const { count: activeCount } = await supabase
    .from('uploads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing')

  if ((activeCount ?? 0) >= MAX_CONCURRENT) {
    await supabase.from('uploads').update({ status: 'queued' }).eq('id', uploadId)
    return Response.json({ ok: true, status: 'queued' })
  }

  // ── Run pipeline ──────────────────────────────────────────────────────────
  try {
    await runPipeline(uploadId)
    return Response.json({ ok: true, status: 'done' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Processing failed'
    console.error('[process-upload] fatal error:', msg)
    await markFailed(uploadId, msg)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
