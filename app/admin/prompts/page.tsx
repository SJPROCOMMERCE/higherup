'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Prompt, PromptVersion } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { SelectAllCheckbox } from '@/components/admin/SelectAllCheckbox'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  sec:    '#555555',
  ter:    '#999999',
  ghost:  '#CCCCCC',
  div:    '#EEEEEE',
  bg:     '#FFFFFF',
  green:  '#00A550',
  red:    '#CC3300',
  orange: '#FF6600',
  blue:   '#0055CC',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NICHE_OPTIONS = [
  { value: 'fashion',     label: 'Fashion' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'beauty',      label: 'Beauty' },
  { value: 'home_garden', label: 'Home & Garden' },
  { value: 'health',      label: 'Health' },
  { value: 'sports',      label: 'Sports' },
  { value: 'other',       label: 'Other / General' },
]

const LANGUAGE_OPTIONS = [
  { value: 'english',    label: 'English' },
  { value: 'german',     label: 'German' },
  { value: 'french',     label: 'French' },
  { value: 'dutch',      label: 'Dutch' },
  { value: 'spanish',    label: 'Spanish' },
  { value: 'polish',     label: 'Polish' },
  { value: 'portuguese', label: 'Portuguese' },
  { value: 'italian',    label: 'Italian' },
  { value: 'swedish',    label: 'Swedish' },
  { value: 'danish',     label: 'Danish' },
  { value: 'norwegian',  label: 'Norwegian' },
  { value: 'other',      label: 'Other' },
]

const NICHE_LABELS: Record<string, string> = Object.fromEntries(NICHE_OPTIONS.map(o => [o.value, o.label]))
const LANG_LABELS:  Record<string, string> = Object.fromEntries(LANGUAGE_OPTIONS.map(o => [o.value, o.label]))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function isPlaceholder(text: string | null | undefined): boolean {
  return !!text?.startsWith('[PLACEHOLDER')
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) !== 1 ? 's' : ''} ago`
}

// ─── Default prompt selection fallback logic ──────────────────────────────────
// When assigning a prompt template to a client, the priority order is:
//  1. Exact match: same niche + same language
//  2. Niche match + English (if no template for that language)
//  3. General (other) + same language
//  4. General (other) + English — final fallback
//
// This logic is applied in the client approval flow (/admin/approvals, /admin/clients)
// when the recommended prompt is highlighted. See getRecommendedPrompt() below.

export function getRecommendedPrompt(
  prompts: Prompt[],
  niche: string | null,
  language: string | null
): { prompt: Prompt; reason: string } | null {
  const active = prompts.filter(p => p.is_active)
  // 1. Exact
  const exact = active.find(p => p.niche === niche && p.language === language)
  if (exact) return { prompt: exact, reason: `Exact match: ${niche} + ${language}` }
  // 2. Niche + English
  if (language !== 'english') {
    const nicheEn = active.find(p => p.niche === niche && p.language === 'english')
    if (nicheEn) return { prompt: nicheEn, reason: `Niche match: ${niche} + English (no ${language} template)` }
  }
  // 3. General + language
  const genLang = active.find(p => p.niche === 'other' && p.language === language)
  if (genLang) return { prompt: genLang, reason: `Language match: General + ${language}` }
  // 4. General + English
  const genEn = active.find(p => p.niche === 'other' && p.language === 'english')
  if (genEn) return { prompt: genEn, reason: `Fallback: General — English` }
  return null
}

// ─── Field components ─────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: T.ghost, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {children}{required && <span style={{ color: T.red, marginLeft: 2 }}>*</span>}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', fontSize: 13, color: T.black,
        border: `1px solid ${T.div}`, borderRadius: 6,
        padding: '8px 10px', fontFamily: 'inherit', outline: 'none',
        boxSizing: 'border-box', transition: 'border-color 0.15s',
      }}
      onFocus={e => { e.target.style.borderColor = T.black }}
      onBlur={e => { e.target.style.borderColor = T.div }}
    />
  )
}

function TextArea({
  value, onChange, placeholder, rows = 4, mono,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', fontSize: mono ? 12 : 13,
        color: isPlaceholder(value) ? T.ghost : T.black,
        border: `1px solid ${T.div}`, borderRadius: 6,
        padding: '8px 10px', fontFamily: mono ? 'monospace' : 'inherit',
        outline: 'none', resize: 'vertical', boxSizing: 'border-box',
        lineHeight: 1.6, transition: 'border-color 0.15s',
      }}
      onFocus={e => { e.target.style.borderColor = T.black }}
      onBlur={e => { e.target.style.borderColor = T.div }}
    />
  )
}

function SelectInput({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', fontSize: 13, color: T.black,
        border: `1px solid ${T.div}`, borderRadius: 6,
        padding: '8px 10px', fontFamily: 'inherit', outline: 'none',
        background: T.bg, cursor: 'pointer', boxSizing: 'border-box',
      }}
    >
      <option value="">— not set —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10, position: 'relative',
          background: checked ? T.black : T.div,
          transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
        }}
      >
        <span style={{
          position: 'absolute', top: 2,
          left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#FFFFFF', transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 13, color: T.black }}>{label}</span>
    </label>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.12em', color: T.ghost, marginTop: 24, marginBottom: 14,
      paddingBottom: 8, borderBottom: `1px solid ${T.div}`,
    }}>
      {children}
    </div>
  )
}

// ─── Version history ──────────────────────────────────────────────────────────

function VersionHistory({ promptId, currentVersion }: { promptId: string; currentVersion: number }) {
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_id', promptId)
      .order('version', { ascending: false })
      .then(({ data }) => {
        setVersions((data ?? []) as PromptVersion[])
        setLoading(false)
      })
  }, [promptId])

  if (loading) return <div style={{ fontSize: 12, color: T.ghost }}>Loading versions…</div>
  if (versions.length === 0) return (
    <div style={{ fontSize: 13, color: T.ghost }}>
      No saved versions yet. Previous versions are stored automatically on each save.
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 12, color: T.ghost, marginBottom: 12 }}>
        Current: v{currentVersion} · {versions.length} previous version{versions.length !== 1 ? 's' : ''} saved
      </div>
      {versions.map(v => (
        <div key={v.id} style={{ borderBottom: `1px solid ${T.div}` }}>
          <div
            onClick={() => setExpanded(expanded === v.id ? null : v.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBlock: 10, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>v{v.version}</span>
            <span style={{ fontSize: 12, color: T.ter, flex: 1 }}>{formatDateTime(v.created_at)}</span>
            {v.change_notes && (
              <span style={{ fontSize: 12, color: T.ter, fontStyle: 'italic' }}>{v.change_notes}</span>
            )}
            {v.changed_by && (
              <span style={{ fontSize: 11, color: T.ghost }}>by {v.changed_by}</span>
            )}
            <span style={{ fontSize: 11, color: T.ghost }}>{expanded === v.id ? '▲' : '▼'}</span>
          </div>
          {expanded === v.id && (
            <div style={{ paddingBottom: 16, paddingLeft: 8 }}>
              {v.system_prompt && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>SYSTEM PROMPT</div>
                  <div style={{
                    fontSize: 12, color: T.sec, fontFamily: 'monospace',
                    background: '#F8F8F8', padding: '10px 12px', borderRadius: 6,
                    lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {v.system_prompt}
                  </div>
                </div>
              )}
              {v.title_instructions && (
                <div style={{ fontSize: 12, color: T.ter, marginBottom: 8 }}>
                  <span style={{ color: T.ghost }}>Titles: </span>{v.title_instructions.slice(0, 200)}{v.title_instructions.length > 200 ? '…' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Edit form ────────────────────────────────────────────────────────────────

type DraftPrompt = {
  name: string
  description: string
  niche: string
  language: string
  market: string
  system_prompt: string
  title_prompt: string
  description_prompt: string
  title_instructions: string
  description_instructions: string
  seo_instructions: string
  formatting_rules: string
  alt_text_instructions: string
  filename_instructions: string
  tags_instructions: string
  price_rules_instructions: string
  tone_examples: string
  title_examples: string
  description_examples: string
  forbidden_words: string
  required_keywords: string
  max_title_length: string
  max_description_length: string
  html_allowed: boolean
  emoji_allowed: boolean
  is_active: boolean
  is_default: boolean
  change_notes: string
}

function toDraft(p: Prompt): DraftPrompt {
  return {
    name:                     p.name ?? '',
    description:              p.description ?? '',
    niche:                    p.niche ?? '',
    language:                 p.language ?? '',
    market:                   p.market ?? '',
    system_prompt:            p.system_prompt ?? '',
    title_prompt:             p.title_prompt ?? '',
    description_prompt:       p.description_prompt ?? '',
    title_instructions:       p.title_instructions ?? '',
    description_instructions: p.description_instructions ?? '',
    seo_instructions:         p.seo_instructions ?? '',
    formatting_rules:         p.formatting_rules ?? '',
    alt_text_instructions:    p.alt_text_instructions ?? '',
    filename_instructions:    p.filename_instructions ?? '',
    tags_instructions:        p.tags_instructions ?? '',
    price_rules_instructions: p.price_rules_instructions ?? '',
    tone_examples:            p.tone_examples ?? '',
    title_examples:           p.title_examples ?? '',
    description_examples:     p.description_examples ?? '',
    forbidden_words:          p.forbidden_words ?? '',
    required_keywords:        p.required_keywords ?? '',
    max_title_length:         p.max_title_length?.toString() ?? '',
    max_description_length:   p.max_description_length?.toString() ?? '',
    html_allowed:             p.allow_html ?? true,
    emoji_allowed:            p.allow_emoji ?? false,
    is_active:                p.is_active ?? true,
    is_default:               p.is_default ?? false,
    change_notes:             '',
  }
}

function EditForm({
  draft,
  onChange,
}: {
  draft: DraftPrompt
  onChange: (field: keyof DraftPrompt, value: string | boolean) => void
}) {
  const set = (field: keyof DraftPrompt) => (v: string | boolean) => onChange(field, v)

  return (
    <div>
      {/* ── Identity ─────────────────────────────────────────────── */}
      <SectionLabel>Identity</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <FieldLabel required>Template name</FieldLabel>
          <TextInput value={draft.name} onChange={set('name')} placeholder="Fashion — German — Emotional" />
        </div>
        <div>
          <FieldLabel>Niche</FieldLabel>
          <SelectInput value={draft.niche} onChange={set('niche')} options={NICHE_OPTIONS} />
        </div>
        <div>
          <FieldLabel>Language</FieldLabel>
          <SelectInput value={draft.language} onChange={set('language')} options={LANGUAGE_OPTIONS} />
        </div>
        <div>
          <FieldLabel>Market</FieldLabel>
          <TextInput value={draft.market} onChange={set('market')} placeholder="e.g. Germany" />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <FieldLabel>Description</FieldLabel>
        <TextInput value={draft.description} onChange={set('description')} placeholder="Short description for admin reference" />
      </div>

      {/* ── System Prompt ─────────────────────────────────────────── */}
      <SectionLabel>System Prompt</SectionLabel>
      <div style={{ marginBottom: 8 }}>
        <FieldLabel required>Main system prompt</FieldLabel>
        <TextArea
          value={draft.system_prompt}
          onChange={set('system_prompt')}
          placeholder="[Write the main system prompt here. This is the core instruction sent to Claude for every product.]"
          rows={10}
          mono
        />
      </div>
      <div style={{ fontSize: 12, color: T.ghost, marginBottom: 4 }}>
        This is the primary instruction. Be specific about tone, role, output format, and what to do with the product data.
      </div>

      {/* ── Full Prompts ──────────────────────────────────────────── */}
      <SectionLabel>Full Prompts</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <FieldLabel>Title prompt</FieldLabel>
          <TextArea
            value={draft.title_prompt}
            onChange={set('title_prompt')}
            placeholder="Full prompt document for title optimisation…"
            rows={8}
            mono
          />
        </div>
        <div>
          <FieldLabel>Description prompt</FieldLabel>
          <TextArea
            value={draft.description_prompt}
            onChange={set('description_prompt')}
            placeholder="Full prompt document for description optimisation…"
            rows={8}
            mono
          />
        </div>
      </div>

      {/* ── Field Instructions ────────────────────────────────────── */}
      <SectionLabel>Field Instructions</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <FieldLabel>Title instructions</FieldLabel>
          <TextArea value={draft.title_instructions} onChange={set('title_instructions')} rows={4}
            placeholder="How to write product titles: length, structure, SEO keywords, brand placement…" />
        </div>
        <div>
          <FieldLabel>Description instructions</FieldLabel>
          <TextArea value={draft.description_instructions} onChange={set('description_instructions')} rows={4}
            placeholder="How to write product descriptions: structure, tone, HTML usage, paragraph count…" />
        </div>
        <div>
          <FieldLabel>SEO instructions</FieldLabel>
          <TextArea value={draft.seo_instructions} onChange={set('seo_instructions')} rows={4}
            placeholder="Rules for SEO title and meta description: length limits, keyword density, CTA…" />
        </div>
        <div>
          <FieldLabel>Tags / keywords instructions</FieldLabel>
          <TextArea value={draft.tags_instructions} onChange={set('tags_instructions')} rows={4}
            placeholder="How many tags, format, what to include (brand, material, style, use case)…" />
        </div>
        <div>
          <FieldLabel>Formatting rules</FieldLabel>
          <TextArea value={draft.formatting_rules} onChange={set('formatting_rules')} rows={4}
            placeholder="Output structure: use of HTML tags, bullet points, line breaks, headings…" />
        </div>
        <div>
          <FieldLabel>Alt text instructions</FieldLabel>
          <TextArea value={draft.alt_text_instructions} onChange={set('alt_text_instructions')} rows={4}
            placeholder="How to write image alt text: describe the product, include keywords, max length…" />
        </div>
        <div>
          <FieldLabel>Filename instructions</FieldLabel>
          <TextArea value={draft.filename_instructions} onChange={set('filename_instructions')} rows={3}
            placeholder="How to generate SEO-friendly image filenames: lowercase, hyphens, keywords…" />
        </div>
        <div>
          <FieldLabel>Price rules instructions</FieldLabel>
          <TextArea value={draft.price_rules_instructions} onChange={set('price_rules_instructions')} rows={3}
            placeholder="How the AI should handle price adjustments: rounding rules, margin suggestions…" />
        </div>
      </div>

      {/* ── Examples ──────────────────────────────────────────────── */}
      <SectionLabel>Examples & Tone</SectionLabel>
      <div style={{ marginBottom: 12 }}>
        <FieldLabel>Tone examples</FieldLabel>
        <TextArea value={draft.tone_examples} onChange={set('tone_examples')} rows={4}
          placeholder="2-3 short example phrases that capture the exact tone you want. The AI will learn from these." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <FieldLabel>Title examples</FieldLabel>
          <TextArea value={draft.title_examples} onChange={set('title_examples')} rows={5}
            placeholder="3-5 example product titles as reference. One per line." />
        </div>
        <div>
          <FieldLabel>Description examples</FieldLabel>
          <TextArea value={draft.description_examples} onChange={set('description_examples')} rows={5}
            placeholder="1-2 example product descriptions as reference." />
        </div>
      </div>

      {/* ── Quality Controls ──────────────────────────────────────── */}
      <SectionLabel>Quality Controls</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <FieldLabel>Forbidden words</FieldLabel>
          <TextArea value={draft.forbidden_words} onChange={set('forbidden_words')} rows={3}
            placeholder="Comma-separated words the AI must NEVER use: amazing, revolutionary, game-changer…" />
        </div>
        <div>
          <FieldLabel>Required keywords</FieldLabel>
          <TextArea value={draft.required_keywords} onChange={set('required_keywords')} rows={3}
            placeholder="Comma-separated words that MUST appear somewhere in each output…" />
        </div>
        <div>
          <FieldLabel>Max title length (chars)</FieldLabel>
          <TextInput value={draft.max_title_length} onChange={set('max_title_length')} placeholder="e.g. 80 (leave blank for no limit)" />
        </div>
        <div>
          <FieldLabel>Max description length (chars)</FieldLabel>
          <TextInput value={draft.max_description_length} onChange={set('max_description_length')} placeholder="e.g. 2000 (leave blank for no limit)" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 32 }}>
        <Toggle checked={draft.html_allowed} onChange={set('html_allowed')} label="HTML allowed in descriptions" />
        <Toggle checked={draft.emoji_allowed} onChange={set('emoji_allowed')} label="Emoji allowed" />
      </div>

      {/* ── Settings ──────────────────────────────────────────────── */}
      <SectionLabel>Settings</SectionLabel>
      <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
        <Toggle checked={draft.is_active} onChange={set('is_active')} label="Active (available for assignment to clients)" />
        <Toggle checked={draft.is_default} onChange={set('is_default')} label="Default for this niche + language" />
      </div>

      {/* ── Change notes ──────────────────────────────────────────── */}
      <SectionLabel>Save notes</SectionLabel>
      <div>
        <FieldLabel>Change notes (optional)</FieldLabel>
        <TextInput value={draft.change_notes} onChange={set('change_notes')} placeholder="What changed in this version? e.g. 'Improved title instructions, added examples'" />
      </div>
    </div>
  )
}

// ─── Variables detection ──────────────────────────────────────────────────────

function detectVariables(prompt: Prompt): Array<{ name: string; usedIn: string[] }> {
  const VAR_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g
  const fields: Array<[string, string | null]> = [
    ['system_prompt', prompt.system_prompt],
    ['title_instructions', prompt.title_instructions],
    ['description_instructions', prompt.description_instructions],
    ['seo_instructions', prompt.seo_instructions],
    ['tags_instructions', prompt.tags_instructions],
    ['formatting_rules', prompt.formatting_rules],
  ]
  const varMap = new Map<string, string[]>()
  for (const [fieldName, fieldText] of fields) {
    if (!fieldText) continue
    let m: RegExpExecArray | null
    const re = new RegExp(VAR_RE.source, 'g')
    while ((m = re.exec(fieldText)) !== null) {
      const varName = m[1]
      if (!varMap.has(varName)) varMap.set(varName, [])
      varMap.get(varName)!.push(fieldName)
    }
  }
  return Array.from(varMap.entries()).map(([name, usedIn]) => ({ name, usedIn }))
}

// ─── Linked clients sub-component ────────────────────────────────────────────

type LinkedClientRow = {
  client_id: string
  store_name: string
  va_name: string
  niche: string | null
  market: string | null
}

type AllClientForLink = {
  id: string
  store_name: string
  va_name: string
  current_prompt: string | null
}

function LinkedClientsPanel({ promptId, promptName }: { promptId: string; promptName: string }) {
  const [linkedClients, setLinkedClients] = useState<LinkedClientRow[] | null>(null)
  const [linkedLoading, setLinkedLoading] = useState(false)
  const [showLinkDropdown, setShowLinkDropdown] = useState(false)
  const [allClientsForLink, setAllClientsForLink] = useState<AllClientForLink[]>([])
  const [linkSearch, setLinkSearch] = useState('')
  const [linkConfirmClient, setLinkConfirmClient] = useState<AllClientForLink | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)

  const loadLinked = useCallback(async () => {
    setLinkedLoading(true)
    const { data } = await supabase
      .from('client_profiles')
      .select('client_id, clients(store_name, niche, market, va_id, vas(name))')
      .eq('prompt_id', promptId)

    if (data) {
      const rows: LinkedClientRow[] = (data as Record<string, unknown>[]).map((row) => {
        const client = row.clients as Record<string, unknown> | null
        const vas = client?.vas as Record<string, unknown> | null
        return {
          client_id: row.client_id as string,
          store_name: (client?.store_name as string) ?? '—',
          va_name: (vas?.name as string) ?? '—',
          niche: (client?.niche as string | null) ?? null,
          market: (client?.market as string | null) ?? null,
        }
      })
      setLinkedClients(rows)
    } else {
      setLinkedClients([])
    }
    setLinkedLoading(false)
  }, [promptId])

  useEffect(() => {
    loadLinked()
  }, [loadLinked])

  async function handleUnlink(clientId: string) {
    await supabase
      .from('client_profiles')
      .delete()
      .eq('client_id', clientId)
      .eq('prompt_id', promptId)
    await loadLinked()
  }

  async function loadAllClients() {
    setLinkLoading(true)
    const { data: profileData } = await supabase
      .from('client_profiles')
      .select('client_id, prompt_id, prompts(name)')

    const profileMap: Record<string, string | null> = {}
    if (profileData) {
      for (const row of profileData as Record<string, unknown>[]) {
        const pRow = row.prompts as Record<string, unknown> | null
        profileMap[row.client_id as string] = (pRow?.name as string | null) ?? null
      }
    }

    const { data: clientData } = await supabase
      .from('clients')
      .select('id, store_name, va_id, vas(name)')
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .order('store_name', { ascending: true })

    if (clientData) {
      const rows: AllClientForLink[] = (clientData as Record<string, unknown>[]).map((c) => {
        const vas = c.vas as Record<string, unknown> | null
        return {
          id: c.id as string,
          store_name: c.store_name as string,
          va_name: (vas?.name as string) ?? '—',
          current_prompt: profileMap[c.id as string] ?? null,
        }
      })
      setAllClientsForLink(rows)
    }
    setLinkLoading(false)
    setShowLinkDropdown(true)
  }

  async function confirmLink(client: AllClientForLink) {
    await supabase
      .from('client_profiles')
      .upsert({ client_id: client.id, prompt_id: promptId, updated_by: 'admin', updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    setLinkConfirmClient(null)
    setShowLinkDropdown(false)
    await loadLinked()
    void logActivity({
      action: 'prompt_linked',
      source: 'admin',
      details: `Linked prompt "${promptName}" to client "${client.store_name}"`,
    })
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.div}` }}>
      <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        LINKED CLIENTS ({linkedLoading ? '…' : (linkedClients?.length ?? 0)})
      </div>

      {linkedLoading && <div style={{ fontSize: 12, color: T.ghost }}>Loading…</div>}

      {!linkedLoading && linkedClients && linkedClients.length === 0 && (
        <div style={{ fontSize: 12, color: T.ghost, marginBottom: 8 }}>No clients linked to this template.</div>
      )}

      {!linkedLoading && linkedClients && linkedClients.map(c => (
        <div key={c.client_id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 5, borderBottom: `1px solid ${T.div}` }}>
          <span style={{ fontSize: 13, color: T.black, flex: 1 }}>{c.store_name}</span>
          <span style={{ fontSize: 12, color: T.ter }}> · {c.va_name}</span>
          {c.niche && (
            <span style={{ fontSize: 10, color: T.sec, border: `1px solid ${T.div}`, borderRadius: 100, padding: '1px 7px' }}>
              {NICHE_LABELS[c.niche] ?? c.niche}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove ${c.store_name} from this template? They will fall back to the default template.`)) {
                void handleUnlink(c.client_id)
              }
            }}
            style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = T.black}
            onMouseLeave={e => e.currentTarget.style.color = T.ghost}
          >Unlink</button>
        </div>
      ))}

      {/* Link to another client */}
      {!showLinkDropdown && (
        <button
          type="button"
          onClick={() => { setLinkSearch(''); loadAllClients() }}
          disabled={linkLoading}
          style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 10, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.black}
          onMouseLeave={e => e.currentTarget.style.color = T.ghost}
        >
          {linkLoading ? 'Loading clients…' : '+ Link to another client'}
        </button>
      )}

      {showLinkDropdown && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Search clients…"
              value={linkSearch}
              onChange={e => { setLinkSearch(e.target.value); setLinkConfirmClient(null) }}
              autoFocus
              style={{ fontSize: 12, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '6px 10px', fontFamily: 'inherit', outline: 'none', background: T.bg, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => { setShowLinkDropdown(false); setLinkConfirmClient(null); setLinkSearch('') }}
              style={{ fontSize: 11, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >Cancel</button>
          </div>
          {(() => {
            const q = linkSearch.trim().toLowerCase()
            const matches = q
              ? allClientsForLink.filter(c => c.store_name.toLowerCase().includes(q) || c.va_name.toLowerCase().includes(q))
              : allClientsForLink.slice(0, 10)
            if (matches.length === 0) {
              return <div style={{ fontSize: 12, color: T.ghost, paddingBlock: 4 }}>No clients found.</div>
            }
            return (
              <div style={{ border: `1px solid ${T.div}`, borderRadius: 6, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
                {matches.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setLinkConfirmClient(c)}
                    style={{
                      padding: '7px 10px', cursor: 'pointer', fontSize: 12,
                      background: linkConfirmClient?.id === c.id ? T.div : T.bg,
                      borderBottom: `1px solid ${T.div}`,
                    }}
                    onMouseEnter={e => { if (linkConfirmClient?.id !== c.id) (e.currentTarget as HTMLDivElement).style.background = '#F8F8F8' }}
                    onMouseLeave={e => { if (linkConfirmClient?.id !== c.id) (e.currentTarget as HTMLDivElement).style.background = T.bg }}
                  >
                    <span style={{ color: T.black }}>{c.store_name}</span>
                    <span style={{ color: T.ter }}> · {c.va_name}</span>
                    {c.current_prompt && (
                      <span style={{ color: T.ghost }}> · currently: {c.current_prompt}</span>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {linkConfirmClient && (
        <div style={{ marginTop: 8, fontSize: 12, color: T.sec }}>
          {linkConfirmClient.current_prompt
            ? `This will replace their current template (${linkConfirmClient.current_prompt}). Continue?`
            : `Link "${linkConfirmClient.store_name}" to this template? Continue?`}
          {' '}
          <button
            onClick={() => confirmLink(linkConfirmClient)}
            style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 500 }}
          >Confirm</button>
          {' / '}
          <button
            onClick={() => setLinkConfirmClient(null)}
            style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >Cancel</button>
        </div>
      )}
    </div>
  )
}

// ─── Test panel sub-component ─────────────────────────────────────────────────

type TestResult = {
  title: string
  description: string
  seo_title: string
  seo_description: string
  tags: string
  tokens_in: number
  tokens_out: number
  cost: number
}

type RecentUpload = {
  id: string
  store_name: string | null
  original_filename: string | null
}

function TestPanel({ promptId }: { promptId: string }) {
  const [testTab, setTestTab] = useState<'manual' | 'real'>('manual')
  const [testTitle, setTestTitle] = useState('')
  const [testDesc, setTestDesc] = useState('')
  const [testPrice, setTestPrice] = useState('')
  const [testTags, setTestTags] = useState('')
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  // Real data tab
  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([])
  const [uploadsLoading, setUploadsLoading] = useState(false)
  const [selectedUploadId, setSelectedUploadId] = useState('')

  useEffect(() => {
    if (testTab === 'real' && recentUploads.length === 0) {
      setUploadsLoading(true)
      supabase
        .from('uploads')
        .select('id, store_name, original_filename')
        .eq('status', 'done')
        .order('uploaded_at', { ascending: false })
        .limit(10)
        .then(({ data }) => {
          setRecentUploads((data ?? []) as RecentUpload[])
          setUploadsLoading(false)
        })
    }
  }, [testTab, recentUploads.length])

  async function runManualTest() {
    if (!testTitle.trim()) return
    setTestRunning(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await fetch('/api/prompts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: promptId, title: testTitle, description: testDesc, price: testPrice, tags: testTags }),
      })
      if (!res.ok) {
        const text = await res.text()
        setTestError(text || `Error ${res.status}`)
      } else {
        const json = await res.json() as TestResult
        setTestResult(json)
      }
    } catch (err) {
      setTestError(String(err))
    }
    setTestRunning(false)
  }

  async function runRealTest() {
    if (!selectedUploadId) return
    setTestRunning(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await fetch('/api/prompts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: promptId, upload_id: selectedUploadId }),
      })
      if (!res.ok) {
        const text = await res.text()
        setTestError(text || `Error ${res.status}`)
      } else {
        const json = await res.json() as TestResult
        setTestResult(json)
      }
    } catch (err) {
      setTestError(String(err))
    }
    setTestRunning(false)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: active ? 500 : 400,
    color: active ? T.black : T.ghost,
    background: active ? T.div : 'none',
    border: 'none', borderRadius: 100, padding: '4px 12px',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
  })

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.div}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          TEST THIS PROMPT
        </div>
        <button style={tabStyle(testTab === 'manual')} onClick={() => setTestTab('manual')}>Manual</button>
        <button style={tabStyle(testTab === 'real')} onClick={() => setTestTab('real')}>Real data</button>
      </div>

      {testTab === 'manual' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>PRODUCT TITLE</div>
            <input
              value={testTitle}
              onChange={e => setTestTitle(e.target.value)}
              placeholder="Enter product title…"
              style={{ width: '100%', fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>PRODUCT DESCRIPTION</div>
            <textarea
              value={testDesc}
              onChange={e => setTestDesc(e.target.value)}
              placeholder="Enter product description…"
              rows={4}
              style={{ width: '100%', fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>PRICE (optional)</div>
              <input
                value={testPrice}
                onChange={e => setTestPrice(e.target.value)}
                placeholder="e.g. 29.99"
                style={{ width: '100%', fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>TAGS (optional)</div>
              <input
                value={testTags}
                onChange={e => setTestTags(e.target.value)}
                placeholder="e.g. summer, dress, casual"
                style={{ width: '100%', fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <button
            onClick={runManualTest}
            disabled={testRunning || !testTitle.trim()}
            style={{
              fontSize: 13, fontWeight: 500, color: '#FFFFFF',
              background: T.black, border: 'none', borderRadius: 100,
              padding: '8px 20px', cursor: testRunning || !testTitle.trim() ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: testRunning || !testTitle.trim() ? 0.5 : 1,
            }}
          >
            {testRunning ? 'Running…' : 'Run test'}
          </button>
        </div>
      )}

      {testTab === 'real' && (
        <div>
          <div style={{ fontSize: 12, color: T.sec, marginBottom: 8 }}>Test with a recent upload</div>
          {uploadsLoading && <div style={{ fontSize: 12, color: T.ghost }}>Loading uploads…</div>}
          {!uploadsLoading && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <select
                value={selectedUploadId}
                onChange={e => setSelectedUploadId(e.target.value)}
                style={{ flex: 1, fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', background: T.bg }}
              >
                <option value="">Select an upload…</option>
                {recentUploads.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.store_name ?? '—'} — {u.original_filename ?? u.id}
                  </option>
                ))}
              </select>
              <button
                onClick={runRealTest}
                disabled={testRunning || !selectedUploadId}
                style={{
                  fontSize: 13, fontWeight: 500, color: '#FFFFFF',
                  background: T.black, border: 'none', borderRadius: 100,
                  padding: '8px 20px', cursor: testRunning || !selectedUploadId ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: testRunning || !selectedUploadId ? 0.5 : 1,
                }}
              >
                {testRunning ? 'Running…' : 'Run test'}
              </button>
            </div>
          )}
        </div>
      )}

      {testError && (
        <div style={{ fontSize: 12, color: T.red, marginTop: 10 }}>{testError}</div>
      )}

      {testResult && (
        <div style={{ marginTop: 14, padding: '14px', background: '#F8F8F8', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>RESULT</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 2 }}>Optimized title</div>
            <div style={{ fontSize: 14, color: T.black, fontWeight: 500 }}>{testResult.title}</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 2 }}>Optimized description</div>
            <div style={{ fontSize: 13, color: T.sec, lineHeight: 1.6 }}>{testResult.description}</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 2 }}>SEO title</div>
            <div style={{ fontSize: 13, color: T.ter }}>{testResult.seo_title}</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 2 }}>SEO description</div>
            <div style={{ fontSize: 13, color: T.ter }}>{testResult.seo_description}</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 2 }}>Tags</div>
            <div style={{ fontSize: 13, color: T.ter }}>{testResult.tags}</div>
          </div>
          <div style={{ fontSize: 11, color: T.ghost }}>
            Tokens: {testResult.tokens_in} in, {testResult.tokens_out} out · Est. cost: ${testResult.cost.toFixed(4)}
          </div>
          <button
            onClick={() => { setTestResult(null) }}
            style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 8 }}
          >
            Run again
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Prompt row ───────────────────────────────────────────────────────────────

function PromptRow({
  prompt,
  isExpanded,
  isEditing,
  draft,
  isSaving,
  isDuplicating,
  showVersions,
  selected,
  allPrompts,
  clientCount,
  saveError,
  justSaved,
  onToggle,
  onEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
  onDuplicate,
  onToggleVersions,
  onSelect,
  onToggleActive,
}: {
  prompt: Prompt
  isExpanded: boolean
  isEditing: boolean
  draft: DraftPrompt | null
  isSaving: boolean
  isDuplicating: boolean
  showVersions: boolean
  selected: boolean
  allPrompts: Prompt[]
  clientCount: number
  saveError: string | null
  justSaved: boolean
  onToggle: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onDraftChange: (field: keyof DraftPrompt, value: string | boolean) => void
  onSave: () => void
  onDuplicate: () => void
  onToggleVersions: () => void
  onSelect: (v: boolean) => void
  onToggleActive: () => void
}) {
  const router = useRouter()
  const hasSystemPrompt = !!prompt.system_prompt && !isPlaceholder(prompt.system_prompt)
  const filledSections = [
    prompt.system_prompt,
    prompt.title_instructions,
    prompt.description_instructions,
    prompt.seo_instructions,
    prompt.tags_instructions,
  ].filter(f => f && !isPlaceholder(f)).length

  const [showTest, setShowTest] = useState(false)
  const [compareId, setCompareId] = useState('')

  const vars = detectVariables(prompt)

  const otherPrompts = allPrompts.filter(p => p.id !== prompt.id && p.is_active)

  return (
    <div style={{ borderBottom: `1px solid ${T.div}` }}>

      {/* ── Row summary ───────────────────────────────────────────── */}
      <div
        onClick={() => !isEditing && onToggle()}
        style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBlock: 13, cursor: isEditing ? 'default' : 'pointer' }}
      >
        {/* Checkbox */}
        {!isEditing && (
          <input
            type="checkbox"
            checked={selected}
            onChange={e => {
              e.stopPropagation()
              onSelect(e.target.checked)
            }}
            onClick={e => e.stopPropagation()}
            style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
          />
        )}

        {/* Status dot */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: prompt.is_active ? T.green : T.ghost,
        }} />

        {/* Name + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{prompt.name}</span>
            {prompt.is_default && (
              <span style={{ fontSize: 10, color: T.orange, border: `1px solid ${T.orange}`, borderRadius: 100, padding: '1px 7px' }}>
                Default
              </span>
            )}
            {!prompt.is_active && (
              <span style={{ fontSize: 10, color: T.ghost, border: `1px solid ${T.div}`, borderRadius: 100, padding: '1px 7px' }}>
                Inactive
              </span>
            )}
          </div>
          {prompt.description && (
            <div style={{ fontSize: 12, color: T.ter, marginTop: 2 }}>{prompt.description}</div>
          )}
        </div>

        {/* Niche + language pills */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {prompt.niche && (
            <span style={{ fontSize: 11, color: T.sec, border: `1px solid ${T.div}`, borderRadius: 100, padding: '2px 9px' }}>
              {NICHE_LABELS[prompt.niche] ?? prompt.niche}
            </span>
          )}
          {prompt.language && (
            <span style={{ fontSize: 11, color: T.sec, border: `1px solid ${T.div}`, borderRadius: 100, padding: '2px 9px' }}>
              {LANG_LABELS[prompt.language] ?? prompt.language}
            </span>
          )}
        </div>

        {/* Fill indicator */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          {justSaved ? (
            <div style={{ fontSize: 11, color: T.green, fontWeight: 500 }}>✓ Saved</div>
          ) : (
            <div style={{ fontSize: 11, color: hasSystemPrompt ? T.green : T.ghost }}>
              {hasSystemPrompt ? `${filledSections}/5 sections filled` : 'Placeholder'}
            </div>
          )}
          <div style={{ fontSize: 10, color: T.ghost, marginTop: 1 }}>
            v{prompt.version} · {prompt.usage_count ?? 0} uses
            {clientCount > 0 && ` · ${clientCount} client${clientCount !== 1 ? 's' : ''}`}
          </div>
        </div>

        {!isEditing && <span style={{ fontSize: 11, color: T.ghost, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>}
      </div>

      {/* ── Expanded view ─────────────────────────────────────────── */}
      {isExpanded && !isEditing && (
        <div style={{ paddingBottom: 20, paddingLeft: 21 }}>

          {/* Quick preview */}
          {prompt.system_prompt && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: T.ghost, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                System prompt preview
              </div>
              <div style={{
                fontSize: 12, color: isPlaceholder(prompt.system_prompt) ? T.ghost : T.sec,
                fontFamily: 'monospace', background: '#F8F8F8', padding: '10px 14px',
                borderRadius: 6, lineHeight: 1.7, maxHeight: 120, overflow: 'hidden',
                position: 'relative',
              }}>
                {prompt.system_prompt?.slice(0, 300)}{(prompt.system_prompt?.length ?? 0) > 300 ? '…' : ''}
              </div>
            </div>
          )}

          {/* Metadata grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 32px', marginBottom: 16 }}>
            {[
              ['Market',       prompt.market || '—'],
              ['Max title',    prompt.max_title_length ? `${prompt.max_title_length} chars` : '—'],
              ['Max desc',     prompt.max_description_length ? `${prompt.max_description_length} chars` : '—'],
              ['HTML allowed', prompt.allow_html ? 'Yes' : 'No'],
              ['Emoji',        prompt.allow_emoji ? 'Yes' : 'No'],
              ['Created',      formatDate(prompt.created_at)],
              ['Updated',      formatDate(prompt.updated_at)],
              ['Last used',    formatDate(prompt.last_used_at)],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', paddingBlock: 7, borderBottom: `1px solid ${T.div}` }}>
                <div style={{ width: 110, flexShrink: 0, fontSize: 12, color: T.ghost }}>{label}</div>
                <div style={{ fontSize: 12, color: T.black }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Linked clients */}
          <LinkedClientsPanel promptId={prompt.id} promptName={prompt.name} />

          {/* Performance section */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.div}` }}>
            <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              PERFORMANCE
            </div>
            {(prompt.usage_count ?? 0) === 0 ? (
              <div style={{ fontSize: 12, color: T.ghost }}>This template has not been used yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 12, color: T.black }}>Used: {prompt.usage_count ?? 0} times total</div>
                <div style={{ fontSize: 12, color: T.ter }}>Last used: {relativeTime(prompt.last_used_at)}</div>
              </div>
            )}
          </div>

          {/* Variables detected */}
          {vars.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                VARIABLES DETECTED
              </div>
              {vars.map(v => (
                <div key={v.name} style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBlock: 4 }}>
                  <code style={{ fontSize: 12, color: T.black, background: '#F5F5F5', padding: '1px 6px', borderRadius: 3 }}>
                    {`{{${v.name}}}`}
                  </code>
                  <span style={{ fontSize: 11, color: T.ghost }}>used in {v.usedIn.join(', ')}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: T.ghost, marginTop: 8 }}>
                Clients must fill in these values for this prompt to work correctly.
              </div>
            </div>
          )}

          {/* Test panel */}
          {showTest && <TestPanel promptId={prompt.id} />}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <button
              onClick={onEdit}
              style={{
                fontSize: 13, fontWeight: 500, color: '#FFFFFF',
                background: T.black, border: 'none', borderRadius: 100,
                padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Edit prompt
            </button>
            <button
              onClick={onDuplicate}
              disabled={isDuplicating}
              style={{
                fontSize: 13, color: T.ter, background: 'none', border: 'none',
                cursor: isDuplicating ? 'default' : 'pointer', padding: 0,
                fontFamily: 'inherit', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (!isDuplicating) e.currentTarget.style.color = T.black }}
              onMouseLeave={e => { if (!isDuplicating) e.currentTarget.style.color = T.ter }}
            >
              {isDuplicating ? 'Duplicating…' : 'Duplicate'}
            </button>

            <button
              type="button"
              onClick={onToggleActive}
              style={{
                fontSize: 13, color: prompt.is_active ? T.ter : T.green, background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {prompt.is_active ? 'Deactivate' : 'Activate'}
            </button>

            {/* Compare button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: T.ghost }}>Compare with</span>
              <select
                value={compareId}
                onChange={e => {
                  const id = e.target.value
                  setCompareId(id)
                  if (id) {
                    router.push(`/admin/prompts/compare?a=${prompt.id}&b=${id}`)
                  }
                }}
                style={{ fontSize: 12, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', outline: 'none', background: T.bg, cursor: 'pointer' }}
              >
                <option value="">— select —</option>
                {otherPrompts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowTest(v => !v)}
              style={{
                fontSize: 13, color: T.ghost, background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = T.black}
              onMouseLeave={e => e.currentTarget.style.color = T.ghost}
            >
              {showTest ? 'Hide test' : 'Test this prompt'}
            </button>

            <button
              onClick={onToggleVersions}
              style={{
                fontSize: 13, color: T.ghost, background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = T.black}
              onMouseLeave={e => e.currentTarget.style.color = T.ghost}
            >
              {showVersions ? 'Hide history' : 'Version history'}
            </button>
          </div>

          {/* Version history */}
          {showVersions && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.div}` }}>
              <VersionHistory promptId={prompt.id} currentVersion={prompt.version} />
            </div>
          )}
        </div>
      )}

      {/* ── Edit form ─────────────────────────────────────────────── */}
      {isEditing && draft && (
        <div style={{ paddingBottom: 24, paddingLeft: 21, paddingRight: 4 }}>
          <EditForm draft={draft} onChange={onDraftChange} />
          {/* Deactivation warning */}
          {!draft.is_active && prompt.is_active && clientCount > 0 && (
            <div style={{
              marginTop: 16, padding: '10px 14px', background: '#FFF8EC',
              border: '1px solid #F59E0B', borderRadius: 8,
              fontSize: 12, color: '#92400E',
            }}>
              ⚠ This template is used by <strong>{clientCount} client{clientCount !== 1 ? 's' : ''}</strong>.
              Deactivating it will cause those clients to fall back to the default template on their next upload.
            </div>
          )}

          {/* Save error */}
          {saveError && (
            <div style={{
              marginTop: 16, padding: '10px 14px', background: '#FFF0F0',
              border: '1px solid #FFCCCC', borderRadius: 8,
              fontSize: 12, color: T.red,
            }}>
              {saveError}
            </div>
          )}

          {/* Save / cancel */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 24 }}>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !draft.name.trim()}
              style={{
                fontSize: 13, fontWeight: 500, color: '#FFFFFF',
                background: T.black, border: 'none', borderRadius: 100,
                padding: '9px 24px', cursor: isSaving ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: isSaving ? 0.5 : 1, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (!isSaving) e.currentTarget.style.opacity = '0.75' }}
              onMouseLeave={e => { if (!isSaving) e.currentTarget.style.opacity = '1' }}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSaving}
              style={{
                fontSize: 13, color: T.ghost, background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── New prompt modal ─────────────────────────────────────────────────────────

const emptyDraft = (): DraftPrompt => ({
  name: '', description: '', niche: '', language: '', market: '',
  system_prompt: '', title_prompt: '', description_prompt: '',
  title_instructions: '', description_instructions: '',
  seo_instructions: '', formatting_rules: '', alt_text_instructions: '',
  filename_instructions: '', tags_instructions: '', price_rules_instructions: '',
  tone_examples: '', title_examples: '', description_examples: '',
  forbidden_words: '', required_keywords: '',
  max_title_length: '', max_description_length: '',
  html_allowed: true, emoji_allowed: false,
  is_active: true, is_default: false, change_notes: '',
})

function NewPromptModal({
  onClose,
  onCreated,
  initialNiche,
  initialLang,
}: {
  onClose: () => void
  onCreated: () => void
  initialNiche?: string
  initialLang?: string
}) {
  const [draft,   setDraft]   = useState<DraftPrompt>(() => {
    const d = emptyDraft()
    if (initialNiche) d.niche = initialNiche
    if (initialLang) d.language = initialLang
    return d
  })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function handleChange(field: keyof DraftPrompt, value: string | boolean) {
    setDraft(d => ({ ...d, [field]: value }))
  }

  async function handleCreate() {
    if (!draft.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('prompts').insert({
      name:                    draft.name.trim(),
      description:             draft.description || null,
      niche:                   draft.niche || null,
      language:                draft.language || null,
      market:                  draft.market || null,
      system_prompt:           draft.system_prompt || null,
      title_prompt:            draft.title_prompt || null,
      description_prompt:      draft.description_prompt || null,
      formatting_rules:        draft.formatting_rules || null,
      alt_text_instructions:   draft.alt_text_instructions || null,
      filename_instructions:   draft.filename_instructions || null,
      price_rules_instructions: draft.price_rules_instructions || null,
      tone_examples:           draft.tone_examples || null,
      forbidden_words:         draft.forbidden_words || null,
      required_keywords:       draft.required_keywords || null,
      max_title_length:        draft.max_title_length ? parseInt(draft.max_title_length) : null,
      max_description_length:  draft.max_description_length ? parseInt(draft.max_description_length) : null,
      allow_html:              draft.html_allowed,
      allow_emoji:             draft.emoji_allowed,
      is_active:               draft.is_active,
      is_default:              draft.is_default,
      version:                 1,
      usage_count:             0,
    })
    if (err) { setError(err.message); setSaving(false); return }
    void logActivity({
      action: 'prompt_created',
      source: 'admin',
      details: `Prompt created: ${draft.name.trim()}`,
    })
    onCreated()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: 40, paddingBottom: 40, overflow: 'auto',
    }}>
      <div style={{
        background: T.bg, borderRadius: 12, width: '100%', maxWidth: 900,
        marginInline: 24, padding: 40, position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 400, color: T.black }}>New prompt template</div>
          <button
            onClick={onClose}
            style={{ fontSize: 20, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>
        <EditForm draft={draft} onChange={handleChange} />
        {error && <div style={{ fontSize: 13, color: T.red, marginTop: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            onClick={handleCreate}
            disabled={saving || !draft.name.trim()}
            style={{
              fontSize: 13, fontWeight: 500, color: '#FFFFFF',
              background: T.black, border: 'none', borderRadius: 100,
              padding: '9px 24px', cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Creating…' : 'Create template'}
          </button>
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPromptsPage() {
  const [prompts,      setPrompts]      = useState<Prompt[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterNiche,  setFilterNiche]  = useState('')
  const [filterLang,   setFilterLang]   = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'placeholder'>('all')
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [editId,       setEditId]       = useState<string | null>(null)
  const [editDraft,    setEditDraft]    = useState<DraftPrompt | null>(null)
  const [saving,       setSaving]       = useState<string | null>(null)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [saveSuccess,  setSaveSuccess]  = useState<string | null>(null)
  const [duplicating,  setDuplicating]  = useState<string | null>(null)
  const [versionShow,  setVersionShow]  = useState<string | null>(null)
  const [showNew,      setShowNew]      = useState(false)
  const [newInitialNiche, setNewInitialNiche] = useState<string | undefined>(undefined)
  const [newInitialLang,  setNewInitialLang]  = useState<string | undefined>(undefined)

  // Feature: bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Feature: coverage matrix
  const [showCoverage, setShowCoverage] = useState(false)
  // clientsByNicheLang: "niche::language" → count of approved+active clients with that combination
  const [clientsByNicheLang, setClientsByNicheLang] = useState<Record<string, number>>({})
  // clientsByPromptId: prompt_id → count of clients whose profile uses that template
  const [clientsByPromptId, setClientsByPromptId] = useState<Record<string, number>>({})

  // Feature: import/export
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<{ newCount: number; skipCount: number; errorCount: number } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [
      { data: promptsData },
      { data: clientsData },
      { data: profilesData },
    ] = await Promise.all([
      supabase.from('prompts').select('*').order('niche').order('language').order('name'),
      supabase.from('clients').select('niche, language, approval_status, is_active'),
      supabase.from('client_profiles').select('prompt_id').not('prompt_id', 'is', null),
    ])
    setPrompts((promptsData ?? []) as Prompt[])

    // Build niche+lang → client count map (approved + active clients)
    const nlMap: Record<string, number> = {}
    for (const c of (clientsData ?? []) as { niche: string | null; language: string | null; approval_status: string; is_active: boolean }[]) {
      if (c.approval_status === 'approved' && c.is_active && c.niche && c.language) {
        const key = `${c.niche}::${c.language}`
        nlMap[key] = (nlMap[key] ?? 0) + 1
      }
    }
    setClientsByNicheLang(nlMap)

    // Build prompt_id → count of profiles using that template
    const pidMap: Record<string, number> = {}
    for (const p of (profilesData ?? []) as { prompt_id: string | null }[]) {
      if (p.prompt_id) {
        pidMap[p.prompt_id] = (pidMap[p.prompt_id] ?? 0) + 1
      }
    }
    setClientsByPromptId(pidMap)

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Edit handlers ──────────────────────────────────────────────────────────

  function startEdit(prompt: Prompt) {
    setEditId(prompt.id)
    setEditDraft(toDraft(prompt))
    setSaveError(null)
    setSaveSuccess(null)
  }

  function cancelEdit() {
    setEditId(null)
    setEditDraft(null)
  }

  function handleDraftChange(field: keyof DraftPrompt, value: string | boolean) {
    setEditDraft(d => d ? { ...d, [field]: value } : d)
  }

  async function saveEdit(prompt: Prompt) {
    if (!editDraft) {
      alert('Save error: editDraft is null')
      return
    }
    const promptId = editId ?? prompt.id
    setSaving(promptId)
    setSaveError(null)
    setSaveSuccess(null)

    const { data: updated, error } = await supabase
      .from('prompts')
      .update({
        name:                    editDraft.name.trim(),
        description:             editDraft.description || null,
        niche:                   editDraft.niche || null,
        language:                editDraft.language || null,
        market:                  editDraft.market || null,
        system_prompt:           editDraft.system_prompt || null,
        title_prompt:            editDraft.title_prompt || null,
        description_prompt:      editDraft.description_prompt || null,
        formatting_rules:        editDraft.formatting_rules || null,
        alt_text_instructions:   editDraft.alt_text_instructions || null,
        filename_instructions:   editDraft.filename_instructions || null,
        price_rules_instructions: editDraft.price_rules_instructions || null,
        tone_examples:           editDraft.tone_examples || null,
        forbidden_words:         editDraft.forbidden_words || null,
        required_keywords:       editDraft.required_keywords || null,
        max_title_length:        editDraft.max_title_length ? parseInt(editDraft.max_title_length) : null,
        max_description_length:  editDraft.max_description_length ? parseInt(editDraft.max_description_length) : null,
        allow_html:              editDraft.html_allowed,   // DB column is allow_html
        allow_emoji:             editDraft.emoji_allowed,  // DB column is allow_emoji
        is_active:               editDraft.is_active,
        is_default:              editDraft.is_default,
        updated_at:              new Date().toISOString(),
      })
      .eq('id', promptId)
      .select()

    if (error) {
      alert('Save failed: ' + error.message)
      setSaveError(`Save failed: ${error.message}`)
      setSaving(null)
      return
    }

    if (!updated || updated.length === 0) {
      alert('Save failed: no rows matched (ID: ' + promptId + ')')
      setSaveError(`Save failed: no rows matched`)
      setSaving(null)
      return
    }

    // SUCCESS
    const savedPrompt = updated[0] as Prompt
    setPrompts(prev => prev.map(p => p.id === promptId ? savedPrompt : p))
    setEditId(null)
    setEditDraft(null)
    setSaving(null)
    setSaveSuccess(promptId)
    setTimeout(() => setSaveSuccess(null), 3000)
    void logActivity({
      action: 'prompt_updated',
      source: 'admin',
      details: `Prompt updated: ${savedPrompt.name}`,
    })
    load()
  }

  async function duplicate(prompt: Prompt) {
    setDuplicating(prompt.id)
    await supabase.from('prompts').insert({
      name:                     `${prompt.name} (copy)`,
      description:             prompt.description,
      niche:                   prompt.niche,
      language:                prompt.language,
      market:                  prompt.market,
      system_prompt:           prompt.system_prompt,
      title_prompt:            prompt.title_prompt,
      description_prompt:      prompt.description_prompt,
      formatting_rules:        prompt.formatting_rules,
      alt_text_instructions:   prompt.alt_text_instructions,
      filename_instructions:   prompt.filename_instructions,
      price_rules_instructions: prompt.price_rules_instructions,
      tone_examples:           prompt.tone_examples,
      forbidden_words:         prompt.forbidden_words,
      required_keywords:       prompt.required_keywords,
      max_title_length:        prompt.max_title_length,
      max_description_length:  prompt.max_description_length,
      allow_html:              prompt.allow_html ?? false,
      allow_emoji:             prompt.allow_emoji ?? false,
      is_active:               false,  // start as inactive
      is_default:              false,
      parent_prompt_id:        prompt.id,
      version:                 1,
      usage_count:             0,
      created_by:              'admin',
    })
    setDuplicating(null)
    await load()
  }

  // ── Quick toggle active ────────────────────────────────────────────────────

  async function handleToggleActive(prompt: Prompt) {
    if (prompt.is_active) {
      // Deactivating — check linked clients
      const { data: linked } = await supabase
        .from('client_profiles')
        .select('client_id')
        .eq('prompt_id', prompt.id)
      const count = linked?.length ?? 0
      if (count > 0 && !confirm(`This template is used by ${count} client${count !== 1 ? 's' : ''}. They will fall back to the default template. Continue?`)) return
    }
    await supabase.from('prompts').update({ is_active: !prompt.is_active }).eq('id', prompt.id)
    await load()
  }

  // ── Bulk operations ────────────────────────────────────────────────────────

  async function bulkActivate() {
    await supabase.from('prompts').update({ is_active: true }).in('id', [...selectedIds])
    setSelectedIds(new Set())
    await load()
  }

  async function bulkDeactivate() {
    await supabase.from('prompts').update({ is_active: false }).in('id', [...selectedIds])
    setSelectedIds(new Set())
    await load()
  }

  function bulkExport() {
    const selected = prompts.filter(p => selectedIds.has(p.id))
    const json = JSON.stringify(selected, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prompts-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setSelectedIds(new Set())
  }

  async function bulkDelete() {
    const { count } = await supabase
      .from('client_profiles')
      .select('id', { count: 'exact', head: true })
      .in('prompt_id', [...selectedIds])
    if ((count ?? 0) > 0) {
      alert(`Cannot delete: some selected templates are linked to clients. Unlink them first.`)
      return
    }
    if (!confirm(`Delete ${selectedIds.size} template(s)? This cannot be undone.`)) return
    await supabase.from('prompts').delete().in('id', [...selectedIds])
    setSelectedIds(new Set())
    await load()
  }

  // ── Export all ─────────────────────────────────────────────────────────────

  function exportAll() {
    const json = JSON.stringify(prompts, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `higherup-prompts-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport(file: File) {
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const items = JSON.parse(text) as Record<string, unknown>[]
      if (!Array.isArray(items)) throw new Error('Not an array')
      let newCount = 0, skipCount = 0, errorCount = 0
      for (const item of items) {
        const name = item.name as string | undefined
        if (!name) { errorCount++; continue }
        if (prompts.some(p => p.name === name)) { skipCount++; continue }
        const { error } = await supabase.from('prompts').insert({
          ...item,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          version: 1,
        })
        if (error) errorCount++
        else newCount++
      }
      setImportResult({ newCount, skipCount, errorCount })
      await load()
      setTimeout(() => setImportResult(null), 4000)
    } catch {
      setImportResult({ newCount: 0, skipCount: 0, errorCount: 1 })
    }
    setImporting(false)
    if (importInputRef.current) importInputRef.current.value = ''
  }

  // ── Filter + search ───────────────────────────────────────────────────────

  const filtered = prompts.filter(p => {
    if (filterNiche  && p.niche    !== filterNiche)  return false
    if (filterLang   && p.language !== filterLang)   return false
    if (filterStatus === 'active')      return !!p.is_active
    if (filterStatus === 'inactive')    return !p.is_active
    if (filterStatus === 'placeholder') return isPlaceholder(p.system_prompt)
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.market ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── Select-all helpers ────────────────────────────────────────────────────

  const allSelected  = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))
  const someSelected = filtered.some(p => selectedIds.has(p.id))
  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalActive   = prompts.filter(p => p.is_active).length
  const totalFilled   = prompts.filter(p => !isPlaceholder(p.system_prompt)).length
  const nichesCount   = new Set(prompts.map(p => p.niche).filter(Boolean)).size

  // ── Coverage matrix ───────────────────────────────────────────────────────

  const promptMap = new Set(prompts.filter(p => p.is_active).map(p => `${p.niche}::${p.language}`))
  const promptNameMap: Record<string, string> = {}
  const promptIdMap: Record<string, string> = {}
  prompts.filter(p => p.is_active).forEach(p => {
    const key = `${p.niche}::${p.language}`
    promptNameMap[key] = p.name
    promptIdMap[key] = p.id
  })

  const smallBtnStyle: React.CSSProperties = {
    fontSize: 12, color: T.ghost, background: 'none', border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', padding: '4px 10px',
    borderRadius: 6, transition: 'all 0.15s',
  }

  return (
    <div style={{ paddingTop: 48, paddingBottom: 100, maxWidth: 1080, margin: '0 auto', paddingInline: 48 }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 300, color: T.black }}>Prompt Library</div>
          {!loading && (
            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              {[
                { label: 'Total',        value: prompts.length },
                { label: 'Active',       value: totalActive    },
                { label: 'Filled',       value: totalFilled    },
                { label: 'Placeholders', value: prompts.length - totalFilled },
                { label: 'Niches',       value: nichesCount    },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: T.black }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: T.ghost, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Header actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Export all */}
          <button
            onClick={exportAll}
            style={smallBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = T.black; e.currentTarget.style.background = T.div }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ghost; e.currentTarget.style.background = 'none' }}
          >
            Export all
          </button>

          {/* Import */}
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            style={{ ...smallBtnStyle, opacity: importing ? 0.5 : 1 }}
            onMouseEnter={e => { if (!importing) { e.currentTarget.style.color = T.black; e.currentTarget.style.background = T.div } }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ghost; e.currentTarget.style.background = 'none' }}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
            }}
          />

          {/* New template */}
          <button
            onClick={() => { setNewInitialNiche(undefined); setNewInitialLang(undefined); setShowNew(true) }}
            style={{
              fontSize: 13, fontWeight: 500, color: '#FFFFFF',
              background: T.black, border: 'none', borderRadius: 100,
              padding: '9px 20px', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            + New template
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div style={{ fontSize: 12, color: '#10B981', marginBottom: 16 }}>
          {importResult.newCount} new template{importResult.newCount !== 1 ? 's' : ''} added
          {importResult.skipCount > 0 ? `, ${importResult.skipCount} skipped (name already exists)` : ''}
          {importResult.errorCount > 0 ? `, ${importResult.errorCount} error${importResult.errorCount !== 1 ? 's' : ''}` : ''}
        </div>
      )}

      {/* ── Coverage matrix ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div
          onClick={() => setShowCoverage(v => !v)}
          style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', marginBottom: showCoverage ? 12 : 0 }}
        >
          {showCoverage ? '▼' : '▶'} COVERAGE
        </div>
        {showCoverage && (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${LANGUAGE_OPTIONS.length}, 80px)`, gap: 0 }}>
              {/* Header row */}
              <div />
              {LANGUAGE_OPTIONS.map(lang => (
                <div key={lang.value} style={{ fontSize: 10, color: T.ghost, textAlign: 'center', paddingBottom: 6 }}>
                  {lang.label}
                </div>
              ))}
              {/* Niche rows */}
              {NICHE_OPTIONS.map(niche => (
                <>
                  <div key={`label-${niche.value}`} style={{ fontSize: 12, color: T.black, paddingBlock: 4, paddingRight: 8, lineHeight: '24px' }}>
                    {niche.label}
                  </div>
                  {LANGUAGE_OPTIONS.map(lang => {
                    const key = `${niche.value}::${lang.value}`
                    const covered = promptMap.has(key)
                    const promptId = covered ? promptIdMap[key] : null
                    const clientsOnTemplate = promptId ? (clientsByPromptId[promptId] ?? 0) : 0
                    const clientsOnCell = clientsByNicheLang[key] ?? 0
                    const clientsNeedingFallback = !covered ? clientsOnCell : 0
                    return (
                      <div
                        key={key}
                        title={covered
                          ? `${promptNameMap[key]}${clientsOnTemplate > 0 ? ` · ${clientsOnTemplate} client${clientsOnTemplate !== 1 ? 's' : ''}` : ''}`
                          : `No template: ${niche.label} + ${lang.label}${clientsNeedingFallback > 0 ? ` · ${clientsNeedingFallback} client${clientsNeedingFallback !== 1 ? 's' : ''} using fallback` : ''}`
                        }
                        onClick={() => {
                          if (!covered) {
                            setNewInitialNiche(niche.value)
                            setNewInitialLang(lang.value)
                            setShowNew(true)
                          }
                        }}
                        style={{
                          textAlign: 'center', paddingBlock: 4, lineHeight: '20px',
                          cursor: covered ? 'default' : 'pointer',
                          fontSize: 14,
                        }}
                      >
                        {covered ? (
                          <div>
                            <span style={{ color: T.black }}>●</span>
                            {clientsOnTemplate > 0 && (
                              <div style={{ fontSize: 9, color: T.ghost, lineHeight: '12px' }}>{clientsOnTemplate}</div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span style={{ color: T.div, border: `1px solid ${T.div}`, borderRadius: '50%', display: 'inline-block', width: 12, height: 12, lineHeight: '10px', fontSize: 10 }}>○</span>
                            {clientsNeedingFallback > 0 && (
                              <div style={{ fontSize: 9, color: '#F59E0B', lineHeight: '12px' }}>{clientsNeedingFallback}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates…"
          style={{
            flex: 1, minWidth: 200, fontSize: 13, color: T.black,
            border: `1px solid ${T.div}`, borderRadius: 8,
            padding: '8px 12px', fontFamily: 'inherit', outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = T.black }}
          onBlur={e => { e.target.style.borderColor = T.div }}
        />
        <select
          value={filterNiche}
          onChange={e => setFilterNiche(e.target.value)}
          style={{ fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', outline: 'none', background: T.bg, cursor: 'pointer' }}
        >
          <option value="">All niches</option>
          {NICHE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filterLang}
          onChange={e => setFilterLang(e.target.value)}
          style={{ fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', outline: 'none', background: T.bg, cursor: 'pointer' }}
        >
          <option value="">All languages</option>
          {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
          style={{ fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', outline: 'none', background: T.bg, cursor: 'pointer' }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="placeholder">Placeholders</option>
        </select>
      </div>

      {/* ── Bulk action bar ────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: T.ghost }}>{selectedIds.size} selected</span>
          <button
            onClick={bulkActivate}
            style={smallBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = T.black; e.currentTarget.style.background = T.div }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ghost; e.currentTarget.style.background = 'none' }}
          >Activate selected</button>
          <button
            onClick={bulkDeactivate}
            style={smallBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = T.black; e.currentTarget.style.background = T.div }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ghost; e.currentTarget.style.background = 'none' }}
          >Deactivate selected</button>
          <button
            onClick={bulkExport}
            style={smallBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = T.black; e.currentTarget.style.background = T.div }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ghost; e.currentTarget.style.background = 'none' }}
          >Export selected (JSON)</button>
          <button
            onClick={bulkDelete}
            style={{ ...smallBtnStyle, color: T.red }}
            onMouseEnter={e => { e.currentTarget.style.background = T.div }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >Delete selected</button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ ...smallBtnStyle, marginLeft: 'auto', fontSize: 11 }}
            onMouseEnter={e => { e.currentTarget.style.color = T.black }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ghost }}
          >Clear selection</button>
        </div>
      )}

      {/* ── List ───────────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: `1px solid #EEEEEE`, marginBottom: 4 }}>
          <SelectAllCheckbox
            allSelected={allSelected}
            someSelected={someSelected}
            onChange={toggleSelectAll}
          />
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#CCCCCC', fontWeight: 400 }}>
            {allSelected ? 'Deselect all' : someSelected ? `${selectedIds.size} selected` : 'Select all'}
          </span>
        </div>
      )}
      {loading ? (
        <div style={{ fontSize: 13, color: T.ghost }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: T.ghost, paddingTop: 20 }}>No templates match your filter.</div>
      ) : (
        filtered.map(prompt => (
          <PromptRow
            key={prompt.id}
            prompt={prompt}
            isExpanded={expanded === prompt.id}
            isEditing={editId === prompt.id}
            draft={editId === prompt.id ? editDraft : null}
            isSaving={saving === prompt.id}
            isDuplicating={duplicating === prompt.id}
            showVersions={versionShow === prompt.id}
            selected={selectedIds.has(prompt.id)}
            allPrompts={prompts}
            clientCount={clientsByPromptId[prompt.id] ?? 0}
            onToggle={() => {
              setExpanded(expanded === prompt.id ? null : prompt.id)
              setVersionShow(null)
            }}
            saveError={editId === prompt.id ? saveError : null}
            justSaved={saveSuccess === prompt.id}
            onEdit={() => startEdit(prompt)}
            onCancelEdit={cancelEdit}
            onDraftChange={handleDraftChange}
            onSave={() => saveEdit(prompt)}
            onDuplicate={() => duplicate(prompt)}
            onToggleVersions={() => setVersionShow(versionShow === prompt.id ? null : prompt.id)}
            onToggleActive={() => handleToggleActive(prompt)}
            onSelect={v => {
              setSelectedIds(prev => {
                const next = new Set(prev)
                if (v) next.add(prompt.id)
                else next.delete(prompt.id)
                return next
              })
            }}
          />
        ))
      )}

      {/* ── New prompt modal ───────────────────────────────────────── */}
      {showNew && (
        <NewPromptModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); load() }}
          initialNiche={newInitialNiche}
          initialLang={newInitialLang}
        />
      )}
    </div>
  )
}
