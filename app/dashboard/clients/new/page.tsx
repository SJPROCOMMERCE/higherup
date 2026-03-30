'use client'

// SQL: Run this migration if custom_requirements / custom_data columns don't exist yet:
// ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS custom_requirements BOOLEAN;
// ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS custom_data JSONB;

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:   '#111111',
  sec:     '#999999',
  ter:     '#CCCCCC',
  ghost:   '#DDDDDD',
  div:     '#EEEEEE',
  err:     '#999999',
}

// ─── Option data ──────────────────────────────────────────────────────────────

const NICHES = [
  { label: 'Fashion',          value: 'fashion' },
  { label: 'Electronics',      value: 'electronics' },
  { label: 'Home & Garden',    value: 'home_garden' },
  { label: 'Beauty',           value: 'beauty' },
  { label: 'Health & Fitness', value: 'health' },
  { label: 'Sports',           value: 'sports' },
  { label: 'Other',            value: 'other' },
]

const LANGUAGES = [
  { label: 'English',    value: 'english'    },
  { label: 'German',     value: 'german'     },
  { label: 'French',     value: 'french'     },
  { label: 'Dutch',      value: 'dutch'      },
  { label: 'Spanish',    value: 'spanish'    },
  { label: 'Polish',     value: 'polish'     },
  { label: 'Portuguese', value: 'portuguese' },
  { label: 'Italian',    value: 'italian'    },
  { label: 'Swedish',    value: 'swedish'    },
  { label: 'Danish',     value: 'danish'     },
  { label: 'Norwegian',  value: 'norwegian'  },
  { label: 'Other',      value: 'other'      },
]

const TITLE_PREFS = [
  { label: 'Short',  value: 'short' },
  { label: 'Medium', value: 'medium' },
  { label: 'Long',   value: 'long' },
]

const DESC_STYLES = [
  { label: 'Emotional', value: 'emotional' },
  { label: 'Technical', value: 'technical' },
  { label: 'Casual',    value: 'casual' },
  { label: 'Luxury',    value: 'luxury' },
  { label: 'Neutral',   value: 'neutral' },
]

const MARKETS = [
  'United States', 'United Kingdom', 'Germany', 'Netherlands', 'France',
  'Spain', 'Italy', 'Belgium', 'Austria', 'Switzerland', 'Sweden', 'Denmark',
  'Norway', 'Finland', 'Poland', 'Portugal', 'Ireland', 'Canada', 'Australia',
  'New Zealand', 'Japan', 'South Korea', 'Singapore', 'United Arab Emirates',
  'Saudi Arabia', 'Brazil', 'Mexico', 'Other',
].map(m => ({ label: m, value: m }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString() {
  return new Date().toISOString().split('T')[0]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 6 }}>
      {label}
      {optional && <span style={{ color: T.ghost, marginLeft: 6, letterSpacing: 0, textTransform: 'none', fontSize: 10, fontWeight: 400 }}>(optional)</span>}
    </div>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <div style={{ fontSize: 11, color: T.err, marginTop: 6 }}>{msg}</div>
}

function FieldHint({ msg }: { msg: string }) {
  return <div style={{ fontSize: 11, color: T.ghost, marginTop: 6 }}>{msg}</div>
}

const inputBase = (hasError?: boolean, focused?: boolean): React.CSSProperties => ({
  width: '100%', fontSize: 15, fontWeight: 400, color: T.black,
  background: 'none', border: 'none', outline: 'none',
  borderBottom: `1.5px solid ${focused ? T.black : hasError ? T.err : T.div}`,
  padding: '10px 0', fontFamily: 'inherit', transition: 'border-color 0.15s',
})

// ─── Text Input ───────────────────────────────────────────────────────────────

function TextInput({
  value, onChange, onBlur, placeholder, type, hasError,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  type?: string
  hasError?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type ?? 'text'}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onBlur?.() }}
      style={{ ...inputBase(hasError, focused), display: 'block' }}
    />
  )
}

// ─── Number Input ─────────────────────────────────────────────────────────────

function NumberInput({
  value, onChange, placeholder, hasError,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hasError?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) onChange(v) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ ...inputBase(hasError, focused), display: 'block' }}
    />
  )
}

// ─── Date Input ───────────────────────────────────────────────────────────────

function DateInput({
  value, onChange, hasError,
}: {
  value: string
  onChange: (v: string) => void
  hasError?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="date"
      min={todayString()}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ ...inputBase(hasError, focused), display: 'block', colorScheme: 'light' }}
    />
  )
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

function TextArea({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={3}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase(false, focused),
        display: 'block', resize: 'vertical', minHeight: 80,
        paddingTop: 10,
      }}
    />
  )
}

// ─── Custom Dropdown ──────────────────────────────────────────────────────────

function CustomDropdown({
  options, value, onChange, placeholder, hasError,
}: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
  placeholder: string
  hasError?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setFocused(false) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        tabIndex={0}
        onClick={() => { setOpen(!open); setFocused(true) }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(!open) }}
        style={{
          ...inputBase(hasError, open || focused),
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none',
          color: selected ? T.black : T.ghost,
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        <span style={{ color: T.ter, fontSize: 9, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="hu-dropdown-list" style={{ top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto', background: '#FFFFFF', backgroundColor: '#FFFFFF', borderRadius: 8, border: '1px solid #EEEEEE', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', zIndex: 9999 }}>
          {options.map(o => (
            <div
              key={o.value}
              className={`hu-dropdown-option${o.value === value ? ' is-selected' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); setFocused(false) }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F7')}
              onMouseLeave={e => (e.currentTarget.style.background = o.value === value ? '#F5F5F7' : '#FFFFFF')}
              style={{ padding: '10px 12px', fontSize: 14, fontWeight: o.value === value ? 500 : 400, color: T.black, background: o.value === value ? '#F5F5F7' : '#FFFFFF', cursor: 'pointer' }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Searchable Dropdown ──────────────────────────────────────────────────────

function SearchableDropdown({
  options, value, onChange, placeholder, hasError,
}: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
  placeholder: string
  hasError?: boolean
}) {
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [focused, setFocused] = useState(false)
  const ref       = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selected  = options.find(o => o.value === value)
  const filtered  = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setFocused(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setFocused(false); setQuery('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10)
  }, [open])

  function handleOpen() {
    setOpen(!open)
    setFocused(true)
    setQuery('')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleOpen() }}
        style={{
          ...inputBase(hasError, open || focused),
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none',
          color: selected ? T.black : T.ghost,
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        <span style={{ color: T.ter, fontSize: 9, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="hu-dropdown-list" style={{ top: '100%', left: 0, right: 0, background: '#FFFFFF', backgroundColor: '#FFFFFF', borderRadius: 8, border: '1px solid #EEEEEE', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', zIndex: 9999 }}>
          {/* Search input */}
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.div}`, background: '#FFFFFF' }}>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%', fontSize: 13, color: T.black,
                background: 'none', border: 'none', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          {/* Options */}
          <div style={{ maxHeight: 200, overflowY: 'auto', background: '#FFFFFF' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 13, color: T.ter, background: '#FFFFFF' }}>No results</div>
            ) : (
              filtered.map(o => (
                <div
                  key={o.value}
                  className={`hu-dropdown-option${o.value === value ? ' is-selected' : ''}`}
                  onClick={() => { onChange(o.value); setOpen(false); setFocused(false); setQuery('') }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F7')}
                  onMouseLeave={e => (e.currentTarget.style.background = o.value === value ? '#F5F5F7' : '#FFFFFF')}
                  style={{ padding: '10px 12px', fontSize: 14, fontWeight: o.value === value ? 500 : 400, color: T.black, background: o.value === value ? '#F5F5F7' : '#FFFFFF', cursor: 'pointer' }}
                >
                  {o.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pill Toggle ──────────────────────────────────────────────────────────────

function PillToggle({
  options, value, onChange,
}: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const sel = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 100,
              border: `1px solid ${sel ? T.black : T.div}`,
              background: sel ? T.black : '#FFFFFF',
              color: sel ? '#FFFFFF' : T.ter,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = T.ter; e.currentTarget.style.color = T.sec } }}
            onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = T.div; e.currentTarget.style.color = T.ter } }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Custom Checkbox ──────────────────────────────────────────────────────────

function CustomCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked) } }}
      style={{
        width: 16, height: 16, flexShrink: 0,
        border: `1.5px solid ${checked ? T.black : T.ghost}`,
        borderRadius: 2, background: checked ? T.black : '#FFFFFF',
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.15s',
      }}
    >
      {checked && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  )
}

// ─── Listing preferences constants ────────────────────────────────────────────

const ADVERTISING_PLATFORMS = ['Google', 'Meta', 'TikTok']

// ─── Custom requirements message builder ──────────────────────────────────────

type CustomData = {
  maxDiscount: string
  competitorPriceDiff: string
  priceEnding: string   // '.99' | '.95' | '.90' | '.00' | 'none' | ''
  pricingBasis: string  // 'compare_at' | 'manual' | ''
  platform: string
  titlePrompt: string
  descriptionPrompt: string
  skuStructure: string
  avgStock: string
  collections: string
  additionalNotes: string
}

const PRICE_ENDINGS = [
  { value: '.99', label: '.99', example: '€24.99' },
  { value: '.95', label: '.95', example: '€24.95' },
  { value: '.90', label: '.90', example: '€24.90' },
  { value: '.00', label: '.00', example: '€25.00' },
  { value: 'none', label: 'No rounding', example: 'Keep as-is' },
]

function buildCustomRequirementsMessage(data: CustomData): string {
  const lines: string[] = []
  if (data.pricingBasis === 'compare_at') lines.push(`Pricing basis: Discount from Compare At Price`)
  if (data.pricingBasis === 'manual') lines.push(`Pricing basis: Prices are already set (no changes)`)
  if (data.maxDiscount) lines.push(`Maximum discount: ${data.maxDiscount}%`)
  if (data.competitorPriceDiff) lines.push(`Price vs competitors: ${data.competitorPriceDiff}% under`)
  if (data.priceEnding && data.priceEnding !== 'none') lines.push(`Price ending: ${data.priceEnding}`)
  if (data.priceEnding === 'none') lines.push(`Price ending: No rounding`)
  if (data.platform) lines.push(`Advertising platform: ${data.platform}`)
  if (data.titlePrompt) lines.push(`Title prompt:\n${data.titlePrompt}`)
  if (data.descriptionPrompt) lines.push(`Description prompt:\n${data.descriptionPrompt}`)
  if (data.skuStructure) lines.push(`SKU structure: ${data.skuStructure}`)
  if (data.avgStock) lines.push(`Average stock per product: ${data.avgStock}`)
  if (data.collections) lines.push(`Collections:\n${data.collections}`)
  if (data.additionalNotes) lines.push(`Additional notes:\n${data.additionalNotes}`)
  return lines.join('\n\n') || ''
}

// ─── Validation ───────────────────────────────────────────────────────────────

type FormState = {
  store_name: string
  store_domain: string
  niche: string
  market: string
  market_other: string
  language: string
  expected_monthly_products: string
  va_rate_per_product: string
  title_preference: string
  description_style: string
  payment_method: string
  start_date: string
  special_instructions: string
}

function validate(form: FormState): Record<string, string> {
  const e: Record<string, string> = {}
  if (!form.store_name.trim() || form.store_name.trim().length < 2) e.store_name = 'Store name is required'
  if (!form.niche) e.niche = 'Please select a niche'
  if (!form.market) e.market = 'Market is required'
  else if (form.market === 'Other' && !form.market_other.trim()) e.market = 'Please specify your market'
  if (!form.language) e.language = 'Please select a language'
  const n = Number(form.expected_monthly_products)
  if (!form.expected_monthly_products || isNaN(n) || n <= 0) e.expected_monthly_products = 'Enter a valid number'
  if (!form.title_preference) e.title_preference = 'Select a title preference'
  if (!form.description_style) e.description_style = 'Select a description style'
  if (!form.start_date) {
    e.start_date = 'Start date must be today or later'
  } else {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sel = new Date(form.start_date + 'T00:00:00')
    if (sel < today) e.start_date = 'Start date must be today or later'
  }
  return e
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewClientPage() {
  const router   = useRouter()
  const { currentVA } = useVA()

  const [form, setForm] = useState<FormState>({
    store_name: '', store_domain: '', niche: '', market: '', market_other: '',
    language: '', expected_monthly_products: '', va_rate_per_product: '',
    title_preference: '', description_style: '', payment_method: '',
    start_date: '', special_instructions: '',
  })

  const [confirmed,       setConfirmed]      = useState(false)
  const [hasTriedSubmit,  setHasTriedSubmit]  = useState(false)
  const [errors,          setErrors]          = useState<Record<string, string>>({})
  const [duplicateError,  setDuplicateError]  = useState(false)
  const [submitting,      setSubmitting]      = useState(false)
  const [submitError,     setSubmitError]     = useState(false)
  const [success,         setSuccess]         = useState(false)

  // Listing preferences
  const [hasCustomRequirements, setHasCustomRequirements] = useState<boolean | null>(null)
  const [regSelectedFiles, setRegSelectedFiles] = useState<File[]>([])
  const [customData, setCustomData] = useState<CustomData>({
    maxDiscount: '',
    competitorPriceDiff: '',
    priceEnding: '',
    pricingBasis: '',
    platform: '',
    titlePrompt: '',
    descriptionPrompt: '',
    skuStructure: '',
    avgStock: '',
    collections: '',
    additionalNotes: '',
  })

  // Live validation after first submit attempt
  useEffect(() => {
    if (hasTriedSubmit) setErrors(validate(form))
  }, [form, hasTriedSubmit])

  // Duplicate check on blur
  const checkDuplicate = useCallback(async () => {
    if (!form.store_name.trim() || !currentVA) return
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('va_id', currentVA.id)
      .ilike('store_name', form.store_name.trim())
      .maybeSingle()
    setDuplicateError(!!data)
  }, [form.store_name, currentVA])

  function set(key: keyof FormState) {
    return (val: string) => setForm(prev => ({ ...prev, [key]: val }))
  }

  const currentErrors = hasTriedSubmit ? errors : {}
  const hasErrors     = Object.keys(currentErrors).length > 0 || duplicateError
  const submitDisabled = !confirmed || hasErrors || submitting

  async function handleSubmit() {
    setHasTriedSubmit(true)
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0 || duplicateError || !currentVA) return

    setSubmitting(true); setSubmitError(false)

    const specialParts = [
      form.payment_method?.trim() ? `Payment method: ${form.payment_method.trim()}` : '',
      form.special_instructions?.trim(),
    ].filter(Boolean).join('\n\n')

    const { data: insertedClient, error } = await supabase.from('clients').insert({
      va_id:                    currentVA.id,
      store_name:               form.store_name.trim(),
      store_domain:             form.store_domain.trim() || null,
      niche:                    form.niche || null,
      market:                   form.market === 'Other' ? (form.market_other.trim() || 'Other') : (form.market || null),
      language:                 form.language || null,
      expected_monthly_products: parseInt(form.expected_monthly_products) || null,
      va_rate_per_product:      form.va_rate_per_product ? (parseFloat(form.va_rate_per_product) || null) : null,
      title_preference:         form.title_preference || null,
      description_style:        form.description_style || null,
      special_instructions:     specialParts || null,
      approval_status:          'pending',
      is_active:                true,
      deadline_48h:             form.start_date ? new Date(form.start_date + 'T00:00:00').toISOString() : null,
    }).select('id').single()

    setSubmitting(false)
    if (error || !insertedClient) { setSubmitError(true); return }

    const newClientId = insertedClient.id

    // Create client_profiles entry with custom_requirements + pricing columns
    await supabase.from('client_profiles').insert({
      client_id:             newClientId,
      prompt_id:             null,
      custom_requirements:   hasCustomRequirements === true,
      custom_data:           hasCustomRequirements === true ? customData : null,
      max_discount:          hasCustomRequirements === true ? (parseFloat(customData.maxDiscount) || null) : null,
      competitor_price_diff: hasCustomRequirements === true ? (parseFloat(customData.competitorPriceDiff) || null) : null,
      price_ending:          hasCustomRequirements === true ? (customData.priceEnding || null) : null,
      pricing_basis:         hasCustomRequirements === true ? (customData.pricingBasis || null) : null,
    })

    // If custom requirements: always create a prompt_request so admin sees it
    if (hasCustomRequirements === true) {
      const message = buildCustomRequirementsMessage(customData)

      // Upload files first
      const fileUrls: string[] = []
      const fileNames: string[] = []
      const filePaths: string[] = []

      for (const file of regSelectedFiles) {
        if (file.size > 5 * 1024 * 1024) continue
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${newClientId}/${Date.now()}-${safeName}`
        const { error: uploadErr } = await supabase.storage.from('prompt-requests').upload(path, file, { upsert: false })
        if (!uploadErr) {
          const { data: signed } = await supabase.storage.from('prompt-requests').createSignedUrl(path, 60 * 60 * 24 * 365)
          filePaths.push(path)
          fileNames.push(file.name)
          fileUrls.push(signed?.signedUrl ?? path)
        }
      }

      const { error: reqErr } = await supabase.from('prompt_requests').insert({
        client_id: newClientId,
        va_id: currentVA.id,
        message: message || null,
        file_urls: fileUrls,
        file_names: fileNames,
        file_paths: filePaths,
        structured_data: customData,
        status: 'submitted',
      })
      if (reqErr) console.error('[REGISTER] prompt_request insert failed:', reqErr)
    }

    void logActivity({
      action: 'client_registered',
      va_id: currentVA.id,
      source: 'va',
      details: `New client registered: ${form.store_name}`,
    })

    // Reset listing preferences state
    setHasCustomRequirements(null)
    setRegSelectedFiles([])
    setCustomData({
      maxDiscount: '', competitorPriceDiff: '', priceEnding: '', pricingBasis: '',
      platform: '', titlePrompt: '', descriptionPrompt: '',
      skuStructure: '', avgStock: '', collections: '', additionalNotes: '',
    })

    setSuccess(true)
  }

  if (!currentVA) return null

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ paddingTop: 64, paddingBottom: 80, maxWidth: 580, margin: '0 auto', paddingInline: 48, textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="s1">
          <div style={{ fontSize: 24, fontWeight: 300, color: T.black, marginBottom: 8 }}>Client registered</div>
          <div style={{ fontSize: 13, color: T.ter, marginBottom: 24 }}>{form.store_name} is pending approval.</div>
          <Link
            href="/dashboard"
            style={{ fontSize: 12, color: T.ter, textDecoration: 'underline', textDecorationColor: 'transparent', transition: 'color 0.15s, text-decoration-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = T.black; e.currentTarget.style.textDecorationColor = T.black }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ter;   e.currentTarget.style.textDecorationColor = 'transparent' }}
          >
            Back to overview
          </Link>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  const wrap  = { marginBottom: 28 } as React.CSSProperties
  const outer = { paddingTop: 64, paddingBottom: 80, maxWidth: 580, margin: '0 auto', paddingInline: 48, fontFamily: "'Inter', system-ui, sans-serif" } as React.CSSProperties

  return (
    <div style={outer} className="content-pad">

      {/* Back link */}
      <div className="s1" style={{ marginBottom: 40 }}>
        <Link
          href="/dashboard"
          style={{ fontSize: 12, color: T.ter, textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.black}
          onMouseLeave={e => e.currentTarget.style.color = T.ter}
        >← Back to overview</Link>
      </div>

      {/* Header */}
      <div className="s2" style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 28, fontWeight: 300, color: T.black, marginBottom: 8 }}>Register new client</div>
        <div style={{ fontSize: 13, color: T.ter }}>Fill in the details below. We&apos;ll review and approve within 12 hours.</div>
      </div>

      {/* ── Fields ───────────────────────────────────────────── */}

      {/* 1. Store Name */}
      <div className="s3" style={wrap}>
        <FieldLabel label="Store Name" />
        <TextInput
          value={form.store_name}
          onChange={set('store_name')}
          onBlur={checkDuplicate}
          placeholder="e.g. StyleDrop EU"
          hasError={!!currentErrors.store_name || duplicateError}
        />
        {duplicateError && <FieldError msg="You already have a client with this name" />}
        {!duplicateError && <FieldError msg={currentErrors.store_name} />}
      </div>

      {/* 2. Store Domain */}
      <div className="s3" style={wrap}>
        <FieldLabel label="Store Domain" optional />
        <TextInput
          value={form.store_domain}
          onChange={set('store_domain')}
          placeholder="e.g. styledrop.de"
        />
      </div>

      {/* 3. Niche */}
      <div className="s3" style={wrap}>
        <FieldLabel label="Niche" />
        <CustomDropdown
          options={NICHES}
          value={form.niche}
          onChange={set('niche')}
          placeholder="Select niche"
          hasError={!!currentErrors.niche}
        />
        <FieldError msg={currentErrors.niche} />
      </div>

      {/* 4. Market */}
      <div className="s3" style={wrap}>
        <FieldLabel label="Market" />
        <SearchableDropdown
          options={MARKETS}
          value={form.market}
          onChange={set('market')}
          placeholder="Select market"
          hasError={!!currentErrors.market}
        />
        {form.market === 'Other' && (
          <div style={{ marginTop: 12 }}>
            <TextInput
              value={form.market_other}
              onChange={set('market_other')}
              placeholder="Specify market"
              hasError={!!currentErrors.market}
            />
          </div>
        )}
        <FieldError msg={currentErrors.market} />
      </div>

      {/* 5. Language */}
      <div className="s4" style={wrap}>
        <FieldLabel label="Language" />
        <CustomDropdown
          options={LANGUAGES}
          value={form.language}
          onChange={set('language')}
          placeholder="Select language"
          hasError={!!currentErrors.language}
        />
        <FieldError msg={currentErrors.language} />
      </div>

      {/* 6. Expected Monthly Products */}
      <div className="s4" style={wrap}>
        <FieldLabel label="Expected Monthly Products" />
        <NumberInput
          value={form.expected_monthly_products}
          onChange={set('expected_monthly_products')}
          placeholder="e.g. 200"
          hasError={!!currentErrors.expected_monthly_products}
        />
        <FieldError msg={currentErrors.expected_monthly_products} />
        {!currentErrors.expected_monthly_products && <FieldHint msg="This helps us estimate your tier" />}
      </div>

      {/* 6b. Your Rate Per Product */}
      <div className="s4" style={wrap}>
        <FieldLabel label="Your Rate Per Product" optional />
        <div
          style={{ display: 'flex', alignItems: 'center', borderBottom: '1.5px solid #EEEEEE', transition: 'border-color 0.15s' }}
          onFocusCapture={e => (e.currentTarget.style.borderBottomColor = T.black)}
          onBlurCapture={e => (e.currentTarget.style.borderBottomColor = '#EEEEEE')}
        >
          <span style={{ fontSize: 15, color: T.ter, paddingRight: 6 }}>$</span>
          <input
            type="text"
            inputMode="decimal"
            value={form.va_rate_per_product}
            placeholder="0.65"
            onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('va_rate_per_product')(v) }}
            style={{
              flex: 1, fontSize: 15, color: T.black,
              background: 'none', border: 'none', outline: 'none',
              padding: '10px 0', fontFamily: 'inherit',
            }}
          />
        </div>
        <FieldHint msg="What do you charge this client per product?" />
        {!form.va_rate_per_product && (
          <div style={{ fontSize: 11, color: T.ghost, marginTop: 4 }}>
            You can set this later, but we recommend setting it now to track your earnings.
          </div>
        )}
        {parseFloat(form.va_rate_per_product) > 0 && parseFloat(form.va_rate_per_product) < 0.50 && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFFBEB', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>
              We recommend at least $0.50 per product.
            </p>
            <p style={{ fontSize: 12, color: '#B45309', margin: '4px 0 0' }}>
              At this rate your margins become too thin. Most operators charge $0.65–$1.20.
            </p>
          </div>
        )}
      </div>

      {/* 7. Title Preference */}
      <div className="s4" style={wrap}>
        <FieldLabel label="Title Preference" />
        <div style={{ paddingTop: 4 }}>
          <PillToggle options={TITLE_PREFS} value={form.title_preference} onChange={set('title_preference')} />
        </div>
        <FieldError msg={currentErrors.title_preference} />
      </div>

      {/* 8. Description Style */}
      <div className="s5" style={wrap}>
        <FieldLabel label="Description Style" />
        <div style={{ paddingTop: 4 }}>
          <PillToggle options={DESC_STYLES} value={form.description_style} onChange={set('description_style')} />
        </div>
        <FieldError msg={currentErrors.description_style} />
      </div>

      {/* 9. Payment Method */}
      <div className="s5" style={wrap}>
        <FieldLabel label="Your Payment Method With This Client" optional />
        <TextInput
          value={form.payment_method}
          onChange={set('payment_method')}
          placeholder="e.g. Upwork, PayPal, direct transfer"
        />
      </div>

      {/* 10. Start Date */}
      <div className="s5" style={wrap}>
        <FieldLabel label="Official Start Date" />
        <DateInput
          value={form.start_date}
          onChange={set('start_date')}
          hasError={!!currentErrors.start_date}
        />
        <FieldError msg={currentErrors.start_date} />
        {!currentErrors.start_date && <FieldHint msg="You must upload within 48 hours after approval" />}
      </div>

      {/* 11. Special Instructions */}
      <div className="s6" style={{ marginBottom: 32 }}>
        <FieldLabel label="Special Instructions" optional />
        <TextArea
          value={form.special_instructions}
          onChange={set('special_instructions')}
          placeholder="Any specific requirements from this client..."
        />
      </div>

      {/* ── Listing Preferences ─────────────────────────────── */}
      <div className="s6" style={{ marginBottom: 36 }}>
        <div style={{ marginTop: 36 }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 8 }}>
            LISTING PREFERENCES
          </p>
          <p style={{ fontSize: 13, color: '#999999', marginBottom: 16 }}>
            Does your client have specific listing requirements?
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            {[
              { value: true,  label: 'Yes, my client has custom requirements' },
              { value: false, label: "No, use HigherUp's optimized templates" },
            ].map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setHasCustomRequirements(opt.value)}
                style={{
                  flex: '1 1 200px', padding: '14px 20px', borderRadius: 12, textAlign: 'left' as const,
                  fontSize: 14, fontWeight: hasCustomRequirements === opt.value ? 500 : 400,
                  color: hasCustomRequirements === opt.value ? '#111111' : '#999999',
                  border: `1.5px solid ${hasCustomRequirements === opt.value ? '#111111' : '#EEEEEE'}`,
                  background: hasCustomRequirements === opt.value ? '#FAFAFA' : 'white',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* "No" confirmation block */}
        {hasCustomRequirements === false && (
          <div style={{ marginTop: 16, padding: 20, background: '#FAFAFA', borderRadius: 12 }}>
            <p style={{ fontSize: 14, color: '#111111' }}>We&apos;ll use our high-performance templates.</p>
            <p style={{ marginTop: 8, fontSize: 13, color: '#999999' }}>
              Built from 4.5 years of e-commerce experience across our own stores. Optimized for maximum visibility and conversions.
            </p>
          </div>
        )}

        {/* "Yes" expanded form */}
        {hasCustomRequirements === true && (
          <div style={{ marginTop: 24, padding: '24px', background: '#FAFAFA', borderRadius: 16, border: '1px solid #EEEEEE' }}>

            {/* Group 1 — PRICING STRATEGY */}
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 12 }}>
              PRICING STRATEGY
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 6 }}>Max discount %</p>
                <input
                  type="text"
                  inputMode="decimal"
                  value={customData.maxDiscount}
                  placeholder="e.g. 30"
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setCustomData(prev => ({ ...prev, maxDiscount: v })) }}
                  style={{
                    width: '100%', fontSize: 14, color: '#111111', background: 'white',
                    border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                />
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 6 }}>Price vs competitors (% under)</p>
                <input
                  type="text"
                  inputMode="decimal"
                  value={customData.competitorPriceDiff}
                  placeholder="e.g. 10"
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setCustomData(prev => ({ ...prev, competitorPriceDiff: v })) }}
                  style={{
                    width: '100%', fontSize: 14, color: '#111111', background: 'white',
                    border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                />
              </div>
            </div>

            {/* Pricing basis */}
            <div style={{ marginTop: 24 }}>
              <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 10 }}>Pricing basis</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {[
                  { value: 'compare_at', label: 'Discount from Compare At Price', sub: 'The CSV has a "Compare At Price" — the selling price is X% below it' },
                  { value: 'manual',     label: 'Prices are already set',          sub: 'Don\'t change prices — only optimize titles and descriptions' },
                ].map(opt => {
                  const sel = customData.pricingBasis === opt.value
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => setCustomData(prev => ({ ...prev, pricingBasis: sel ? '' : opt.value }))}
                      style={{
                        textAlign: 'left' as const, padding: '12px 14px', borderRadius: 10,
                        border: `1.5px solid ${sel ? '#111111' : '#EEEEEE'}`,
                        background: sel ? '#FAFAFA' : 'white',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 13, color: '#111111', fontWeight: sel ? 500 : 400 }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: '#CCCCCC', marginTop: 2 }}>{opt.sub}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Price ending — only relevant when compare_at mode selected */}
            {customData.pricingBasis === 'compare_at' && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 10 }}>Price ending</p>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                  {PRICE_ENDINGS.map(opt => {
                    const sel = customData.priceEnding === opt.value
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => setCustomData(prev => ({ ...prev, priceEnding: sel ? '' : opt.value }))}
                        style={{
                          padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                          border: `1.5px solid ${sel ? '#111111' : '#EEEEEE'}`,
                          background: sel ? '#FAFAFA' : 'white',
                          color: sel ? '#111111' : '#999999',
                          fontWeight: sel ? 500 : 400,
                          fontSize: 13, fontFamily: 'inherit', transition: 'all 0.15s',
                          display: 'flex', gap: 8, alignItems: 'center',
                        }}
                      >
                        <span>{opt.label}</span>
                        <span style={{ fontSize: 11, color: '#CCCCCC' }}>{opt.example}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Group 2 — ADVERTISING PLATFORM */}
            <div style={{ marginTop: 32 }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                ADVERTISING PLATFORM
              </p>
              <p style={{ fontSize: 12, color: '#999999', marginBottom: 12 }}>Where does your client advertise?</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {ADVERTISING_PLATFORMS.map(platform => {
                  const selected = customData.platform === platform
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => setCustomData(prev => ({ ...prev, platform: selected ? '' : platform }))}
                      style={{
                        fontSize: 13, padding: '7px 20px', borderRadius: 100,
                        border: `1.5px solid ${selected ? '#111111' : '#EEEEEE'}`,
                        background: selected ? '#FAFAFA' : 'white',
                        color: selected ? '#111111' : '#999999',
                        fontWeight: selected ? 500 : 400,
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                    >
                      {platform}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Group 3 — CLIENT PROMPTS */}
            <div style={{ marginTop: 32 }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                CLIENT PROMPTS
              </p>
              <p style={{ fontSize: 12, color: '#999999', marginBottom: 16 }}>
                If your client has specific instructions for how titles and descriptions should be written, paste them here.
              </p>
              <div>
                <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 6 }}>Title prompt</p>
                <textarea
                  value={customData.titlePrompt}
                  onChange={e => setCustomData(prev => ({ ...prev, titlePrompt: e.target.value }))}
                  placeholder="e.g. Always start with the brand name, then product type, then key feature. Max 150 characters. No emoji."
                  maxLength={50000}
                  style={{
                    width: '100%', fontSize: 13, color: '#111111', background: 'white',
                    border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical', minHeight: 100, lineHeight: 1.6, transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                />
              </div>
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 6 }}>Description prompt</p>
                <textarea
                  value={customData.descriptionPrompt}
                  onChange={e => setCustomData(prev => ({ ...prev, descriptionPrompt: e.target.value }))}
                  placeholder="e.g. Start with a one-line hook, then 4 bullet points with features, then a closing line. Always mention material and sizing."
                  maxLength={50000}
                  style={{
                    width: '100%', fontSize: 13, color: '#111111', background: 'white',
                    border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical', minHeight: 100, lineHeight: 1.6, transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                />
              </div>
            </div>

            {/* Group 4 — SKU & INVENTORY */}
            <div style={{ marginTop: 32 }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 12 }}>
                SKU &amp; INVENTORY
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 6 }}>SKU structure</p>
                  <input
                    type="text"
                    value={customData.skuStructure}
                    placeholder="e.g. BRAND-CATEGORY-COLOR-SIZE"
                    onChange={e => setCustomData(prev => ({ ...prev, skuStructure: e.target.value }))}
                    style={{
                      width: '100%', fontSize: 14, color: '#111111', background: 'white',
                      border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                      outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 6 }}>Average stock per product</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customData.avgStock}
                    placeholder="e.g. 50"
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setCustomData(prev => ({ ...prev, avgStock: v })) }}
                    style={{
                      width: '100%', fontSize: 14, color: '#111111', background: 'white',
                      border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                      outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                  />
                </div>
              </div>
            </div>

            {/* Group 5 — COLLECTIONS */}
            <div style={{ marginTop: 32 }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 12 }}>
                COLLECTIONS
              </p>
              <textarea
                value={customData.collections}
                onChange={e => setCustomData(prev => ({ ...prev, collections: e.target.value }))}
                placeholder={'e.g.\nSukienki Letnie\nSukienki Wieczorowe\nBluzki i Koszule'}
                style={{
                  width: '100%', fontSize: 13, color: '#111111', background: 'white',
                  border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                  outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
                  resize: 'vertical', height: 120, lineHeight: 1.6, transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
              />
              <p style={{ fontSize: 11, color: '#CCCCCC', marginTop: 6 }}>One collection per line. Original names.</p>
            </div>

            {/* Group 6 — ADDITIONAL INFO */}
            <div style={{ marginTop: 32 }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 12 }}>
                ADDITIONAL INFO
              </p>

              {/* File upload */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 8 }}>Attachments</p>
                {regSelectedFiles.map((file, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#111111', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                    <span style={{ fontSize: 11, color: '#CCCCCC', flexShrink: 0 }}>
                      {file.size < 1024 * 1024 ? (file.size / 1024).toFixed(0) + ' KB' : (file.size / (1024 * 1024)).toFixed(1) + ' MB'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRegSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ fontSize: 16, color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                    >×</button>
                  </div>
                ))}
                {regSelectedFiles.length < 5 && (
                  <label
                    style={{ display: 'inline-block', marginTop: 4, fontSize: 13, color: '#CCCCCC', cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#111111' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#CCCCCC' }}
                  >
                    + Add file
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.csv"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const newFiles = Array.from(e.target.files || [])
                        const combined = [...regSelectedFiles, ...newFiles].slice(0, 5)
                        const oversized = combined.filter(f => f.size > 5 * 1024 * 1024)
                        if (oversized.length > 0) { alert(`Files exceed 5MB: ${oversized.map(f => f.name).join(', ')}`); return }
                        setRegSelectedFiles(combined)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
                <p style={{ fontSize: 11, color: '#DDDDDD', marginTop: 6 }}>Max 5 files · 5MB each</p>
              </div>

              {/* Additional notes */}
              <div>
                <p style={{ fontSize: 11, color: '#CCCCCC', marginBottom: 6 }}>Additional notes</p>
                <textarea
                  value={customData.additionalNotes}
                  onChange={e => setCustomData(prev => ({ ...prev, additionalNotes: e.target.value }))}
                  placeholder="Any other requirements, brand guidelines, or context..."
                  style={{
                    width: '100%', fontSize: 13, color: '#111111', background: 'white',
                    border: '1px solid #EEEEEE', borderRadius: 8, padding: '10px 12px',
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical', minHeight: 80, lineHeight: 1.6, transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                />
              </div>
            </div>

            {/* Bottom note */}
            <p style={{ fontSize: 11, color: '#CCCCCC', marginTop: 20, fontStyle: 'italic' }}>
              All fields are optional. Fill in what you know — we&apos;ll figure out the rest.
            </p>
          </div>
        )}
      </div>

      {/* ── 48h Confirmation ─────────────────────────────────── */}
      <div className="s6" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 32 }}>
        <CustomCheckbox checked={confirmed} onChange={setConfirmed} />
        <span style={{ fontSize: 12, color: T.sec, lineHeight: 1.5, paddingTop: 1 }}>
          I confirm that I will start serving this client within 48 hours of approval.
        </span>
      </div>

      {/* ── Submit ───────────────────────────────────────────── */}
      <div className="s7" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          style={{
            fontSize: 13, fontWeight: 500,
            padding: '14px 36px', borderRadius: 100, border: 'none',
            background: submitDisabled ? '#EEEEEE' : T.black,
            color: submitDisabled ? T.ter : '#FFFFFF',
            cursor: submitDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: submitting ? 0.6 : 1,
            animation: submitting ? 'pulse 1.5s ease infinite' : 'none',
            transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            if (!submitDisabled) {
              e.currentTarget.style.background = '#333333'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
            }
          }}
          onMouseLeave={e => {
            if (!submitDisabled) {
              e.currentTarget.style.background = T.black
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }
          }}
        >
          {submitting ? 'Submitting...' : 'Submit for review'}
        </button>

        {submitError && (
          <div style={{ fontSize: 12, color: T.sec }}>
            Something went wrong.{' '}
            <button
              onClick={handleSubmit}
              style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}
            >Try again</button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 80, textAlign: 'center' }}>
        <span style={{ fontSize: 10, color: '#E8E8E8', letterSpacing: '0.05em' }}>HIGHERUP</span>
      </div>
    </div>
  )
}
