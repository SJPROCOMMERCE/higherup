'use client'

import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useVA } from '@/context/va-context'
import { supabase, type Client, type Upload } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import type { PreCheckResult } from '@/app/api/pre-check-instructions/route'
import { getTiers, getTierSync, DEFAULT_TIERS, type Tier } from '@/lib/pricing'
import { getMonthStart } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { downloadOutput } from '@/lib/download'
import { TemplateSelector, type TemplateInfo, type TemplateSelectorData } from '@/components/dashboard/TemplateSelector'

// ManualEntry is only shown when the user explicitly clicks "enter manually"
// — load it lazily so it never bloats the initial page compile
const ManualEntry = dynamic(
  () => import('./ManualEntry').then(m => ({ default: m.ManualEntry })),
  { ssr: false, loading: () => null },
)

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  sec:    '#999999',
  ter:    '#CCCCCC',
  ghost:  '#DDDDDD',
  div:    '#F0F0F0',
  green:  '#10B981',
  orange: '#F59E0B',
  red:    '#EF4444',
  bg:     '#FFFFFF',
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// ─── Types ────────────────────────────────────────────────────────────────────

type ParseResult = {
  rows: number          // variant count (total rows)
  productCount: number  // unique product count (by Handle or Title)
  headers: string[]
  sheetNames: string[]
  selectedSheet: string
  storeNameStatus: 'match' | 'mismatch' | 'not_found'
  storeNameInFile: string | null
  fileType: 'csv' | 'xlsx'
  previewData: string[][]
  isShopify: boolean
}

type SheetSource = { url: string; label: string; csvText: string }

// ─── Column mapping config ────────────────────────────────────────────────────

// ─── Shopify detection ────────────────────────────────────────────────────────

const SHOPIFY_DETECT = ['handle', 'title', 'body (html)', 'vendor']

// UI-format mapping for Shopify exports (originalCol → fieldType)
const SHOPIFY_UI_MAPPING: Record<string, string> = {
  'Title':         'title',
  'Body (HTML)':   'description',
  'Tags':          'tags',
  'Vendor':        'vendor',
  'Type':          'type',
  'Variant Price': 'price',
  'Variant SKU':   'sku',
  'Image Src':     'image',
}

function detectShopify(headers: string[]): boolean {
  const lower = new Set(headers.map(h => h.toLowerCase()))
  return SHOPIFY_DETECT.every(c => lower.has(c))
}

function shopifyUIMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const h of headers) {
    if (SHOPIFY_UI_MAPPING[h]) mapping[h] = SHOPIFY_UI_MAPPING[h]
  }
  return mapping
}

// ─── Field patterns (generic files) ──────────────────────────────────────────

const FIELD_PATTERNS: Record<string, string[]> = {
  title:       ['title', 'product title', 'name', 'product name', 'product_title', 'item name'],
  description: ['description', 'body', 'body_html', 'body (html)', 'product description', 'desc'],
  price:       ['price', 'variant price', 'selling price', 'cost'],
  sku:         ['sku', 'variant sku', 'product sku', 'item sku'],
  vendor:      ['vendor', 'brand', 'shop', 'manufacturer'],
  tags:        ['tags', 'product tags', 'keywords'],
  type:        ['type', 'product type', 'category'],
  image:       ['image', 'image src', 'images', 'photo', 'picture'],
}

const FIELD_OPTIONS = [
  { value: '',            label: '— not mapped —' },
  { value: 'title',       label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'price',       label: 'Price' },
  { value: 'sku',         label: 'SKU' },
  { value: 'vendor',      label: 'Vendor' },
  { value: 'tags',        label: 'Tags' },
  { value: 'type',        label: 'Type' },
  { value: 'image',       label: 'Image' },
  { value: 'ignore',      label: 'Ignore' },
]

const FIELD_LABELS: Record<string, string> = {
  title: 'Title', description: 'Description', price: 'Price',
  sku: 'SKU', vendor: 'Vendor', tags: 'Tags', type: 'Type', image: 'Image',
}

const ALL_FIELDS = ['title', 'description', 'price', 'sku', 'vendor', 'tags', 'type', 'image']

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function autoDetectMapping(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  const used = new Set<string>()
  for (const header of headers) {
    const norm = header.toLowerCase().trim()
    for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (used.has(field)) continue
      if (patterns.includes(norm)) {
        result[header] = field
        used.add(field)
        break
      }
    }
  }
  return result
}

// DB format: { fieldType: originalColName } → UI format: { originalColName: fieldType }
// Returns null if title+description can't be found in current headers
function dbToUIMapping(
  db: Record<string, string>,
  headers: string[],
): Record<string, string> | null {
  const titleCol = db.title
  const descCol  = db.description
  if (!titleCol || !descCol || !headers.includes(titleCol) || !headers.includes(descCol)) {
    return null
  }
  const result: Record<string, string> = {}
  for (const [fieldType, originalCol] of Object.entries(db)) {
    if (originalCol && headers.includes(originalCol)) {
      result[originalCol] = fieldType
    }
  }
  return result
}

// UI format → DB format for storage
function uiToDBMapping(ui: Record<string, string>): Record<string, string | null> {
  const result: Record<string, string | null> = {
    title: null, description: null, price: null, sku: null,
    vendor: null, tags: null, type: null, image: null,
  }
  for (const [originalCol, fieldType] of Object.entries(ui)) {
    if (fieldType && fieldType !== 'ignore' && fieldType in result) {
      result[fieldType] = originalCol
    }
  }
  return result
}

// ─── Other helpers ────────────────────────────────────────────────────────────

function findStoreNameCol(headers: string[]): number {
  const keys = ['store_name', 'shop_name', 'storename', 'shopname', 'store', 'shop']
  return headers.findIndex(h => keys.includes(String(h).toLowerCase().replace(/[\s-]/g, '_')))
}

function computeStoreNameStatus(
  storeNameInFile: string | null,
  client: Client | null,
): ParseResult['storeNameStatus'] {
  if (!storeNameInFile || !client) return 'not_found'
  const n = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
  return n(storeNameInFile) === n(client.store_name) ? 'match' : 'mismatch'
}

// Parse a workbook into ParseResult data (shared for file+sheet sources)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromWorkbook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  XLSX: any,
  wb: unknown,
  fileType: 'csv' | 'xlsx',
  client: Client | null,
  sheetOverride?: string,
): { ok: true; data: Omit<ParseResult, 'storeNameStatus' | 'storeNameInFile'> & { storeNameInFile: string | null } } | { ok: false; error: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wbAny         = wb as any
  const sheetNames    = fileType === 'xlsx' ? wbAny.SheetNames : []
  const selectedSheet = sheetOverride ?? wbAny.SheetNames[0]
  const ws            = wbAny.Sheets[selectedSheet]
  if (!ws) return { ok: false, error: 'Sheet not found.' }

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
  if (raw.length < 2) return { ok: false, error: 'Sheet has no data rows.' }

  // Deduplicate/sanitise headers so they can be used as React keys
  const rawHeaders = raw[0].map(String)
  const seen = new Map<string, number>()
  const headers = rawHeaders.map(h => {
    const key = h.trim() || 'Column'
    const count = (seen.get(key) ?? 0)
    seen.set(key, count + 1)
    return count === 0 ? key : `${key}_${count}`
  })
  const dataRows  = raw.slice(1).filter(r => r.some(c => String(c).trim()))
  if (dataRows.length === 0) return { ok: false, error: 'File has no product rows.' }

  const ci              = findStoreNameCol(headers)
  const storeNameInFile = ci >= 0 ? String(dataRows[0][ci] ?? '') || null : null
  const previewData     = dataRows.slice(0, 3).map(r => r.map(String))

  // Count unique products by Handle → Title → fallback: every row is a product
  const handleIdx = headers.findIndex(h => h.toLowerCase() === 'handle')
  const titleIdx  = headers.findIndex(h =>
    ['title', 'product title', 'name', 'product name'].includes(h.toLowerCase())
  )
  let productCount: number
  if (handleIdx >= 0) {
    const unique = new Set(dataRows.map(r => String(r[handleIdx] ?? '').trim()).filter(Boolean))
    productCount = unique.size || dataRows.length
  } else if (titleIdx >= 0) {
    const unique = new Set(dataRows.map(r => String(r[titleIdx] ?? '').trim()).filter(Boolean))
    productCount = unique.size || dataRows.length
  } else {
    productCount = dataRows.length
  }

  const isShopify = detectShopify(headers)

  return {
    ok: true,
    data: {
      rows: dataRows.length, productCount, headers, sheetNames, selectedSheet,
      fileType, previewData, storeNameInFile, isShopify,
    },
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
      color: T.bg, background: T.black, padding: '2px 5px', flexShrink: 0,
    }}>
      {label}
    </div>
  )
}

type DropdownOption = { value: string; label: string }

function ClientDropdown({
  value, options, placeholder, onChange, error, loading,
}: {
  value: string; options: DropdownOption[]; placeholder: string
  onChange: (v: string) => void; error?: string; loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])
  const selected = options.find(o => o.value === value)
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: error ? T.red : T.ter, marginBottom: 6 }}>
        Client
      </div>
      <button type="button" onClick={() => !loading && setOpen(o => !o)} style={{
        width: '100%', textAlign: 'left', background: 'none', border: 'none',
        borderBottom: `1px solid ${error ? T.red : '#EEEEEE'}`,
        padding: '4px 0 8px', cursor: loading ? 'default' : 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 14, color: selected ? T.black : T.ghost,
        fontFamily: 'inherit', transition: 'border-color 0.15s',
      }}
        onFocus={e => { if (!error) e.currentTarget.style.borderBottomColor = T.black }}
        onBlur={e => e.currentTarget.style.borderBottomColor = error ? T.red : '#EEEEEE'}
      >
        <span>{selected ? selected.label : placeholder}</span>
        {!loading && <span style={{ fontSize: 10, color: T.ter }}>▾</span>}
      </button>
      {open && (
        <div className="hu-dropdown-list" style={{ top: '100%', left: 0, right: 0, maxHeight: 240, overflowY: 'auto', background: '#FFFFFF', backgroundColor: '#FFFFFF' }}>
          {options.length === 0
            ? <div style={{ padding: '12px 14px', fontSize: 13, color: T.ter }}>No approved clients</div>
            : options.map(opt => (
              <button key={opt.value} type="button"
                className={`hu-dropdown-option${value === opt.value ? ' is-selected' : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: T.black, border: 'none', cursor: 'pointer', display: 'block', fontFamily: 'inherit' }}
              >{opt.label}</button>
            ))}
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{error}</div>}
    </div>
  )
}

function WaveDots() {
  const dot: React.CSSProperties = { width: 4, height: 4, borderRadius: '50%', background: T.ter, display: 'inline-block' }
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <span className="wave-1" style={dot} />
      <span className="wave-2" style={dot} />
      <span className="wave-3" style={dot} />
    </div>
  )
}

// ─── Column Mapping components ────────────────────────────────────────────────

function MappingRow({ col, value, onChange }: { col: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '10px 0',
      borderBottom: `1px solid #FAFAFA`,
    }}>
      <div style={{ flex: '0 0 50%', fontSize: 13, color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {col}
      </div>
      <div style={{ flex: '0 0 50%' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', fontSize: 12,
            color: value ? T.black : T.ghost,
            background: T.bg, border: '1px solid #EEEEEE',
            borderRadius: 4, padding: '5px 8px',
            fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = T.black}
          onBlur={e => e.currentTarget.style.borderColor = '#EEEEEE'}
        >
          {FIELD_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function MappingSummary({ mapping }: { mapping: Record<string, string> }) {
  const mapped = new Set(Object.values(mapping).filter(v => v && v !== 'ignore'))
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 16 }}>
      {ALL_FIELDS.map(field => {
        const yes = mapped.has(field)
        return (
          <span key={field} style={{ fontSize: 12, color: yes ? T.black : T.ghost }}>
            {FIELD_LABELS[field]} {yes ? '✓' : '✗'}
          </span>
        )
      })}
    </div>
  )
}

function MappingPreview({
  headers, mapping, previewData,
}: { headers: string[]; mapping: Record<string, string>; previewData: string[][] }) {
  const cols = headers
    .filter(h => mapping[h] && mapping[h] !== 'ignore' && mapping[h] !== '')
    .map(h => ({ original: h, field: mapping[h], label: FIELD_LABELS[mapping[h]] ?? mapping[h] }))
  if (cols.length === 0 || previewData.length === 0) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 12 }}>
        Preview
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.original} style={{
                  fontSize: 12, fontWeight: 500, color: T.black,
                  textAlign: 'left', paddingBottom: 8,
                  borderBottom: `1px solid ${T.div}`,
                  paddingRight: 16, whiteSpace: 'nowrap',
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, ri) => (
              <tr key={ri}>
                {cols.map(c => {
                  const idx     = headers.indexOf(c.original)
                  const raw     = idx >= 0 ? String(row[idx] ?? '') : ''
                  const display = raw.length > 40 ? raw.slice(0, 40) + '…' : raw
                  return (
                    <td key={c.original} style={{
                      fontSize: 12, color: T.sec,
                      padding: '6px 16px 6px 0',
                      borderBottom: `1px solid #FAFAFA`,
                      verticalAlign: 'top',
                    }}>
                      {display || <span style={{ color: T.ghost }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Upload Form ──────────────────────────────────────────────────────────────

function UploadForm() {
  const { currentVA: va } = useVA()
  const searchParams       = useSearchParams()
  const prefillId          = searchParams.get('client')

  // Pricing tiers
  const [pricingTiers, setPricingTiers] = useState<Tier[]>(DEFAULT_TIERS)

  // Remote data
  const [clients,        setClients]        = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [monthUploads,   setMonthUploads]   = useState<Upload[]>([])

  // Form state
  const [clientId,    setClientId]    = useState('')
  const [file,        setFile]        = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parsing,     setParsing]     = useState(false)
  const [fileError,   setFileError]   = useState<string | null>(null)
  const [dragOver,    setDragOver]    = useState(false)
  const [instructions, setInstructions] = useState('')
  const [attempted,   setAttempted]   = useState(false)

  // File mode (file upload vs Google Sheets)
  const [fileMode,     setFileMode]     = useState<'file' | 'sheet' | 'manual'>('file')
  const [sheetUrl,     setSheetUrl]     = useState('')
  const [sheetLoading, setSheetLoading] = useState(false)
  const [sheetError,   setSheetError]   = useState<string | null>(null)
  const [sheetSource,  setSheetSource]  = useState<SheetSource | null>(null)

  // Column mapping
  const [columnMapping,   setColumnMapping]   = useState<Record<string, string>>({})
  const [mappingConfirmed, setMappingConfirmed] = useState(false)
  const [usingRemembered,  setUsingRemembered]  = useState(false)
  const [showFullMapping,  setShowFullMapping]  = useState(true)
  // undefined = still loading, null = none found, object = found
  const [rememberedMapping, setRememberedMapping] = useState<Record<string, string> | null | undefined>(undefined)

  // Submit state
  const [uploading,   setUploading]   = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success,     setSuccess]     = useState(false)
  const [successMeta, setSuccessMeta] = useState<{ rows: number; productCount: number; storeName: string; fileName: string } | null>(null)
  const [monthEarnings, setMonthEarnings] = useState<{
    earned: number; share: number; profit: number
    totalEarned: number; totalShare: number; totalProfit: number
    totalVariants: number; totalClients: number; clientUploadCount: number
  } | null>(null)

  // Pre-check state
  type PreCheckPhase = 'idle' | 'checking' | 'medium' | 'blocked'
  const [preCheckPhase,      setPreCheckPhase]      = useState<PreCheckPhase>('idle')
  const [preCheckResult,     setPreCheckResult]     = useState<PreCheckResult | null>(null)
  const [preCheckOutCols,    setPreCheckOutCols]    = useState<string[] | null>(null)
  const [onHoldSent,         setOnHoldSent]         = useState(false)

  // Template selector
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateData, setTemplateData] = useState<TemplateSelectorData | null>(null)

  // Live status
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null)
  const [activeUpload,   setActiveUpload]   = useState<Upload | null>(null)

  const fileInputRef  = useRef<HTMLInputElement>(null)
  const workbookRef   = useRef<unknown>(null)
  const sheetUrlRef   = useRef<HTMLInputElement>(null)

  const selectedClient = clients.find(c => c.id === clientId) ?? null

  // ─── Load templates when client changes ────────────────────────────────────
  useEffect(() => {
    if (!clientId) { setTemplateData(null); setSelectedTemplateId(''); return }

    async function loadTemplates() {
      // 1. Assigned templates from client_prompts (many-to-many)
      const { data: cpRows } = await supabase
        .from('client_prompts')
        .select('prompt_id, prompts(id, name, niche, language, is_default)')
        .eq('client_id', clientId)
      const assignedTemplates: TemplateInfo[] = (cpRows ?? [])
        .map(r => r.prompts as unknown as TemplateInfo)
        .filter(Boolean)
      const assignedIds = new Set(assignedTemplates.map(t => t.id))

      // 2. Client info for matching
      const { data: client } = await supabase
        .from('clients')
        .select('niche, language')
        .eq('id', clientId)
        .maybeSingle()

      // 3. Custom templates from applied prompt_requests
      const { data: applied } = await supabase
        .from('prompt_requests')
        .select('linked_prompt_id')
        .eq('client_id', clientId)
        .eq('status', 'applied')
        .not('linked_prompt_id', 'is', null)
      const customIds = (applied ?? []).map(r => r.linked_prompt_id).filter(Boolean) as string[]

      let customTemplates: TemplateInfo[] = []
      if (customIds.length > 0) {
        const { data } = await supabase
          .from('prompts')
          .select('id, name, niche, language, is_default')
          .in('id', customIds)
          .eq('is_active', true)
        customTemplates = ((data ?? []) as TemplateInfo[]).filter(t => !assignedIds.has(t.id))
      }
      const customIdSet = new Set(customTemplates.map(t => t.id))

      // 4. General HigherUp templates (relevant, not already in above)
      const { data: all } = await supabase
        .from('prompts')
        .select('id, name, niche, language, is_default')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name')
      const generalTemplates = ((all ?? []) as TemplateInfo[]).filter(t => {
        if (assignedIds.has(t.id) || customIdSet.has(t.id)) return false
        return (
          t.niche    === client?.niche    ||
          t.language === client?.language ||
          t.niche    === 'General'        ||
          t.is_default
        )
      })

      const data: TemplateSelectorData = { assignedTemplates, customTemplates, generalTemplates }
      setTemplateData(data)

      // Pre-select: first assigned > first custom > first general
      if (assignedTemplates.length > 0) {
        setSelectedTemplateId(assignedTemplates[0].id)
      } else if (customTemplates.length > 0) {
        setSelectedTemplateId(customTemplates[0].id)
      } else if (generalTemplates.length > 0) {
        const def = generalTemplates.find(t => t.is_default) ?? generalTemplates[0]
        setSelectedTemplateId(def.id)
      } else {
        setSelectedTemplateId('')
      }
    }

    loadTemplates()
  }, [clientId])

  // ─── Load pricing tiers ────────────────────────────────────────────────────
  useEffect(() => { getTiers().then(setPricingTiers) }, [])

  // ─── Load clients ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!va) return
    supabase.from('clients').select('*')
      .eq('va_id', va.id).eq('approval_status', 'approved').eq('is_active', true)
      .order('store_name')
      .then(({ data }) => {
        const list = data ?? []
        setClients(list)
        setClientsLoading(false)
        if (prefillId) {
          const match = list.find((c: Client) => c.id === prefillId)
          if (match) setClientId(match.id)
        }
      })
  }, [va, prefillId])

  // ─── Load remembered column mapping when client changes ────────────────────
  useEffect(() => {
    if (!va || !clientId) { setRememberedMapping(null); return }
    setRememberedMapping(undefined)
    supabase.from('uploads').select('column_mapping')
      .eq('va_id', va.id).eq('client_id', clientId)
      .not('column_mapping', 'is', null)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data[0]?.column_mapping) {
          const raw = data[0].column_mapping as Record<string, string | null>
          const cleaned: Record<string, string> = {}
          for (const [k, v] of Object.entries(raw)) { if (v) cleaned[k] = v }
          setRememberedMapping(Object.keys(cleaned).length ? cleaned : null)
        } else {
          setRememberedMapping(null)
        }
      })
  }, [va, clientId])

  // ─── Month uploads for tier calc ───────────────────────────────────────────
  useEffect(() => {
    if (!va || !clientId) { setMonthUploads([]); return }
    const since = getMonthStart().toISOString()
    supabase.from('uploads').select('*')
      .eq('va_id', va.id).eq('client_id', clientId).eq('status', 'done')
      .gte('uploaded_at', since)
      .then(({ data }) => setMonthUploads(data ?? []))
  }, [va, clientId])

  // ─── Re-verify store name when client changes ──────────────────────────────
  useEffect(() => {
    if (!parseResult?.storeNameInFile) return
    const newStatus = computeStoreNameStatus(parseResult.storeNameInFile, selectedClient)
    setParseResult(prev => prev ? { ...prev, storeNameStatus: newStatus } : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // ─── Apply mapping when parseResult + rememberedMapping both arrive ────────
  useEffect(() => {
    if (!parseResult || rememberedMapping === undefined) return

    // Shopify: auto-apply hardcoded mapping and skip the mapping UI
    if (parseResult.isShopify) {
      setColumnMapping(shopifyUIMapping(parseResult.headers))
      setUsingRemembered(false)
      setShowFullMapping(false)
      setMappingConfirmed(true)
      return
    }

    if (rememberedMapping) {
      const uiMap = dbToUIMapping(rememberedMapping, parseResult.headers)
      if (uiMap) {
        setColumnMapping(uiMap)
        setUsingRemembered(true)
        setShowFullMapping(false)
        setMappingConfirmed(false)
        return
      }
    }
    setColumnMapping(autoDetectMapping(parseResult.headers))
    setUsingRemembered(false)
    setShowFullMapping(true)
    setMappingConfirmed(false)
  }, [parseResult, rememberedMapping])

  // ─── Realtime subscription for live status ─────────────────────────────────
  useEffect(() => {
    if (!activeUploadId) return
    const ch = supabase.channel(`upload-status-${activeUploadId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'uploads', filter: `id=eq.${activeUploadId}` },
        payload => setActiveUpload(payload.new as Upload))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeUploadId])

  // ─── Worker polling: nudge the queue while this upload is queued ───────────
  // Calls /api/process-worker every 5s until status leaves 'queued'
  useEffect(() => {
    if (activeUpload?.status !== 'queued') return
    const id = setInterval(() => {
      fetch('/api/process-worker').catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [activeUpload?.status])

  // ─── Load monthly earnings when upload is submitted ──────────────────────
  useEffect(() => {
    if (!success || !activeUpload || !va) return
    const monthStart = getMonthStart().toISOString()
    const thisVars   = activeUpload.product_row_count ?? 0

    supabase
      .from('uploads')
      .select('client_id, product_row_count, clients(va_rate_per_product)')
      .eq('va_id', va.id)
      .in('status', ['done', 'queued', 'processing'])
      .gte('uploaded_at', monthStart)
      .then(({ data }) => {
        type Row = {
          client_id: string
          product_row_count: number | null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          clients: any
        }
        const rows = (data ?? []) as unknown as Row[]

        const clientVars = new Map<string, number>()
        let totalEarned        = 0
        let clientUploadCount  = 0

        for (const r of rows) {
          const vars = r.product_row_count ?? 0
          const rate = r.clients?.va_rate_per_product ?? null
          clientVars.set(r.client_id, (clientVars.get(r.client_id) ?? 0) + vars)
          if (rate != null) totalEarned += vars * rate
          if (r.client_id === activeUpload.client_id) clientUploadCount++
        }

        let totalShare = 0
        for (const [, vars] of clientVars) {
          totalShare += getTierSync(pricingTiers, vars).amount
        }

        const clientTotal   = clientVars.get(activeUpload.client_id) ?? thisVars
        const tierForClient = getTierSync(pricingTiers, clientTotal)
        const share         = clientTotal > 0 ? (tierForClient.amount / clientTotal) * thisVars : 0
        const rate          = selectedClient?.va_rate_per_product ?? null
        const earned        = rate != null ? thisVars * rate : 0

        setMonthEarnings({
          earned:        parseFloat(earned.toFixed(2)),
          share:         parseFloat(share.toFixed(2)),
          profit:        parseFloat((earned - share).toFixed(2)),
          totalEarned:   parseFloat(totalEarned.toFixed(2)),
          totalShare:    parseFloat(totalShare.toFixed(2)),
          totalProfit:   parseFloat((totalEarned - totalShare).toFixed(2)),
          totalVariants: [...clientVars.values()].reduce((s, v) => s + v, 0),
          totalClients:  clientVars.size,
          clientUploadCount,
        })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, activeUpload?.id, activeUpload?.status, selectedClient?.va_rate_per_product])

  // ─── Process workbook (shared for file + sheet) ────────────────────────────
  const applyWorkbook = useCallback((
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    XLSX: any,
    wb: unknown,
    fileType: 'csv' | 'xlsx',
    client: Client | null,
    sheetOverride?: string,
  ) => {
    const result = extractFromWorkbook(XLSX, wb, fileType, client, sheetOverride)
    if (!result.ok) { setFileError(result.error); setParsing(false); return }
    const { storeNameInFile, ...rest } = result.data
    setParseResult({
      ...rest,
      storeNameStatus: computeStoreNameStatus(storeNameInFile, client),
      storeNameInFile,
    })
    setParsing(false)
  }, [])

  // ─── Parse file ────────────────────────────────────────────────────────────
  const parseFile = useCallback(async (f: File, client: Client | null, sheetOverride?: string) => {
    setFileError(null); setParsing(true); setParseResult(null)
    workbookRef.current = null
    const isCSV  = f.name.toLowerCase().endsWith('.csv')
    const isXLSX = f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')
    if (!isCSV && !isXLSX) { setFileError('Only CSV and XLSX files are supported.'); setParsing(false); return }
    if (f.size > MAX_FILE_SIZE) { setFileError('File is too large. Maximum size is 10 MB.'); setParsing(false); return }
    try {
      const XLSX = await import('xlsx')
      if (isCSV) {
        const text = await f.text()
        const wb   = XLSX.read(text, { type: 'string' })
        applyWorkbook(XLSX, wb, 'csv', client, sheetOverride)
      } else {
        const buf = await f.arrayBuffer()
        const wb  = XLSX.read(buf, { type: 'array' })
        workbookRef.current = wb
        applyWorkbook(XLSX, wb, 'xlsx', client, sheetOverride)
      }
    } catch {
      setFileError('Could not read file. Make sure it is a valid CSV or XLSX.')
      setParsing(false)
    }
  }, [applyWorkbook])

  // ─── Switch sheet (multi-sheet XLSX) ───────────────────────────────────────
  const switchSheet = useCallback(async (sheetName: string) => {
    const wb = workbookRef.current
    if (!wb) return
    setFileError(null)
    const XLSX = await import('xlsx')
    applyWorkbook(XLSX, wb, 'xlsx', selectedClient, sheetName)
  }, [selectedClient, applyWorkbook])

  // ─── Handle file drop/select ───────────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    setFile(f); setSheetSource(null); setParseResult(null); setFileError(null)
    parseFile(f, selectedClient)
  }, [selectedClient, parseFile])

  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }, [])
  const onDragLeave = useCallback(() => setDragOver(false), [])
  const onDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  // ─── Load Google Sheet ─────────────────────────────────────────────────────
  async function handleLoadSheet() {
    const url = sheetUrl.trim()
    if (!url.includes('docs.google.com/spreadsheets')) {
      setSheetError("That doesn't look like a Google Sheets URL.")
      return
    }
    setSheetLoading(true); setSheetError(null); setParseResult(null)
    setFile(null); workbookRef.current = null
    try {
      const resp = await fetch(`/api/fetch-sheet?url=${encodeURIComponent(url)}`)
      const data = await resp.json()
      if (!resp.ok || data.error) {
        setSheetError("Couldn't load this sheet. Make sure it's set to 'Anyone with the link can view'.")
        setSheetLoading(false); return
      }
      const csvText: string = data.csv
      const XLSX = await import('xlsx')
      const wb   = XLSX.read(csvText, { type: 'string' })
      const label = `Google Sheet`
      setSheetSource({ url, label, csvText })
      applyWorkbook(XLSX, wb, 'csv', selectedClient)
    } catch {
      setSheetError("Couldn't load this sheet. Make sure it's set to 'Anyone with the link can view'.")
    }
    setSheetLoading(false)
  }

  // ─── Manual entry processed ────────────────────────────────────────────
  function handleManualProcessed(
    newUpload: Upload,
    meta: { rows: number; productCount: number; storeName: string; fileName: string },
  ) {
    setActiveUpload(newUpload)
    setActiveUploadId(newUpload.id)
    setSuccessMeta(meta)
    setSuccess(true)
    fetch('/api/process-upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId: newUpload.id }),
    }).catch(() => {})
  }

  // ─── Reset form (keeps clientId) ──────────────────────────────────────────
  function handleReset() {
    setSuccess(false); setSuccessMeta(null)
    setActiveUpload(null); setActiveUploadId(null)
    setFile(null); setSheetSource(null); setSheetUrl(''); setSheetError(null)
    setFileMode('file'); setParseResult(null); setFileError(null)
    setColumnMapping({}); setMappingConfirmed(false)
    setUsingRemembered(false); setShowFullMapping(true)
    setInstructions(''); setAttempted(false); setSubmitError(null)
  }

  // ─── Submit: entry point (runs pre-check when needed) ─────────────────────
  async function handleSubmit() {
    setAttempted(true)
    const hasSource = file !== null || sheetSource !== null
    if (!clientId || !hasSource || !parseResult || parsing || !mappingConfirmed) return

    const trimmed = instructions.trim()
    if (trimmed.length >= 5) {
      setPreCheckPhase('checking')
      setPreCheckResult(null)
      try {
        const res = await fetch('/api/pre-check-instructions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructions: trimmed }),
        })
        const data = await res.json() as PreCheckResult
        setPreCheckResult(data)
        setPreCheckOutCols(data.output_columns ?? null)

        if (!data.can_handle) {
          setPreCheckPhase('blocked')
          return
        }
        if (data.confidence === 'medium') {
          setPreCheckPhase('medium')
          return
        }
        // high confidence — proceed immediately with adjusted instruction
        setPreCheckPhase('idle')
        await doSubmit(data.adjusted_instruction ?? trimmed, false, data.output_columns ?? null, data)
        return
      } catch {
        // network error → treat as high confidence, proceed
        setPreCheckPhase('idle')
      }
    }

    await doSubmit(trimmed || null)
  }

  // ─── Submit: actual upload logic ───────────────────────────────────────────
  async function doSubmit(
    effectiveInstructions: string | null,
    onHold = false,
    outputColumns: string[] | null = null,
    preCheckData: PreCheckResult | null = null,
  ) {
    if (!parseResult) return
    setUploading(true); setSubmitError(null); setPreCheckPhase('idle')
    try {
      // ── Product rate limit: max 50,000 unique products per VA per day ────────
      const MAX_DAILY_PRODUCTS = 50_000
      if (parseResult.productCount > MAX_DAILY_PRODUCTS)
        throw new Error(`This file exceeds the 50,000 product limit.`)

      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
      const { data: todayUploads } = await supabase
        .from('uploads')
        .select('product_row_count')
        .eq('va_id', va!.id)
        .gte('uploaded_at', dayStart.toISOString())
      const usedToday = (todayUploads ?? []).reduce((s, u) => s + (u.product_row_count ?? 0), 0)
      if (usedToday + parseResult.productCount > MAX_DAILY_PRODUCTS)
        throw new Error(`Daily product limit reached (${usedToday.toLocaleString()}/50,000). Try again tomorrow.`)

      const ts = Date.now()
      let uploadBlob: File | Blob
      let fileName: string
      let fileType: 'csv' | 'xlsx' = parseResult.fileType

      if (sheetSource) {
        uploadBlob = new Blob([sheetSource.csvText], { type: 'text/csv' })
        const idMatch = sheetSource.url.match(/\/d\/([a-zA-Z0-9-_]+)/)
        fileName  = idMatch ? `gsheet-${idMatch[1]}.csv` : `gsheet-${ts}.csv`
        fileType  = 'csv'
      } else {
        uploadBlob = file!
        fileName   = file!.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      }

      const path = `${va!.id}/${clientId}/${ts}_${fileName}`

      const { error: storageErr } = await supabase.storage.from('uploads').upload(path, uploadBlob, {
        contentType: sheetSource ? 'text/csv' : (file!.type || 'application/octet-stream'),
        upsert: false,
      })
      if (storageErr) throw new Error(storageErr.message)

      const uploadStatus = onHold ? 'on_hold' : 'queued'

      const { data: newUpload, error: dbErr } = await supabase.from('uploads').insert({
        va_id:                va!.id,
        client_id:            clientId,
        store_name:           selectedClient!.store_name,
        file_type:            fileType,
        // File metadata
        original_filename:    sheetSource ? sheetSource.label : file!.name,
        file_size_bytes:      sheetSource ? null : file!.size,
        detected_as_shopify:  parseResult.isShopify,
        sheet_name:           parseResult.selectedSheet || null,
        // Product counts — product_row_count = unique products (by Handle/Title)
        product_row_count:    parseResult.productCount,
        unique_product_count: parseResult.productCount,
        // Instructions & pre-check
        special_instructions: instructions.trim() || null,
        adjusted_instruction: preCheckData?.adjusted_instruction ?? null,
        pre_check_result:     preCheckData ?? null,
        output_columns:       outputColumns ?? null,
        // Template
        prompt_id:            selectedTemplateId || null,
        // Status
        status:               uploadStatus,
        input_file_path:      path,
        // Column mapping (without embedded __output_columns — now stored separately)
        column_mapping:       uiToDBMapping(columnMapping),
      }).select().single()

      if (dbErr || !newUpload) throw new Error(dbErr?.message ?? 'Insert failed')

      void logActivity({
        action: 'upload_started',
        va_id: va!.id,
        upload_id: newUpload.id,
        client_id: clientId,
        source: 'va',
        details: `Upload started for client ${selectedClient?.store_name ?? clientId}`,
      })

      // On hold: notify admin, show hold message
      if (onHold) {
        await supabase.from('notifications').insert({
          va_id:   va!.id,
          type:    'upload_on_hold',
          title:   `Upload on hold for ${selectedClient!.store_name}`,
          message: `VA instructions: "${effectiveInstructions}". Reason: ${preCheckResult?.reason ?? 'Outside capabilities.'}`,
          read:    false,
        })
        setOnHoldSent(true)
        setUploading(false)
        return
      }

      setActiveUpload(newUpload as Upload)
      setActiveUploadId(newUpload.id)
      setSuccessMeta({
        rows:         parseResult.rows,
        productCount: parseResult.productCount,
        storeName:    selectedClient!.store_name,
        fileName:     sheetSource ? sheetSource.label : file!.name,
      })
      setSuccess(true)

      fetch('/api/process-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: newUpload.id }),
      }).catch(() => {})

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    }
    setUploading(false)
  }

  // ─── Tier math (variant-based) ─────────────────────────────────────────────
  const monthCount  = monthUploads.reduce((s, u) => s + (u.product_row_count ?? 0), 0)
  const uploadCount = parseResult?.productCount ?? 0   // unique products in this upload
  const newTotal    = monthCount + uploadCount
  const currentTier = getTierSync(pricingTiers, monthCount)
  const newTier     = getTierSync(pricingTiers, newTotal)
  const tierUp      = newTier.display_name !== currentTier.display_name

  // Mapping validity
  const mappedFields   = new Set(Object.values(columnMapping).filter(v => v && v !== 'ignore'))
  const titleMapped    = mappedFields.has('title')
  const descMapped     = mappedFields.has('description')
  const mappingValid   = titleMapped && descMapped
  const hasImageMapped = mappedFields.has('image')

  const hasSource = file !== null || sheetSource !== null

  // ─── Success / Live status screen ──────────────────────────────────────────
  if (success && successMeta && activeUpload) {
    const { status } = activeUpload
    const isPulsingDot   = status === 'queued' || status === 'processing'
    const dotPulseSpeed  = status === 'queued' ? '2s' : '1s'
    return (
      <div style={{ paddingTop: 64, paddingBottom: 80, maxWidth: 580, margin: '0 auto', paddingInline: 48 }}>
        <div style={{ marginBottom: 56 }} className="s1">
          <div style={{ fontSize: 22, fontWeight: 600, color: T.black }}>{successMeta.storeName}</div>
          <div style={{ fontSize: 13, color: T.ter, marginTop: 4 }}>
            {successMeta.productCount} products · {successMeta.fileName}
          </div>
        </div>
        <div key={status} className="status-fade">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: status === 'done' || status === 'failed' ? T.black : '#AAAAAA',
              animation: isPulsingDot ? `pulseDot ${dotPulseSpeed} ease infinite` : 'none',
            }} />
            <span style={{ fontSize: 13, color: status === 'queued' ? T.sec : T.black }}>
              {status === 'queued' && 'Queued for processing'}
              {status === 'processing' && 'Processing\u2026'}
              {status === 'done' && 'Done'}
              {status === 'failed' && 'Failed'}
              {status === 'on_hold' && 'On Hold'}
            </span>
          </div>
          <div style={{ marginLeft: 14, fontSize: 12, color: status === 'failed' ? T.sec : T.ghost }}>
            {status === 'queued'     && 'Your file is in the queue.'}
            {status === 'processing' && `Optimizing ${activeUpload.product_row_count ?? ''} products`}
            {status === 'done'       && `Processed in ${activeUpload.processing_time_seconds ?? '?'} seconds`}
            {status === 'failed'     && (activeUpload.error_message ?? 'Something went wrong.')}
          </div>
          {status === 'processing' && <div style={{ marginLeft: 14, marginTop: 16 }}><WaveDots /></div>}
          {status === 'done' && (
            <div style={{ marginTop: 20, marginLeft: 14 }}>
              {activeUpload.output_locked ? (
                <div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#FEF3C7', borderRadius: 10, padding: '10px 16px',
                    marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 14 }}>🔒</span>
                    <span style={{ fontSize: 13, color: '#92400E', fontWeight: 500 }}>File locked — outstanding HigherUp share</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.ter, marginBottom: 12, marginLeft: 2 }}>
                    Pay your HigherUp share to unlock this file.
                  </div>
                </div>
              ) : (
                <button onClick={() => downloadOutput(activeUpload)} style={{
                  fontSize: 13, fontWeight: 500, color: T.bg,
                  background: T.black, border: 'none', borderRadius: 100,
                  padding: '12px 28px', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
                }} onMouseEnter={e => e.currentTarget.style.opacity = '0.75'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  Download result
                </button>
              )}
              <div style={{ marginTop: 12 }}>
                <button onClick={handleReset} style={{
                  fontSize: 13, color: T.ter, background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
                }} onMouseEnter={e => e.currentTarget.style.color = T.black} onMouseLeave={e => e.currentTarget.style.color = T.ter}>
                  Upload another
                </button>
              </div>
            </div>
          )}
          {status === 'failed' && (
            <div style={{ marginTop: 16, marginLeft: 14 }}>
              <button onClick={handleReset} style={{
                fontSize: 13, color: T.black, background: 'none', border: 'none',
                cursor: 'pointer', padding: '0 0 1px', borderBottom: '1px solid transparent',
                fontFamily: 'inherit', transition: 'border-color 0.15s',
              }} onMouseEnter={e => e.currentTarget.style.borderBottomColor = T.black} onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}>
                Try again
              </button>
            </div>
          )}
        </div>

        {/* ── Earnings block ────────────────────────────────────── */}
        <style>{`
          @media (max-width: 640px) {
            .earnings-row { flex-direction: column !important; gap: 24px !important; align-items: center !important; }
          }
        `}</style>
        {selectedClient?.va_rate_per_product ? (
          monthEarnings !== null ? (
            <div style={{ marginTop: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ter, marginBottom: 16 }}>
                THIS UPLOAD
                {status !== 'done' && (
                  <span style={{ color: T.ghost, marginLeft: 8, letterSpacing: 0, textTransform: 'none', fontSize: 10 }}>~ estimated</span>
                )}
              </div>
              <div className="earnings-row" style={{ display: 'flex', justifyContent: 'center', gap: 48, marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: '#2DB87E', letterSpacing: '-0.02em' }}>${monthEarnings.earned.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: T.ter, marginTop: 6 }}>earned</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 300, color: T.sec, letterSpacing: '-0.02em' }}>${monthEarnings.share.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: T.ter, marginTop: 6 }}>HigherUp share</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: '#2DB87E', letterSpacing: '-0.02em' }}>${monthEarnings.profit.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: T.ter, marginTop: 6 }}>your profit</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ width: '40%', height: 1, background: T.div }} />
              </div>

              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ter, marginBottom: 16 }}>
                THIS MONTH SO FAR
              </div>
              <div className="earnings-row" style={{ display: 'flex', justifyContent: 'center', gap: 48, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: '#2DB87E', letterSpacing: '-0.02em' }}>${monthEarnings.totalEarned.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: T.ter, marginTop: 6 }}>earned</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 300, color: T.sec, letterSpacing: '-0.02em' }}>${monthEarnings.totalShare.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: T.ter, marginTop: 6 }}>HigherUp share</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: '#2DB87E', letterSpacing: '-0.02em' }}>${monthEarnings.totalProfit.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: T.ter, marginTop: 6 }}>your profit</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: T.ter }}>
                {monthEarnings.totalVariants.toLocaleString()} products across {monthEarnings.totalClients} client{monthEarnings.totalClients !== 1 ? 's' : ''} this month
              </div>
            </div>
          ) : null
        ) : (
          <div style={{ marginTop: 40, textAlign: 'center' }}>
            {monthEarnings !== null && monthEarnings.clientUploadCount >= 3 ? (
              <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '16px 20px', textAlign: 'left', maxWidth: 380, margin: '0 auto' }}>
                <div style={{ fontSize: 14, color: T.black, marginBottom: 12, lineHeight: 1.6 }}>
                  You&apos;ve uploaded {monthEarnings.clientUploadCount} times for {successMeta.storeName} without tracking earnings. Set your rate to see how much you&apos;re making.
                </div>
                <a
                  href="/dashboard/clients"
                  style={{ fontSize: 13, fontWeight: 500, color: T.black, textDecoration: 'none', borderBottom: '1px solid transparent', paddingBottom: 1, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderBottomColor = T.black}
                  onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                >
                  Set rate now →
                </a>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 300, color: T.black, marginBottom: 6 }}>
                  Want to see how much you earned?
                </div>
                <div style={{ fontSize: 13, color: T.sec, marginBottom: 12 }}>
                  Set your rate per product to track your earnings.
                </div>
                <a
                  href="/dashboard/clients"
                  style={{ fontSize: 13, color: T.black, textDecoration: 'none', borderBottom: '1px solid transparent', paddingBottom: 1, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderBottomColor = T.black}
                  onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                >
                  Set rate →
                </a>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingTop: 64, paddingBottom: 80, maxWidth: 580, margin: '0 auto', paddingInline: 48 }}>

      {/* Title */}
      <div style={{ marginBottom: 48 }} className="s1">
        <div style={{ fontSize: 22, fontWeight: 600, color: T.black }}>Upload</div>
        <div style={{ fontSize: 13, color: T.ter, marginTop: 4 }}>CSV, XLSX, or Google Sheets · max 10 MB</div>
      </div>

      {/* Client */}
      <div style={{ marginBottom: 40 }} className="s2">
        <ClientDropdown
          value={clientId}
          options={clients.map(c => ({ value: c.id, label: c.store_name }))}
          placeholder={clientsLoading ? 'Loading…' : 'Select a client'}
          onChange={v => setClientId(v)}
          error={attempted && !clientId ? 'Select a client.' : undefined}
          loading={clientsLoading}
        />
      </div>

      {/* ── File input section ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }} className="s3">
        {fileMode !== 'manual' && (
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 10 }}>
            File
          </div>
        )}

        {/* FILE MODE */}
        {fileMode === 'file' && (
          <>
            {!hasSource ? (
              <div
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  height: 160, cursor: 'pointer',
                  border: `1.5px dashed ${dragOver ? T.black : '#DDDDDD'}`,
                  background: dragOver ? '#FAFAFA' : T.bg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'all 0.15s', userSelect: 'none',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke={dragOver ? T.black : T.ghost} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: 'stroke 0.15s' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <div style={{ fontSize: 13, color: dragOver ? T.black : T.sec, transition: 'color 0.15s' }}>
                  {dragOver ? 'Drop to upload' : 'Drop file here, or click to browse'}
                </div>
                <div style={{ fontSize: 11, color: T.ghost }}>CSV, XLSX · max 10 MB</div>
              </div>
            ) : (
              <div style={{ padding: '14px 16px', border: '1px solid #EEEEEE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Chip label={sheetSource ? 'SHEET' : (file!.name.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'CSV')} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.black, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sheetSource ? sheetSource.label : file!.name}
                    </div>
                    <div style={{ fontSize: 11, color: T.ter, marginTop: 1 }}>
                      {sheetSource ? (
                        <>Google Sheet{!parsing && parseResult ? ` · ${parseResult.productCount} products` : ''}</>
                      ) : (
                        <>
                          {(file!.size / 1024).toFixed(0)} KB
                          {parsing ? ' · Parsing…' : (parseResult ? ` · ${parseResult.productCount} products` : '')}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setFile(null); setSheetSource(null); setParseResult(null); setFileError(null); setColumnMapping({}); setMappingConfirmed(false) }}
                  style={{ fontSize: 18, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 4px', transition: 'color 0.15s', flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ghost}
                >×</button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
            />

            {fileError && <div style={{ fontSize: 12, color: T.red, marginTop: 8 }}>{fileError}</div>}
            {attempted && !hasSource && !fileError && (
              <div style={{ fontSize: 12, color: T.red, marginTop: 8 }}>Select a file to upload.</div>
            )}

            {/* Google Sheets link toggle */}
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                onClick={() => { setFileMode('sheet'); setTimeout(() => sheetUrlRef.current?.focus(), 80) }}
                style={{ fontSize: 13, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >
                or paste a Google Sheets link
              </button>
            </div>

            {/* Manual entry toggle */}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button
                onClick={() => { setFileMode('manual'); setFile(null); setSheetSource(null); setParseResult(null); setColumnMapping({}); setMappingConfirmed(false) }}
                style={{ fontSize: 13, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >
                or enter products manually
              </button>
            </div>
          </>
        )}

        {/* MANUAL ENTRY MODE */}
        {fileMode === 'manual' && (
          <ManualEntry
            va={va}
            client={selectedClient}
            onBack={() => setFileMode('file')}
            onProcessed={handleManualProcessed}
          />
        )}

        {/* GOOGLE SHEETS MODE */}
        {fileMode === 'sheet' && (
          <div style={{ animation: 'fadeUp 0.2s ease both' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <input
                ref={sheetUrlRef}
                type="url"
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                onKeyDown={e => { if (e.key === 'Enter') handleLoadSheet() }}
                style={{
                  flex: 1, fontSize: 13, color: T.black,
                  background: 'none', border: 'none', outline: 'none',
                  borderBottom: '1.5px solid #EEEEEE',
                  padding: '4px 0 8px', fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
                onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
              />
              <button
                onClick={handleLoadSheet}
                disabled={sheetLoading || !sheetUrl.trim()}
                style={{
                  fontSize: 12, fontWeight: 500, color: T.bg,
                  background: T.black, border: 'none', borderRadius: 100,
                  padding: '8px 16px', cursor: (sheetLoading || !sheetUrl.trim()) ? 'default' : 'pointer',
                  fontFamily: 'inherit', transition: 'opacity 0.15s', flexShrink: 0,
                  opacity: (sheetLoading || !sheetUrl.trim()) ? 0.4 : 1,
                }}
              >
                {sheetLoading ? 'Loading…' : 'Load sheet'}
              </button>
            </div>
            {sheetError && (
              <div style={{ fontSize: 12, color: T.sec, marginTop: 8 }}>{sheetError}</div>
            )}
            {sheetSource && parseResult && (
              <div style={{ fontSize: 12, color: T.green, marginTop: 8 }}>
                ✓ Loaded {parseResult.rows} rows
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => { setFileMode('file'); setSheetUrl(''); setSheetError(null); setSheetSource(null); setParseResult(null) }}
                style={{ fontSize: 11, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >
                ← Back to file upload
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sheet selector — multi-sheet XLSX only ────────────────────────── */}
      {parseResult && parseResult.sheetNames.length > 1 && (
        <div style={{ marginBottom: 32 }} className="s3">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 10 }}>
            Sheet
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {parseResult.sheetNames.map(s => (
              <button key={s} onClick={() => switchSheet(s)} style={{
                padding: '5px 12px', fontSize: 12,
                background: parseResult.selectedSheet === s ? T.black : 'none',
                color:      parseResult.selectedSheet === s ? T.bg    : T.sec,
                border:     `1px solid ${parseResult.selectedSheet === s ? T.black : '#EEEEEE'}`,
                cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── File analysis (products + store match) ────────────────────────── */}
      {parseResult && !parsing && (
        <div style={{ marginBottom: 32 }} className="s3">
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DDDDDD', marginBottom: 4 }}>Products</div>
              <div style={{ fontSize: 26, fontWeight: 600, color: T.black, lineHeight: 1 }}>{parseResult.productCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DDDDDD', marginBottom: 4 }}>Store match</div>
              {parseResult.storeNameStatus === 'match' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.green }}>Verified</span>
                </div>
              )}
              {parseResult.storeNameStatus === 'mismatch' && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.orange, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: T.orange }}>Mismatch</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.ter, marginTop: 3 }}>
                    File: &quot;{parseResult.storeNameInFile}&quot;
                    {selectedClient && <> · Client: &quot;{selectedClient.store_name}&quot;</>}
                  </div>
                </div>
              )}
              {parseResult.storeNameStatus === 'not_found' && (
                <div style={{ fontSize: 13, color: T.ter, marginTop: 4 }}>—</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Shopify auto-detected banner (replaces mapping UI) ───────────── */}
      {parseResult && !parsing && parseResult.isShopify && mappingConfirmed && (
        <div style={{
          marginBottom: 32, paddingTop: 16, paddingBottom: 16,
          borderTop: `1px solid ${T.div}`, borderBottom: `1px solid ${T.div}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }} className="s4">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: T.black }}>Shopify export detected</span>
            <span style={{ fontSize: 12, color: T.green }}>✓</span>
            <span style={{ fontSize: 12, color: T.ghost }}>Ready to process</span>
          </div>
          <button
            onClick={() => setMappingConfirmed(false)}
            style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = T.black}
            onMouseLeave={e => e.currentTarget.style.color = T.ter}
          >
            Show mapping
          </button>
        </div>
      )}

      {/* ── Column mapping step ───────────────────────────────────────────── */}
      {parseResult && !parsing && !mappingConfirmed && (
        <div style={{ marginBottom: 40 }} className="s4">
          <div style={{ paddingTop: 24, borderTop: `1px solid ${T.div}` }}>

            {usingRemembered && !showFullMapping ? (
              /* ── Remembered mapping summary ── */
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 6 }}>
                  Column mapping
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 12, color: T.ter }}>Using your previous column mapping</span>
                  <button
                    onClick={() => setShowFullMapping(true)}
                    style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = T.black}
                    onMouseLeave={e => e.currentTarget.style.color = T.ter}
                  >
                    Change mapping
                  </button>
                </div>
                <MappingSummary mapping={columnMapping} />
                <MappingPreview
                  headers={parseResult.headers}
                  mapping={columnMapping}
                  previewData={parseResult.previewData}
                />
              </div>
            ) : (
              /* ── Full mapping UI ── */
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 4 }}>
                  We detected your columns
                </div>
                {usingRemembered && (
                  <div style={{ fontSize: 12, color: T.ter, marginBottom: 16 }}>
                    Based on your previous mapping for this client
                  </div>
                )}
                {!usingRemembered && (
                  <div style={{ fontSize: 12, color: T.ter, marginBottom: 16 }}>
                    Adjust if anything looks wrong
                  </div>
                )}

                {/* Mapping rows */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', padding: '0 0 6px', borderBottom: `1px solid ${T.div}` }}>
                    <div style={{ flex: '0 0 50%', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>Column in file</div>
                    <div style={{ flex: '0 0 50%', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>Maps to</div>
                  </div>
                  {parseResult.headers.map(col => (
                    <MappingRow
                      key={col}
                      col={col}
                      value={columnMapping[col] ?? ''}
                      onChange={(v) => setColumnMapping(prev => ({ ...prev, [col]: v }))}
                    />
                  ))}
                </div>

                {/* Image note */}
                {hasImageMapped && (
                  <div style={{ fontSize: 11, color: T.ghost, marginTop: 8 }}>
                    Image columns are passed through unchanged. We optimize text only.
                  </div>
                )}

                {/* Summary */}
                <MappingSummary mapping={columnMapping} />

                {/* Validation error */}
                {!mappingValid && (
                  <div style={{ fontSize: 12, color: T.sec, marginTop: 10 }}>
                    Title and Description columns are required
                  </div>
                )}

                {/* Preview */}
                <MappingPreview
                  headers={parseResult.headers}
                  mapping={columnMapping}
                  previewData={parseResult.previewData}
                />
              </div>
            )}

            {/* Confirm buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
              <button
                onClick={() => { if (mappingValid) setMappingConfirmed(true) }}
                disabled={!mappingValid}
                style={{
                  fontSize: 13, fontWeight: 500, color: T.bg,
                  background: T.black, border: 'none', borderRadius: 100,
                  padding: '10px 24px', cursor: mappingValid ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                  opacity: mappingValid ? 1 : 0.35,
                }}
                onMouseEnter={e => { if (mappingValid) e.currentTarget.style.opacity = '0.75' }}
                onMouseLeave={e => { if (mappingValid) e.currentTarget.style.opacity = '1' }}
              >
                Looks correct
              </button>
              {(usingRemembered && !showFullMapping) ? null : (
                <button
                  onClick={() => {
                    if (parseResult.isShopify) {
                      setColumnMapping(shopifyUIMapping(parseResult.headers))
                      setMappingConfirmed(true)
                    } else if (usingRemembered) {
                      setShowFullMapping(false)
                    } else {
                      setColumnMapping(autoDetectMapping(parseResult.headers))
                    }
                  }}
                  style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >
                  {parseResult.isShopify ? 'Use Shopify mapping' : usingRemembered ? 'Use previous mapping' : 'Reset to auto-detect'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mapping confirmed compact bar (non-Shopify only) ──────────────── */}
      {parseResult && !parsing && mappingConfirmed && !parseResult.isShopify && (
        <div style={{
          marginBottom: 32, paddingTop: 16, paddingBottom: 16,
          borderTop: `1px solid ${T.div}`, borderBottom: `1px solid ${T.div}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }} className="s4">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: T.black }}>Column mapping</span>
            <span style={{ fontSize: 12, color: T.green }}>✓</span>
            <span style={{ fontSize: 12, color: T.ghost }}>{mappedFields.size} fields</span>
          </div>
          <button
            onClick={() => setMappingConfirmed(false)}
            style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = T.black}
            onMouseLeave={e => e.currentTarget.style.color = T.ter}
          >
            Edit
          </button>
        </div>
      )}

      {/* ── Template selector ─────────────────────────────────────────────── */}
      {parseResult && !parsing && mappingConfirmed && templateData && (
        <TemplateSelector
          data={templateData}
          selectedTemplateId={selectedTemplateId}
          onChange={setSelectedTemplateId}
        />
      )}

      {/* ── Special instructions (visible after mapping confirmed) ────────── */}
      {file !== null || sheetSource !== null ? (
        parseResult && !parsing && mappingConfirmed ? (
          <div style={{ marginBottom: 40 }} className="s5">
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 10 }}>
              Special instructions{' '}
              <span style={{ color: '#EEEEEE', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </div>
            <textarea
              value={instructions}
              onChange={e => {
                setInstructions(e.target.value.slice(0, 500))
                if (preCheckPhase !== 'idle') setPreCheckPhase('idle')
                if (onHoldSent) setOnHoldSent(false)
              }}
              placeholder="Any specific instructions for this upload…"
              rows={3}
              style={{
                width: '100%', fontSize: 13, color: T.black,
                background: 'none', border: 'none', outline: 'none',
                borderBottom: '1px solid #EEEEEE',
                resize: 'none', padding: '0 0 8px 0',
                fontFamily: 'inherit', lineHeight: 1.65, transition: 'border-color 0.15s',
              }}
              onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
              onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
            />
            <div style={{ textAlign: 'right', fontSize: 11, marginTop: 4, color: instructions.length > 450 ? T.orange : T.ghost }}>
              {instructions.length}/500
            </div>
          </div>
        ) : null
      ) : null}

      {/* ── Monthly summary (visible after mapping confirmed) ─────────────── */}
      {parseResult && selectedClient && !parsing && mappingConfirmed && (
        <div style={{ marginBottom: 40, paddingTop: 24, borderTop: `1px solid ${T.div}` }} className="s6">
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 20 }}>
            Monthly summary
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DDDDDD', marginBottom: 4 }}>This month</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: T.black }}>{monthCount}</div>
              <div style={{ fontSize: 11, color: T.ter, marginTop: 2 }}>products · {currentTier.display_name} · ${currentTier.amount}</div>
            </div>
            <div style={{ fontSize: 16, color: '#DDDDDD', alignSelf: 'center', paddingTop: 2 }}>+</div>
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DDDDDD', marginBottom: 4 }}>This upload</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: T.black }}>{uploadCount}</div>
              <div style={{ fontSize: 11, color: T.ter, marginTop: 2 }}>
                {uploadCount} products
              </div>
            </div>
            <div style={{ fontSize: 16, color: '#DDDDDD', alignSelf: 'center', paddingTop: 2 }}>=</div>
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DDDDDD', marginBottom: 4 }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: T.black }}>{newTotal}</div>
              <div style={{ fontSize: 11, marginTop: 2, color: tierUp ? T.green : T.ter }}>
                products · {newTier.display_name} · ${newTier.amount}{tierUp && ' ↑'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit + pre-check flow ────────────────────────────────────────── */}
      {parseResult && !parsing && mappingConfirmed && (
        <div className="s7">
          {submitError && <div style={{ fontSize: 12, color: T.red, marginBottom: 12 }}>{submitError}</div>}

          {/* On hold confirmation */}
          {onHoldSent && (
            <div style={{ padding: '16px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 6 }}>
                Upload on hold
              </div>
              <div style={{ fontSize: 13, color: T.ter, lineHeight: 1.6 }}>
                Your upload is on hold. An admin will review your instructions and get back to you.
              </div>
            </div>
          )}

          {/* Checking state */}
          {!onHoldSent && preCheckPhase === 'checking' && (
            <div style={{ fontSize: 13, color: T.ter, display: 'flex', alignItems: 'center', gap: 8 }}>
              <style>{`@keyframes hupulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
              <span style={{ animation: 'hupulse 1.4s ease-in-out infinite' }}>Checking instructions…</span>
            </div>
          )}

          {/* Medium confidence warning */}
          {!onHoldSent && preCheckPhase === 'medium' && preCheckResult && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#999999', marginBottom: 4 }}>
                We&apos;ll try to apply your instructions, but results may vary:
              </div>
              <div style={{ fontSize: 12, color: '#CCCCCC', marginBottom: 16 }}>
                {preCheckResult.reason}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  onClick={() => doSubmit(preCheckResult.adjusted_instruction ?? instructions.trim(), false, preCheckOutCols, preCheckResult)}
                  disabled={uploading}
                  style={{
                    fontSize: 13, fontWeight: 500, color: T.bg, background: T.black, border: 'none',
                    padding: '10px 22px', cursor: uploading ? 'default' : 'pointer',
                    opacity: uploading ? 0.5 : 1, transition: 'opacity 0.15s', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (!uploading) e.currentTarget.style.opacity = '0.75' }}
                  onMouseLeave={e => { if (!uploading) e.currentTarget.style.opacity = '1' }}
                >
                  Continue anyway
                </button>
                <button
                  onClick={() => setPreCheckPhase('idle')}
                  style={{ fontSize: 12, color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s', fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = '#CCCCCC'}
                >
                  Edit instructions
                </button>
              </div>
            </div>
          )}

          {/* Blocked — can't handle */}
          {!onHoldSent && preCheckPhase === 'blocked' && preCheckResult && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 6 }}>
                These instructions are outside what we can do
              </div>
              <div style={{ fontSize: 13, color: '#999999', marginBottom: 20 }}>
                {preCheckResult.reason}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setPreCheckPhase('idle')}
                  style={{
                    fontSize: 13, fontWeight: 500, color: T.bg, background: T.black, border: 'none',
                    padding: '10px 22px', cursor: 'pointer',
                    transition: 'opacity 0.15s', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Edit instructions
                </button>
                <button
                  onClick={() => { setPreCheckPhase('idle'); doSubmit(null) }}
                  disabled={uploading}
                  style={{ fontSize: 12, color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s', fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = '#CCCCCC'}
                >
                  Skip instructions
                </button>
                <button
                  onClick={() => doSubmit(instructions.trim(), true, null, preCheckResult)}
                  disabled={uploading}
                  style={{ fontSize: 12, color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s', fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = '#CCCCCC'}
                >
                  Request admin help
                </button>
              </div>
            </div>
          )}

          {/* Normal submit button */}
          {!onHoldSent && preCheckPhase === 'idle' && (
            <button
              onClick={handleSubmit}
              disabled={uploading}
              style={{
                fontSize: 13, fontWeight: 600, color: T.bg, background: T.black, border: 'none',
                padding: '11px 28px', cursor: uploading ? 'default' : 'pointer',
                opacity: uploading ? 0.5 : 1, transition: 'opacity 0.15s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!uploading) e.currentTarget.style.opacity = '0.75' }}
              onMouseLeave={e => { if (!uploading) e.currentTarget.style.opacity = '1' }}
            >
              {uploading ? 'Uploading…' : 'Process listings'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  return (
    <Suspense>
      <UploadForm />
    </Suspense>
  )
}
