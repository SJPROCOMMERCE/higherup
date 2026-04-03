'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Client, type Prompt } from '@/lib/supabase'
import { FREE_PRODUCTS_PER_MONTH, PRICE_PER_PRODUCT } from '@/lib/usage-tracker'
import { timeAgo } from '@/lib/utils'
import { logActivity } from '@/lib/activity-log'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  sec:    '#999999',
  ter:    '#CCCCCC',
  ghost:  '#DDDDDD',
  div:    '#F0F0F0',
  row:    '#FAFAFA',
  green:  '#10B981',
  bg:     '#FFFFFF',
}

// ─── Options ──────────────────────────────────────────────────────────────────

const NICHE_OPTIONS = ['fashion','electronics','home_garden','beauty','health','sports','other']
const LANG_OPTIONS  = ['english','german','french','dutch','spanish','other']
const TITLE_OPTIONS = ['short','medium','long']
const DESC_OPTIONS  = ['emotional','technical','casual','luxury','neutral']

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

function formatExact(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type FilterType = 'pending' | 'approved' | 'rejected' | 'all'

// ─── Small shared components ──────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 16px', borderRadius: 100, fontSize: 12,
        background: active ? T.black : 'none',
        color:      active ? T.bg    : T.ter,
        border:     `1px solid ${active ? T.black : '#EEEEEE'}`,
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = T.ter }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#EEEEEE' }}
    >
      {label}
    </button>
  )
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  const display = value != null && value !== '' ? String(value) : null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: display ? T.black : T.ghost }}>{display ?? '—'}</div>
    </div>
  )
}

// Native select styled with border-bottom (for edit mode)
function EditSelect({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 4 }}>
        {label}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: 14, color: T.black, background: T.bg, border: 'none',
          borderBottom: '1px solid #EEEEEE', outline: 'none',
          padding: '2px 0 5px', width: '100%', fontFamily: 'inherit', cursor: 'pointer',
        }}
        onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
        onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
      >
        {options.map(o => <option key={o} value={o}>{cap(o)}</option>)}
      </select>
    </div>
  )
}

function EditInput({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 4 }}>
        {label}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: 14, color: T.black, background: 'none', border: 'none',
          borderBottom: '1px solid #EEEEEE', outline: 'none',
          padding: '2px 0 5px', width: '100%', fontFamily: 'inherit',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
        onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
      />
    </div>
  )
}

function PillToggleGroup({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(o => (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              padding: '4px 10px', borderRadius: 100, fontSize: 12,
              background: value === o ? T.black : 'none',
              color:      value === o ? T.bg    : T.ter,
              border:     `1px solid ${value === o ? T.black : '#EEEEEE'}`,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            {cap(o)}
          </button>
        ))}
      </div>
    </div>
  )
}

// Custom dropdown for prompt selector (polished)
function PromptDropdown({
  value, prompts, onChange,
}: { value: string; prompts: Prompt[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const selected = prompts.find(p => p.id === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          borderBottom: '1px solid #EEEEEE', padding: '4px 0 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, color: selected ? T.black : T.ghost,
          cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s',
        }}
        onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
        onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
      >
        <span>{selected?.name ?? 'Select a template'}</span>
        <span style={{ fontSize: 10, color: T.ter }}>▾</span>
      </button>
      {open && (
        <div className="hu-dropdown-list" style={{ top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto', background: '#FFFFFF', backgroundColor: '#FFFFFF', borderRadius: 8, border: '1px solid #EEEEEE', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', zIndex: 9999 }}>
          {prompts.map(p => (
            <button
              key={p.id}
              type="button"
              className={`hu-dropdown-option${value === p.id ? ' is-selected' : ''}`}
              onClick={() => { onChange(p.id); setOpen(false) }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F7')}
              onMouseLeave={e => (e.currentTarget.style.background = value === p.id ? '#F5F5F7' : '#FFFFFF')}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 14px',
                fontSize: 13, color: T.black, border: 'none', cursor: 'pointer',
                display: 'block', fontFamily: 'inherit', background: value === p.id ? '#F5F5F7' : '#FFFFFF',
              }}
            >
              {p.name}
              {p.niche && p.language && (
                <span style={{ fontSize: 11, color: T.ter, marginLeft: 8 }}>
                  {cap(p.niche)} · {cap(p.language)}
                </span>
              )}
            </button>
          ))}
          {prompts.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: T.ter }}>No templates found</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Client Approval Row (pending) ────────────────────────────────────────────

type RowPhase = 'idle' | 'prompt-select' | 'rejecting' | 'editing'
type EditVals = {
  niche: string; market: string; language: string
  title_preference: string; description_style: string; special_instructions: string
}

function ClientApprovalRow({
  client, vaName, prompts, onActioned,
}: {
  client: Client
  vaName: string
  prompts: Prompt[]
  onActioned: (id: string) => void
}) {
  const [expanded, setExpanded]   = useState(false)
  const [phase, setPhase]         = useState<RowPhase>('idle')
  const [busy, setBusy]           = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState(prompts[0]?.id ?? '')
  const [rejectReason, setRejectReason]         = useState('')
  const [editVals, setEditVals]   = useState<EditVals>({
    niche:                client.niche                ?? 'other',
    market:               client.market               ?? '',
    language:             client.language             ?? 'english',
    title_preference:     client.title_preference     ?? 'medium',
    description_style:    client.description_style    ?? 'neutral',
    special_instructions: client.special_instructions ?? '',
  })
  const [done, setDone] = useState<{ type: 'approved' | 'rejected' } | null>(null)

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => onActioned(client.id), 2200)
    return () => clearTimeout(t)
  }, [done, client.id, onActioned])

  // ── DB operations ───────────────────────────────────────────────────────────

  async function confirmApprove(vals?: EditVals) {
    setBusy(true)
    try {
      const now      = new Date()
      const deadline = new Date(now.getTime() + 48 * 3600000)
      const updates: Record<string, unknown> = {
        approval_status: 'approved',
        approved_at:     now.toISOString(),
        deadline_48h:    deadline.toISOString(),
      }
      if (vals) {
        updates.niche                = vals.niche
        updates.market               = vals.market || null
        updates.language             = vals.language
        updates.title_preference     = vals.title_preference
        updates.description_style    = vals.description_style
        updates.special_instructions = vals.special_instructions || null
      }
      await supabase.from('clients').update(updates).eq('id', client.id)

      if (selectedPromptId) {
        await supabase.from('client_profiles').upsert({
          client_id:  client.id,
          prompt_id:  selectedPromptId,
          updated_by: 'admin',
          updated_at: now.toISOString(),
        }, { onConflict: 'client_id' })
      }

      await supabase.from('notifications').insert({
        va_id:   client.va_id,
        type:    'client_approved',
        title:   `${client.store_name} has been approved`,
        message: 'You can now start uploading listings. Remember: first upload within 48 hours.',
        is_read: false,
      })

      void logActivity({ action: 'client_approved', va_id: client.va_id, client_id: client.id, source: 'admin', details: `Client ${client.store_name} approved` })
      setDone({ type: 'approved' })
    } catch {
      setBusy(false)
    }
  }

  async function confirmReject() {
    if (busy) return
    setBusy(true)
    try {
      await supabase.from('clients').update({
        approval_status: 'rejected',
        rejection_reason: rejectReason.trim() || null,
      }).eq('id', client.id)

      await supabase.from('notifications').insert({
        va_id:   client.va_id,
        type:    'client_rejected',
        title:   `${client.store_name} was not approved`,
        message: rejectReason.trim() || null,
        is_read: false,
      })

      void logActivity({ action: 'client_rejected', va_id: client.va_id, client_id: client.id, source: 'admin', severity: 'warning', details: `Client ${client.store_name} rejected${rejectReason.trim() ? ': ' + rejectReason.trim() : ''}` })
      setDone({ type: 'rejected' })
    } catch {
      setBusy(false)
    }
  }

  // ── Done state ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{
        padding: '18px 0', borderBottom: `1px solid ${T.row}`,
        fontSize: 13,
        color: done.type === 'approved' ? T.green : T.sec,
        animation: 'fadeOut 0.3s ease 1.9s forwards',
      }}>
        {done.type === 'approved'
          ? `✓ ${client.store_name} approved`
          : `✗ ${client.store_name} rejected`}
      </div>
    )
  }

  // ── Normal render ────────────────────────────────────────────────────────────
  // Per-product pricing estimate for expected monthly products
  const expectedProducts  = client.expected_monthly_products ?? 0
  const expectedBillable  = Math.max(0, expectedProducts - FREE_PRODUCTS_PER_MONTH)
  const expectedShare     = Math.round(expectedBillable * PRICE_PER_PRODUCT * 100) / 100

  return (
    <div style={{ borderBottom: `1px solid ${T.row}` }}>

      {/* Compact row */}
      <div
        onClick={() => !busy && setExpanded(e => !e)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 0', cursor: 'pointer', gap: 16, transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <div style={{ fontSize: 15, fontWeight: 500, color: T.black, flexShrink: 0 }}>
          {client.store_name}
        </div>
        <div style={{ fontSize: 12, color: T.sec, flex: 1, textAlign: 'center' }}>
          {cap(client.niche ?? 'other')}
          {client.market && ` · ${client.market}`}
          {` · ${vaName}`}
        </div>
        <div style={{ fontSize: 12, color: T.ter, flexShrink: 0 }}>
          Submitted {timeAgo(client.registered_at)}
        </div>
      </div>

      {/* Expanded content */}
      <div style={{
        maxHeight: expanded ? 900 : 0,
        overflow: 'hidden',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.35s ease, opacity 0.25s ease',
      }}>
        <div style={{ paddingBottom: 28, paddingTop: 4 }}>

          {/* Two-column details / edit grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 48px', marginBottom: 16 }}>

            {/* Left column */}
            <div>
              {phase === 'editing' ? (
                <>
                  <EditInput label="Store Name" value={client.store_name} onChange={() => {}} />
                  <EditSelect label="Niche" value={editVals.niche} options={NICHE_OPTIONS} onChange={v => setEditVals(p => ({ ...p, niche: v }))} />
                  <EditInput label="Market" value={editVals.market} onChange={v => setEditVals(p => ({ ...p, market: v }))} />
                  <EditSelect label="Language" value={editVals.language} options={LANG_OPTIONS} onChange={v => setEditVals(p => ({ ...p, language: v }))} />
                  <DetailField label="Expected Products" value={client.expected_monthly_products != null ? `${client.expected_monthly_products} products · ~$${expectedShare.toFixed(2)}/month share` : null} />
                </>
              ) : (
                <>
                  <DetailField label="Store Name"   value={client.store_name} />
                  <DetailField label="Store Domain"  value={client.store_domain} />
                  <DetailField label="Niche"          value={client.niche ? cap(client.niche) : null} />
                  <DetailField label="Market"         value={client.market} />
                  <DetailField label="Language"       value={client.language ? cap(client.language) : null} />
                  <DetailField
                    label="Expected Products"
                    value={client.expected_monthly_products != null
                      ? `${client.expected_monthly_products} products · ~$${expectedShare.toFixed(2)}/month share`
                      : null}
                  />
                </>
              )}
            </div>

            {/* Right column */}
            <div>
              {phase === 'editing' ? (
                <>
                  <PillToggleGroup label="Title Preference" value={editVals.title_preference} options={TITLE_OPTIONS} onChange={v => setEditVals(p => ({ ...p, title_preference: v }))} />
                  <PillToggleGroup label="Description Style" value={editVals.description_style} options={DESC_OPTIONS} onChange={v => setEditVals(p => ({ ...p, description_style: v }))} />
                  <DetailField label="VA" value={vaName} />
                  <DetailField label="Submitted" value={formatExact(client.registered_at)} />
                </>
              ) : (
                <>
                  <DetailField label="Title Preference"  value={client.title_preference  ? cap(client.title_preference)  : null} />
                  <DetailField label="Description Style" value={client.description_style ? cap(client.description_style) : null} />
                  <DetailField label="Payment Method"    value={null} />
                  <DetailField label="Start Date"        value={client.deadline_48h ? null : null} />
                  <DetailField label="VA"                value={vaName} />
                  <DetailField label="Submitted"         value={formatExact(client.registered_at)} />
                </>
              )}
            </div>
          </div>

          {/* Special instructions */}
          {phase === 'editing' ? (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 4 }}>
                Special Instructions
              </div>
              <textarea
                value={editVals.special_instructions}
                onChange={e => setEditVals(p => ({ ...p, special_instructions: e.target.value }))}
                rows={3}
                style={{
                  width: '100%', fontSize: 13, color: T.black, background: 'none',
                  border: 'none', borderBottom: '1px solid #EEEEEE', outline: 'none',
                  resize: 'none', padding: '0 0 6px', fontFamily: 'inherit',
                  lineHeight: 1.6, transition: 'border-color 0.15s',
                }}
                onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
                onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
              />
            </div>
          ) : client.special_instructions ? (
            <div style={{ marginBottom: 20, gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 6 }}>
                Special Instructions
              </div>
              <div style={{ fontSize: 13, color: '#666666', lineHeight: 1.6 }}>
                {client.special_instructions}
              </div>
            </div>
          ) : null}

          {/* ── Actions ─────────────────────────────────────────────────────── */}

          {/* Idle — main action buttons */}
          {phase === 'idle' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setPhase('prompt-select')}
                style={{
                  fontSize: 13, fontWeight: 500, color: T.bg, background: T.black,
                  border: 'none', borderRadius: 100, padding: '10px 24px',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Approve
              </button>
              <button
                onClick={() => setPhase('rejecting')}
                style={{
                  fontSize: 13, color: T.sec, background: 'none',
                  border: '1px solid #EEEEEE', borderRadius: 100, padding: '10px 24px',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.black; e.currentTarget.style.color = T.black }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#EEEEEE'; e.currentTarget.style.color = T.sec }}
              >
                Reject
              </button>
              <button
                onClick={() => setPhase('editing')}
                style={{
                  fontSize: 12, color: T.ter, background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >
                Edit before approving
              </button>
            </div>
          )}

          {/* Prompt select */}
          {phase === 'prompt-select' && (
            <div style={{ paddingTop: 20, borderTop: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 10 }}>
                Link prompt template
              </div>
              <div style={{ maxWidth: 320 }}>
                <PromptDropdown
                  value={selectedPromptId}
                  prompts={prompts}
                  onChange={setSelectedPromptId}
                />
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={() => confirmApprove()}
                  disabled={busy || !selectedPromptId}
                  style={{
                    fontSize: 13, fontWeight: 500, color: T.bg, background: T.black,
                    border: 'none', borderRadius: 100, padding: '10px 24px',
                    cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                    opacity: busy ? 0.5 : 1, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { if (!busy) e.currentTarget.style.opacity = '0.75' }}
                  onMouseLeave={e => { if (!busy) e.currentTarget.style.opacity = '1' }}
                >
                  {busy ? 'Approving\u2026' : 'Confirm & approve'}
                </button>
                <button
                  onClick={() => setPhase('idle')}
                  disabled={busy}
                  style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Rejection form */}
          {phase === 'rejecting' && (
            <div style={{ paddingTop: 20, borderTop: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 8 }}>
                Reason for rejection
              </div>
              <input
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Niche not yet supported"
                autoFocus
                style={{
                  width: '100%', maxWidth: 360, fontSize: 14, color: T.black,
                  background: 'none', border: 'none', borderBottom: '1.5px solid #EEEEEE',
                  outline: 'none', padding: '4px 0 6px', fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
                onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
                onKeyDown={e => { if (e.key === 'Enter') confirmReject() }}
              />
              <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={() => setPhase('idle')}
                  disabled={busy}
                  style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={busy}
                  style={{
                    fontSize: 13, color: T.sec, background: 'none',
                    border: '1px solid #EEEEEE', borderRadius: 100, padding: '8px 20px',
                    cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                    opacity: busy ? 0.5 : 1, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor = T.black; e.currentTarget.style.color = T.black } }}
                  onMouseLeave={e => { if (!busy) { e.currentTarget.style.borderColor = '#EEEEEE'; e.currentTarget.style.color = T.sec } }}
                >
                  {busy ? 'Rejecting\u2026' : 'Confirm rejection'}
                </button>
              </div>
            </div>
          )}

          {/* Edit mode actions */}
          {phase === 'editing' && (
            <div>
              {/* Prompt select for save & approve */}
              <div style={{ paddingTop: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter, marginBottom: 10 }}>
                  Link prompt template
                </div>
                <div style={{ maxWidth: 320 }}>
                  <PromptDropdown value={selectedPromptId} prompts={prompts} onChange={setSelectedPromptId} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={() => confirmApprove(editVals)}
                  disabled={busy || !selectedPromptId}
                  style={{
                    fontSize: 13, fontWeight: 500, color: T.bg, background: T.black,
                    border: 'none', borderRadius: 100, padding: '10px 24px',
                    cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                    opacity: busy ? 0.5 : 1, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { if (!busy) e.currentTarget.style.opacity = '0.75' }}
                  onMouseLeave={e => { if (!busy) e.currentTarget.style.opacity = '1' }}
                >
                  {busy ? 'Saving\u2026' : 'Save & approve'}
                </button>
                <button
                  onClick={() => setPhase('idle')}
                  disabled={busy}
                  style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >
                  Cancel editing
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Approved compact row ─────────────────────────────────────────────────────

function ApprovedRow({ client, vaName }: { client: Client; vaName: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 0', borderBottom: `1px solid ${T.row}`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{client.store_name}</div>
      <div style={{ fontSize: 12, color: T.sec, flex: 1, textAlign: 'center', padding: '0 16px' }}>
        {cap(client.niche ?? 'other')} · {vaName}
      </div>
      <div style={{ fontSize: 12, color: T.ter }}>
        Approved {client.approved_at ? timeAgo(client.approved_at) : '—'}
      </div>
    </div>
  )
}

// ─── Rejected compact row ─────────────────────────────────────────────────────

function RejectedRow({ client, vaName }: { client: Client; vaName: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 0', borderBottom: `1px solid ${T.row}`,
      opacity: 0.5,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{client.store_name}</div>
      <div style={{ fontSize: 12, color: T.sec, flex: 1, padding: '0 16px' }}>
        {cap(client.niche ?? 'other')} · {vaName}
      </div>
      <div style={{ fontSize: 12, color: T.sec, maxWidth: 260, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {client.rejection_reason ?? '—'}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Bone({ w, h = 10 }: { w: number | string; h?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 4, background: T.div, animation: 'pulse 1.8s ease infinite' }} />
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [filter, setFilter]       = useState<FilterType>('pending')
  const [clients, setClients]     = useState<Client[]>([])
  const [vaMap, setVaMap]         = useState<Record<string, string>>({})
  const [prompts, setPrompts]     = useState<Prompt[]>([])
  const [loading, setLoading]     = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  // Load VAs + prompts once
  useEffect(() => {
    Promise.all([
      supabase.from('vas').select('id, name'),
      supabase.from('prompts').select('*').order('name'),
    ]).then(([{ data: vas }, { data: pts }]) => {
      const map: Record<string, string> = {}
      ;(vas ?? []).forEach((v: { id: string; name: string }) => { map[v.id] = v.name })
      setVaMap(map)
      setPrompts((pts ?? []) as Prompt[])
    })
  }, [])

  // Fetch pending count (always, regardless of filter)
  const fetchPendingCount = useCallback(async () => {
    const { count } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'pending')
    setPendingCount(count ?? 0)
  }, [])

  // Fetch clients based on filter
  const fetchClients = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from('clients').select('*').order('registered_at', { ascending: false })
    if (filter !== 'all') q = q.eq('approval_status', filter)
    const { data } = await q
    let list = (data ?? []) as Client[]
    // For 'all': sort pending → approved → rejected
    if (filter === 'all') {
      const ord: Record<string, number> = { pending: 0, approved: 1, rejected: 2 }
      list = list.sort((a, b) => (ord[a.approval_status] ?? 3) - (ord[b.approval_status] ?? 3))
    }
    setClients(list)
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchClients(); fetchPendingCount() }, [fetchClients, fetchPendingCount])

  function handleActioned(id: string) {
    setClients(prev => prev.filter(c => c.id !== id))
    setPendingCount(prev => Math.max(0, prev - 1))
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingTop: 56, paddingBottom: 80, maxWidth: 880, margin: '0 auto', paddingInline: 48 }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }} className="s1">
        <h1 style={{ fontSize: 28, fontWeight: 300, color: T.black, margin: 0 }}>
          Pending approvals
        </h1>
        <p style={{ fontSize: 13, color: T.ter, marginTop: 8, marginBottom: 0 }}>
          {pendingCount === 0
            ? 'No clients waiting for review'
            : `${pendingCount} client${pendingCount !== 1 ? 's' : ''} waiting for review`}
        </p>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }} className="s2">
        {(['pending','approved','rejected','all'] as FilterType[]).map(f => (
          <FilterPill
            key={f}
            label={f.charAt(0).toUpperCase() + f.slice(1)}
            active={filter === f}
            onClick={() => setFilter(f)}
          />
        ))}
      </div>

      {/* Table header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        paddingBottom: 12, borderBottom: `1px solid ${T.div}`,
        marginBottom: 0,
      }} className="s3">
        {['Store', 'Details', 'Submitted'].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter }}>
            {h}
          </span>
        ))}
      </div>

      {/* Skeletons */}
      {loading && Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 0', borderBottom: `1px solid ${T.row}`, gap: 16,
        }}>
          <Bone w="22%" h={11} />
          <Bone w="35%" h={9} />
          <Bone w="14%" h={9} />
        </div>
      ))}

      {/* Empty state */}
      {!loading && clients.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: 20, fontWeight: 300, color: T.ter }}>
            {filter === 'pending' ? 'No pending approvals' : `No ${filter} clients`}
          </div>
        </div>
      )}

      {/* Client rows */}
      {!loading && clients.map(client => {
        const vaName = vaMap[client.va_id] ?? '—'

        if (filter === 'approved' || (filter === 'all' && client.approval_status === 'approved')) {
          return <ApprovedRow key={client.id} client={client} vaName={vaName} />
        }
        if (filter === 'rejected' || (filter === 'all' && client.approval_status === 'rejected')) {
          return <RejectedRow key={client.id} client={client} vaName={vaName} />
        }
        // Pending
        return (
          <ClientApprovalRow
            key={client.id}
            client={client}
            vaName={vaName}
            prompts={prompts}
            onActioned={handleActioned}
          />
        )
      })}

    </div>
  )
}
