'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
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

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'pending' | 'approved' | 'rejected' | 'all'

type RequestData = {
  id: string
  va_id: string
  client_id: string
  request_text: string
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  // from clients
  store_name: string
  niche: string | null
  market: string | null
  language: string | null
  title_preference: string | null
  description_style: string | null
  special_instructions: string | null
  // from vas
  va_name: string
  // from client_profiles
  prompt_id: string | null
  prompt_name: string | null
}

type PromptOption = { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cap(s: string | null | undefined): string {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

function formatExact(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function isUrgent(text: string): boolean {
  return /urgent|asap|immediately/i.test(text)
}

// ─── Shared small components ──────────────────────────────────────────────────

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

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 3 }}>
      {children}
    </div>
  )
}

function PillToggleGroup({
  label, options, value, onChange,
}: { label: string; options: string[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <MiniLabel>{label}</MiniLabel>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(opt => {
          const active = value === opt
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              style={{
                padding: '3px 12px', borderRadius: 100, fontSize: 11,
                background: active ? T.black : 'none',
                color:      active ? T.bg    : T.sec,
                border:     `1px solid ${active ? T.black : '#EEEEEE'}`,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >
              {cap(opt)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PromptSelect({
  prompts, value, onChange,
}: { prompts: PromptOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <MiniLabel>Prompt template</MiniLabel>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: 13, color: T.black, background: 'none',
          border: 'none', borderBottom: `1.5px solid #EEEEEE`,
          outline: 'none', padding: '4px 0', fontFamily: 'inherit',
          width: '100%', cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
        onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
      >
        <option value="">— none —</option>
        {prompts.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Pending Row ──────────────────────────────────────────────────────────────

type Phase = 'idle' | 'editing' | 'rejecting' | 'noting'
type EditVals = {
  title_preference: string
  description_style: string
  special_instructions: string
  prompt_id: string
}

function PendingRow({
  request, prompts, expanded, onToggle, onActioned, animDelay,
}: {
  request: RequestData
  prompts: PromptOption[]
  expanded: boolean
  onToggle: () => void
  onActioned: (id: string) => void
  animDelay: number
}) {
  const [phase,        setPhase]       = useState<Phase>('idle')
  const [editVals,     setEditVals]    = useState<EditVals>({
    title_preference:   request.title_preference  ?? '',
    description_style:  request.description_style ?? '',
    special_instructions: request.special_instructions ?? '',
    prompt_id:          request.prompt_id ?? '',
  })
  const [adminNotes,   setAdminNotes]  = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [noteText,     setNoteText]    = useState(request.admin_notes ?? '')
  const [busy,         setBusy]        = useState(false)
  const [done,         setDone]        = useState<'approved' | 'rejected' | null>(null)

  const rejectRef = useRef<HTMLTextAreaElement>(null)
  const noteRef   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (phase === 'rejecting') setTimeout(() => rejectRef.current?.focus(), 50)
    if (phase === 'noting')    setTimeout(() => noteRef.current?.focus(),   50)
  }, [phase])

  const urgent = isUrgent(request.request_text)
  const preview = request.request_text.length > 60
    ? request.request_text.slice(0, 60) + '…'
    : request.request_text

  async function confirmApprove() {
    setBusy(true)
    const notesText = adminNotes.trim() || 'Your requested changes have been applied.'

    await supabase.from('clients').update({
      title_preference:    editVals.title_preference    || null,
      description_style:   editVals.description_style   || null,
      special_instructions: editVals.special_instructions.trim() || null,
    }).eq('id', request.client_id)

    if (editVals.prompt_id) {
      await supabase.from('client_profiles').upsert({
        client_id:  request.client_id,
        prompt_id:  editVals.prompt_id,
        updated_at: new Date().toISOString(),
        updated_by: 'admin',
      }, { onConflict: 'client_id' })
    }

    await supabase.from('profile_change_requests').update({
      status:      'approved',
      admin_notes: notesText,
      resolved_at: new Date().toISOString(),
    }).eq('id', request.id)

    await supabase.from('notifications').insert({
      va_id:    request.va_id,
      type:     'request_approved',
      title:    `Profile updated for ${request.store_name}`,
      message:  notesText,
      is_read:  false,
    })

    void logActivity({ action: 'change_request_approved', va_id: request.va_id, request_id: request.id, source: 'admin', details: `Profile change approved for ${request.store_name} (VA ${request.va_id})` })
    setBusy(false)
    setDone('approved')
    setTimeout(() => onActioned(request.id), 2200)
  }

  async function confirmReject() {
    if (!rejectReason.trim()) return
    setBusy(true)

    await supabase.from('profile_change_requests').update({
      status:      'rejected',
      admin_notes: rejectReason.trim(),
      resolved_at: new Date().toISOString(),
    }).eq('id', request.id)

    await supabase.from('notifications').insert({
      va_id:    request.va_id,
      type:     'request_rejected',
      title:    `Profile change rejected for ${request.store_name}`,
      message:  rejectReason.trim(),
      is_read:  false,
    })

    void logActivity({ action: 'change_request_rejected', va_id: request.va_id, request_id: request.id, source: 'admin', severity: 'warning', details: `Profile change rejected for ${request.store_name}: ${rejectReason.trim()}` })
    setBusy(false)
    setDone('rejected')
    setTimeout(() => onActioned(request.id), 2200)
  }

  async function saveNotes() {
    if (!noteText.trim()) return
    setBusy(true)
    await supabase.from('profile_change_requests')
      .update({ admin_notes: noteText.trim() })
      .eq('id', request.id)
    setBusy(false)
    setPhase('idle')
  }

  // Done state — fade-out toast
  if (done) {
    return (
      <div style={{
        padding: '14px 0',
        borderBottom: `1px solid ${T.row}`,
        animation: 'fadeOut 0.3s ease 1.9s forwards',
      }}>
        <span style={{ fontSize: 13, color: done === 'approved' ? T.green : T.sec }}>
          {done === 'approved' ? '✓ Request approved' : '✗ Request rejected'}
        </span>
      </div>
    )
  }

  const profileLine = [
    request.niche ? cap(request.niche) : null,
    request.market,
    request.language ? cap(request.language) : null,
  ].filter(Boolean).join(' · ')

  const profileLine2 = [
    request.title_preference  ? `${cap(request.title_preference)} titles` : null,
    request.description_style ? cap(request.description_style) : null,
    request.prompt_name       ? `Prompt: ${request.prompt_name}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ animation: `fadeUp 0.3s ease both`, animationDelay: `${animDelay}ms` }}>
      {/* ── Compact row ─────────────────────────────────────────────── */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '18px 0',
          borderBottom: expanded ? 'none' : `1px solid ${T.row}`,
          cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        {/* Left: store + VA */}
        <div style={{ flex: '0 0 220px', minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{request.store_name}</span>
          <span style={{ fontSize: 12, color: T.sec, marginLeft: 8 }}>{request.va_name}</span>
        </div>

        {/* Middle: request preview */}
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </div>

        {/* Right: priority + date */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 11,
            color:       urgent ? T.black : T.ter,
            fontWeight:  urgent ? 500 : 400,
          }}>
            {urgent ? 'Urgent' : 'Normal'}
          </span>
          <span style={{ fontSize: 12, color: T.ter }}>
            Submitted {timeAgo(request.created_at)}
          </span>
          <span style={{ fontSize: 12, color: T.ghost, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>
            ▾
          </span>
        </div>
      </div>

      {/* ── Expanded content ─────────────────────────────────────────── */}
      <div style={{
        maxHeight: expanded ? 900 : 0,
        overflow: 'hidden',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.35s ease, opacity 0.25s ease',
      }}>
        <div style={{
          padding: '20px 0 24px 0',
          borderBottom: `1px solid ${T.row}`,
        }}>

          {/* ── Request meta ── */}
          <div style={{ display: 'flex', gap: 40, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <MiniLabel>From</MiniLabel>
              <div style={{ fontSize: 14, color: T.black }}>{request.va_name}</div>
            </div>
            <div>
              <MiniLabel>Client</MiniLabel>
              <div style={{ fontSize: 14, color: T.black }}>{request.store_name}</div>
            </div>
            <div>
              <MiniLabel>Submitted</MiniLabel>
              <div style={{ fontSize: 14, color: T.black }}>{formatExact(request.created_at)}</div>
            </div>
            <div>
              <MiniLabel>Priority</MiniLabel>
              <div style={{ fontSize: 14, fontWeight: urgent ? 500 : 400, color: T.black }}>
                {urgent ? 'Urgent' : 'Normal'}
              </div>
            </div>
          </div>

          {/* ── Request text ── */}
          <div style={{ marginBottom: 16 }}>
            <MiniLabel>Request</MiniLabel>
            <div style={{ fontSize: 14, color: '#666666', lineHeight: 1.6, maxWidth: 600 }}>
              {request.request_text}
            </div>
          </div>

          {/* ── Current profile ── */}
          <div style={{ marginBottom: 16 }}>
            <MiniLabel>Current profile</MiniLabel>
            <div style={{ fontSize: 12, color: T.sec }}>
              {profileLine && <span>{profileLine}</span>}
              {profileLine && profileLine2 && <span style={{ color: T.ghost }}> · </span>}
              {profileLine2 && <span>{profileLine2}</span>}
              {request.special_instructions && (
                <div style={{ marginTop: 4, fontStyle: 'italic', color: '#BBBBBB' }}>
                  "{request.special_instructions}"
                </div>
              )}
              {!profileLine && !profileLine2 && <span style={{ color: T.ghost }}>No profile data</span>}
            </div>
          </div>

          {/* ── Action area ── */}
          {phase === 'idle' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={e => { e.stopPropagation(); setPhase('editing') }}
                style={{
                  fontSize: 13, fontWeight: 500, color: T.bg,
                  background: T.black, border: 'none', borderRadius: 100,
                  padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Apply &amp; approve
              </button>
              <button
                onClick={e => { e.stopPropagation(); setPhase('rejecting') }}
                style={{
                  fontSize: 13, color: T.sec,
                  background: 'none', border: `1px solid #EEEEEE`, borderRadius: 100,
                  padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.ter; e.currentTarget.style.color = T.black }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#EEEEEE'; e.currentTarget.style.color = T.sec }}
              >
                Reject
              </button>
              <button
                onClick={e => { e.stopPropagation(); setPhase('noting') }}
                style={{
                  fontSize: 12, color: T.ter,
                  background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >
                Add notes
              </button>
            </div>
          )}

          {/* ── Edit / Apply & Approve mode ── */}
          {phase === 'editing' && (
            <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 12, color: T.sec, marginBottom: 16 }}>
                Adjust the profile settings based on the request, then save.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', maxWidth: 600 }}>
                <PillToggleGroup
                  label="Title preference"
                  options={['short', 'medium', 'long']}
                  value={editVals.title_preference}
                  onChange={v => setEditVals(p => ({ ...p, title_preference: v }))}
                />
                <PillToggleGroup
                  label="Description style"
                  options={['emotional', 'technical', 'casual', 'luxury', 'neutral']}
                  value={editVals.description_style}
                  onChange={v => setEditVals(p => ({ ...p, description_style: v }))}
                />
              </div>
              <div style={{ maxWidth: 480, marginBottom: 14 }}>
                <PromptSelect
                  prompts={prompts}
                  value={editVals.prompt_id}
                  onChange={v => setEditVals(p => ({ ...p, prompt_id: v }))}
                />
              </div>
              <div style={{ maxWidth: 480, marginBottom: 20 }}>
                <MiniLabel>Special instructions</MiniLabel>
                <textarea
                  value={editVals.special_instructions}
                  onChange={e => setEditVals(p => ({ ...p, special_instructions: e.target.value }))}
                  placeholder="e.g. Always mention sustainability where relevant"
                  rows={2}
                  style={{
                    width: '100%', fontSize: 13, color: T.black,
                    background: 'none', border: 'none', outline: 'none',
                    borderBottom: '1.5px solid #EEEEEE',
                    resize: 'none', padding: '4px 0',
                    fontFamily: 'inherit', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
                  onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
                />
              </div>
              <div style={{ maxWidth: 480, marginBottom: 20 }}>
                <MiniLabel>Notes for VA</MiniLabel>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="e.g. Done. Title structure changed to short format."
                  rows={2}
                  style={{
                    width: '100%', fontSize: 13, color: T.black,
                    background: 'none', border: 'none', outline: 'none',
                    borderBottom: '1.5px solid #EEEEEE',
                    resize: 'none', padding: '4px 0',
                    fontFamily: 'inherit', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
                  onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => { if (!busy) confirmApprove() }}
                  disabled={busy}
                  style={{
                    fontSize: 13, fontWeight: 500, color: T.bg,
                    background: T.black, border: 'none', borderRadius: 100,
                    padding: '8px 20px', cursor: busy ? 'default' : 'pointer',
                    fontFamily: 'inherit', transition: 'opacity 0.15s',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  {busy ? 'Saving…' : 'Save & approve'}
                </button>
                <button
                  onClick={() => setPhase('idle')}
                  style={{
                    fontSize: 12, color: T.ter,
                    background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Reject mode ── */}
          {phase === 'rejecting' && (
            <div style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
              <MiniLabel>Reason</MiniLabel>
              <textarea
                ref={rejectRef}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. This change is not possible with current templates"
                rows={2}
                style={{
                  width: '100%', fontSize: 13, color: T.black,
                  background: 'none', border: 'none', outline: 'none',
                  borderBottom: '1.5px solid #EEEEEE',
                  resize: 'none', padding: '4px 0',
                  fontFamily: 'inherit', transition: 'border-color 0.15s',
                  marginBottom: 16,
                }}
                onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
                onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => { if (!busy && rejectReason.trim()) confirmReject() }}
                  disabled={busy || !rejectReason.trim()}
                  style={{
                    fontSize: 13, color: T.sec,
                    background: 'none', border: `1px solid #EEEEEE`, borderRadius: 100,
                    padding: '8px 20px', cursor: (busy || !rejectReason.trim()) ? 'default' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                    opacity: (busy || !rejectReason.trim()) ? 0.4 : 1,
                  }}
                >
                  {busy ? 'Saving…' : 'Confirm rejection'}
                </button>
                <button
                  onClick={() => setPhase('idle')}
                  style={{
                    fontSize: 12, color: T.ter,
                    background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Add notes mode ── */}
          {phase === 'noting' && (
            <div style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
              <MiniLabel>Note (visible to admin only)</MiniLabel>
              <textarea
                ref={noteRef}
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="e.g. Asked VA for more context — waiting on reply"
                rows={2}
                style={{
                  width: '100%', fontSize: 13, color: T.black,
                  background: 'none', border: 'none', outline: 'none',
                  borderBottom: '1.5px solid #EEEEEE',
                  resize: 'none', padding: '4px 0',
                  fontFamily: 'inherit', transition: 'border-color 0.15s',
                  marginBottom: 16,
                }}
                onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
                onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => { if (!busy && noteText.trim()) saveNotes() }}
                  disabled={busy || !noteText.trim()}
                  style={{
                    fontSize: 13, fontWeight: 500, color: T.bg,
                    background: T.black, border: 'none', borderRadius: 100,
                    padding: '8px 20px', cursor: (busy || !noteText.trim()) ? 'default' : 'pointer',
                    fontFamily: 'inherit', transition: 'opacity 0.15s',
                    opacity: (busy || !noteText.trim()) ? 0.4 : 1,
                  }}
                >
                  {busy ? 'Saving…' : 'Save note'}
                </button>
                <button
                  onClick={() => setPhase('idle')}
                  style={{
                    fontSize: 12, color: T.ter,
                    background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Approved Row (compact, not expandable) ───────────────────────────────────

function ApprovedRow({ request, animDelay }: { request: RequestData; animDelay: number }) {
  const notesPreview = request.admin_notes
    ? (request.admin_notes.length > 30 ? request.admin_notes.slice(0, 30) + '…' : request.admin_notes)
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 0',
      borderBottom: `1px solid ${T.row}`,
      animation: `fadeUp 0.3s ease both`,
      animationDelay: `${animDelay}ms`,
    }}>
      <div style={{ flex: '0 0 220px', minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{request.store_name}</span>
        <span style={{ fontSize: 12, color: T.sec, marginLeft: 8 }}>{request.va_name}</span>
      </div>
      <div style={{ flex: 1, fontSize: 12, color: T.sec }}>
        {notesPreview ?? <span style={{ color: T.ghost }}>No notes</span>}
      </div>
      <div style={{ flexShrink: 0, fontSize: 12, color: T.ter }}>
        {request.resolved_at ? `Applied ${timeAgo(request.resolved_at)}` : '—'}
      </div>
    </div>
  )
}

// ─── Rejected Row (compact, not expandable) ───────────────────────────────────

function RejectedRow({ request, animDelay }: { request: RequestData; animDelay: number }) {
  const reasonPreview = request.admin_notes
    ? (request.admin_notes.length > 50 ? request.admin_notes.slice(0, 50) + '…' : request.admin_notes)
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 0',
      borderBottom: `1px solid ${T.row}`,
      opacity: 0.5,
      animation: `fadeUp 0.3s ease both`,
      animationDelay: `${animDelay}ms`,
    }}>
      <div style={{ flex: '0 0 220px', minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{request.store_name}</span>
        <span style={{ fontSize: 12, color: T.sec, marginLeft: 8 }}>{request.va_name}</span>
      </div>
      <div style={{ flex: 1, fontSize: 12, color: T.sec, fontStyle: 'italic' }}>
        {reasonPreview ?? <span style={{ color: T.ghost }}>No reason given</span>}
      </div>
      <div style={{ flexShrink: 0, fontSize: 12, color: T.ter }}>
        {request.resolved_at ? timeAgo(request.resolved_at) : '—'}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Bone({ w, h = 10 }: { w: number | string; h?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 4,
      background: T.div, animation: 'pulse 1.8s ease infinite',
    }} />
  )
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0', borderBottom: `1px solid ${T.row}` }}>
      <div style={{ flex: '0 0 220px' }}><Bone w={140} /></div>
      <div style={{ flex: 1 }}><Bone w="80%" /></div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 12 }}>
        <Bone w={40} />
        <Bone w={80} />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminRequestsPage() {
  const [requests,    setRequests]    = useState<RequestData[]>([])
  const [prompts,     setPrompts]     = useState<PromptOption[]>([])
  const [filter,      setFilter]      = useState<FilterType>('pending')
  const [loading,     setLoading]     = useState(true)
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [
      { data: rawRequests },
      { data: rawClients },
      { data: rawVAs },
      { data: rawProfiles },
      { data: rawPrompts },
    ] = await Promise.all([
      supabase.from('profile_change_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, store_name, niche, market, language, title_preference, description_style, special_instructions'),
      supabase.from('vas').select('id, name'),
      supabase.from('client_profiles').select('client_id, prompt_id'),
      supabase.from('prompts').select('id, name').order('name'),
    ])

    const clientMap  = Object.fromEntries((rawClients  ?? []).map(c => [c.id, c]))
    const vaMap      = Object.fromEntries((rawVAs      ?? []).map(v => [v.id, v.name]))
    const profileMap = Object.fromEntries((rawProfiles ?? []).map(p => [p.client_id, p.prompt_id]))
    const promptMap  = Object.fromEntries((rawPrompts  ?? []).map(p => [p.id, p.name]))

    const merged: RequestData[] = (rawRequests ?? []).map(r => {
      const client     = clientMap[r.client_id] ?? {}
      const promptId   = profileMap[r.client_id] ?? null
      return {
        id:           r.id,
        va_id:        r.va_id,
        client_id:    r.client_id,
        request_text: r.request_text,
        status:       r.status,
        admin_notes:  r.admin_notes,
        created_at:   r.created_at,
        resolved_at:  r.resolved_at,
        store_name:       client.store_name          ?? 'Unknown',
        niche:            client.niche               ?? null,
        market:           client.market              ?? null,
        language:         client.language            ?? null,
        title_preference: client.title_preference    ?? null,
        description_style:client.description_style   ?? null,
        special_instructions: client.special_instructions ?? null,
        va_name:          vaMap[r.va_id]             ?? 'Unknown VA',
        prompt_id:        promptId,
        prompt_name:      promptId ? (promptMap[promptId] ?? null) : null,
      }
    })

    setRequests(merged)
    setPendingCount(merged.filter(r => r.status === 'pending').length)
    setPrompts((rawPrompts ?? []).map(p => ({ id: p.id, name: p.name })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function handleActioned(id: string) {
    setRequests(prev => prev.filter(r => r.id !== id))
    setPendingCount(prev => Math.max(0, prev - 1))
    if (expandedId === id) setExpandedId(null)
  }

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = (() => {
    if (filter === 'all') {
      return [...requests].sort((a, b) => {
        const order = { pending: 0, approved: 1, rejected: 2 }
        return (order[a.status] - order[b.status]) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }
    return requests.filter(r => r.status === filter)
  })()

  const C = {
    outer: { maxWidth: 880, margin: '0 auto', paddingInline: 48 } as React.CSSProperties,
  }

  return (
    <div style={{ paddingTop: 64, paddingBottom: 80, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ ...C.outer, textAlign: 'center', marginBottom: 48 }}>
        <h1 style={{ fontSize: 28, fontWeight: 300, color: T.black, letterSpacing: '-0.03em', margin: '0 0 8px 0' }}>
          Profile change requests
        </h1>
        <div style={{ fontSize: 13, color: T.ter }}>
          {loading ? '—' : `${pendingCount} pending`}
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div style={{ ...C.outer, display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
        {(['pending', 'approved', 'rejected', 'all'] as FilterType[]).map(f => (
          <FilterPill
            key={f}
            label={f.charAt(0).toUpperCase() + f.slice(1)}
            active={filter === f}
            onClick={() => { setFilter(f); setExpandedId(null) }}
          />
        ))}
      </div>

      {/* ── List ────────────────────────────────────────────────────── */}
      <div style={C.outer}>
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: T.ghost }}>
            No {filter === 'all' ? '' : filter} requests
          </div>
        ) : (
          filtered.map((req, i) => {
            if (req.status === 'approved') {
              return <ApprovedRow key={req.id} request={req} animDelay={i * 40} />
            }
            if (req.status === 'rejected') {
              return <RejectedRow key={req.id} request={req} animDelay={i * 40} />
            }
            return (
              <PendingRow
                key={req.id}
                request={req}
                prompts={prompts}
                expanded={expandedId === req.id}
                onToggle={() => setExpandedId(p => p === req.id ? null : req.id)}
                onActioned={handleActioned}
                animDelay={i * 40}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
