'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { Client, Prompt, ClientProfile, ProfileChangeRequest, PromptRequest } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { getRecommendedPromptFromList, matchTypeColor } from '@/lib/prompt-matching'
import type { PromptRecommendation } from '@/lib/prompt-matching'
import { SelectAllCheckbox } from '@/components/admin/SelectAllCheckbox'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  black: '#111111', sec: '#555555', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA', bg: '#FFFFFF',
}

// ─── Extended types ────────────────────────────────────────────────────────────
type ClientWithVA = Client & { vas: { id: string; name: string } | null }
type ActiveVA = { id: string; name: string }
type PromptOption = { id: string; name: string; niche: string | null; language: string | null; is_default: boolean | null }
type CStatus = 'pending' | 'active' | 'rejected' | 'inactive' | 'expired'
type StatusFilter = 'all' | CStatus
type SortKey = 'activity' | 'nameAZ' | 'variants' | 'tier' | 'newest' | 'vaName'

type UploadRow = {
  id: string
  product_row_count: number | null
  unique_product_count: number | null
  status: string
  uploaded_at: string
  api_cost_usd: number | null
  processing_time_seconds: number | null
}

type BillingLineItemRow = {
  billing_id: string
  variant_count: number
  tier: string
  amount: number
  first_upload_at: string | null
  last_upload_at: string | null
}

type ClientProfileWithPrompt = ClientProfile & {
  prompts: { id: string; name: string; niche: string | null; language: string | null } | null
}

type DetailData = {
  uploads: UploadRow[]
  changeReqs: ProfileChangeRequest[]
  lineItems: BillingLineItemRow[]
  profile: ClientProfileWithPrompt | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clientStatus(c: ClientWithVA): CStatus {
  if (c.approval_status === 'pending') return 'pending'
  if (c.approval_status === 'rejected') return 'rejected'
  if (c.deadline_expired && !c.is_active) return 'expired'
  if (!c.is_active) return 'inactive'
  return 'active'
}

function tierLabel(tier: string | null): string {
  const map: Record<string, string> = { tier_1: 'T1 $50', tier_2: 'T2 $110', tier_3: 'T3 $220', tier_4: 'T4 $350' }
  return map[tier ?? ''] ?? '—'
}

function tierAmount(tier: string | null): number {
  const map: Record<string, number> = { tier_1: 50, tier_2: 110, tier_3: 220, tier_4: 350 }
  return map[tier ?? ''] ?? 0
}

function variantsToTier(variants: number): string {
  if (variants <= 200) return 'tier_1'
  if (variants <= 400) return 'tier_2'
  if (variants <= 1000) return 'tier_3'
  return 'tier_4'
}

function relDate(iso: string | null): string {
  if (!iso) return 'Never'
  const now = new Date()
  const d = new Date(iso)
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 86400) return 'Today'
  if (diff < 172800) return 'Yesterday'
  const days = Math.floor(diff / 86400)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeRemaining(iso: string): string {
  const now = new Date()
  const deadline = new Date(iso)
  const diff = Math.floor((deadline.getTime() - now.getTime()) / 1000)
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}m remaining`
}

function downloadCSV(filename: string, rows: (string | number | null)[][]): void {
  const content = rows.map(r =>
    r.map(v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  ).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Prompt template dropdown ─────────────────────────────────────────────────
function PromptDropdown({
  prompts,
  clientNiche,
  clientLanguage,
  value,
  onChange,
}: {
  prompts: PromptOption[]
  clientNiche: string | null
  clientLanguage: string | null
  value: string
  onChange: (id: string) => void
}) {
  // Compute recommendation using 4-level fallback logic
  const recommendation = useMemo(() => {
    // Cast PromptOption[] to Prompt[] (compatible shape for the fields we need)
    return getRecommendedPromptFromList(
      prompts as unknown as import('@/lib/supabase').Prompt[],
      clientNiche,
      clientLanguage,
    )
  }, [prompts, clientNiche, clientLanguage])

  // Sort: recommended first, then same niche, then same language, then alpha
  const sorted = useMemo(() => {
    return [...prompts].sort((a, b) => {
      const aRec = recommendation?.prompt.id === a.id
      const bRec = recommendation?.prompt.id === b.id
      if (aRec && !bRec) return -1
      if (!aRec && bRec) return 1
      const aNiche = a.niche === clientNiche
      const bNiche = b.niche === clientNiche
      if (aNiche && !bNiche) return -1
      if (!aNiche && bNiche) return 1
      return a.name.localeCompare(b.name)
    })
  }, [prompts, clientNiche, clientLanguage, recommendation])

  // Determine which match type applies for the currently selected value
  const selectedMatchType = useMemo((): PromptRecommendation | null => {
    if (!value || value !== recommendation?.prompt.id) return null
    return recommendation
  }, [value, recommendation])

  return (
    <div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', border: `1px solid ${T.div}`,
          borderRadius: 8, fontSize: 13, color: T.black, background: T.bg,
          outline: 'none', cursor: 'pointer',
        }}
      >
        <option value="">— Select template —</option>
        {sorted.map(p => {
          const isRec = recommendation?.prompt.id === p.id
          return (
            <option key={p.id} value={p.id}>
              {p.name}{isRec ? ' ★ Recommended' : ''}{p.is_default ? ' (default)' : ''}
            </option>
          )
        })}
      </select>
      {/* Match type explanation */}
      {recommendation && (
        <div style={{ fontSize: 11, marginTop: 6, color: selectedMatchType ? matchTypeColor(selectedMatchType.matchType) : T.ghost }}>
          {selectedMatchType
            ? recommendation.reason
            : `Recommended: ${recommendation.prompt.name} — ${recommendation.reason}`
          }
        </div>
      )}
    </div>
  )
}

// ─── Client detail section ────────────────────────────────────────────────────
function ClientDetail({
  client,
  allVAs,
  allPrompts,
  onRefresh,
}: {
  client: ClientWithVA
  allVAs: ActiveVA[]
  allPrompts: PromptOption[]
  onRefresh: () => void
}) {
  const [detail, setDetail] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)

  // Admin notes
  const [adminNotes, setAdminNotes] = useState(client.admin_notes ?? '')
  const [notesSaved, setNotesSaved] = useState(false)

  // Approval flow
  const [approveMode, setApproveMode] = useState(false)
  const [approvePromptId, setApprovePromptId] = useState('')
  const [approving, setApproving] = useState(false)

  // Reject flow
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Deactivate flow
  const [deactivateMode, setDeactivateMode] = useState(false)
  const [deactivateReason, setDeactivateReason] = useState('')
  const [deactivating, setDeactivating] = useState(false)

  // Transfer flow
  const [transferMode, setTransferMode] = useState(false)
  const [transferVAId, setTransferVAId] = useState('')
  const [transferNotify, setTransferNotify] = useState(true)
  const [transferring, setTransferring] = useState(false)

  // Change prompt flow
  const [changePromptMode, setChangePromptMode] = useState(false)
  const [changePromptId, setChangePromptId] = useState('')
  const [changingPrompt, setChangingPrompt] = useState(false)

  // Delete flow
  const [deleteMode, setDeleteMode] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Profile edit
  const [editProfileMode, setEditProfileMode] = useState(false)
  const [editPromptId, setEditPromptId] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Prompt requests
  const [promptRequests, setPromptRequests] = useState<PromptRequest[]>([])
  const [adminResponses, setAdminResponses] = useState<Record<string, string>>({})

  const status = clientStatus(client)

  // Auto-select recommended prompt using full 4-level fallback logic
  useEffect(() => {
    if (allPrompts.length === 0) return
    const rec = getRecommendedPromptFromList(
      allPrompts as unknown as import('@/lib/supabase').Prompt[],
      client.niche ?? null,
      client.language ?? null,
    )
    if (rec) {
      setApprovePromptId(rec.prompt.id)
      setChangePromptId(rec.prompt.id)
      setEditPromptId(rec.prompt.id)
    }
  }, [allPrompts, client.niche, client.language])

  useEffect(() => {
    async function load() {
      const [
        { data: uploads },
        { data: changeReqs },
        { data: lineItems },
        { data: profile },
      ] = await Promise.all([
        supabase.from('uploads')
          .select('id,product_row_count,unique_product_count,status,uploaded_at,api_cost_usd,processing_time_seconds')
          .eq('client_id', client.id)
          .order('uploaded_at', { ascending: false })
          .limit(5),
        supabase.from('profile_change_requests')
          .select('*')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false }),
        supabase.from('billing_line_items')
          .select('billing_id,variant_count,tier,amount,first_upload_at,last_upload_at')
          .eq('client_id', client.id)
          .order('first_upload_at', { ascending: false })
          .limit(6),
        supabase.from('client_profiles')
          .select('*, prompts(id,name,niche,language)')
          .eq('client_id', client.id)
          .maybeSingle(),
      ])
      setDetail({
        uploads: (uploads ?? []) as unknown as UploadRow[],
        changeReqs: (changeReqs ?? []) as unknown as ProfileChangeRequest[],
        lineItems: (lineItems ?? []) as unknown as BillingLineItemRow[],
        profile: profile as unknown as ClientProfileWithPrompt | null,
      })
      if (profile) {
        setEditPromptId((profile as unknown as ClientProfileWithPrompt).prompt_id ?? '')
      }
      setLoading(false)
    }
    void load()
    void loadPromptRequests()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  async function loadPromptRequests() {
    const { data } = await supabase
      .from('prompt_requests')
      .select('*, vas(name), clients(store_name)')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
    setPromptRequests((data || []) as unknown as PromptRequest[])
  }

  async function getSignedUrl(pathOrUrl: string): Promise<string> {
    if (pathOrUrl.startsWith('http')) return pathOrUrl
    const { data } = await supabase.storage.from('prompt-requests').createSignedUrl(pathOrUrl, 3600)
    return data?.signedUrl || ''
  }

  async function markRequestReviewed(requestId: string) {
    await supabase.from('prompt_requests').update({
      status: 'reviewed',
      admin_response: adminResponses[requestId] || null,
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)
    await loadPromptRequests()
  }

  async function markRequestApplied(requestId: string, vaId: string, storeName: string) {
    const response = adminResponses[requestId]
    if (!response?.trim()) { alert('Please add a response explaining what was changed.'); return }
    await supabase.from('prompt_requests').update({
      status: 'applied',
      admin_response: response,
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)
    await supabase.from('notifications').insert({
      va_id: vaId,
      type: 'request_approved',
      title: `Optimization updated — ${storeName}`,
      message: response,
      is_read: false,
    })
    await loadPromptRequests()
  }

  async function rejectRequest(requestId: string, vaId: string, storeName: string) {
    const response = adminResponses[requestId]
    if (!response?.trim()) { alert('Please explain why this request was rejected.'); return }
    await supabase.from('prompt_requests').update({
      status: 'rejected',
      admin_response: response,
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)
    await supabase.from('notifications').insert({
      va_id: vaId,
      type: 'request_rejected',
      title: `Request update — ${storeName}`,
      message: response,
      is_read: false,
    })
    await loadPromptRequests()
  }

  async function handleApprove() {
    setApproving(true)
    const now = new Date().toISOString()
    const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    await supabase.from('clients').update({
      approval_status: 'approved',
      approved_at: now,
      approved_by: 'admin',
      is_active: true,
      deadline_48h: deadline,
      deadline_expired: false,
    }).eq('id', client.id)
    // Upsert client_profiles
    if (approvePromptId) {
      const existing = await supabase.from('client_profiles').select('id').eq('client_id', client.id).maybeSingle()
      if (existing.data) {
        await supabase.from('client_profiles').update({ prompt_id: approvePromptId, updated_at: now, updated_by: 'admin' }).eq('client_id', client.id)
      } else {
        await supabase.from('client_profiles').insert({ client_id: client.id, prompt_id: approvePromptId, updated_at: now, updated_by: 'admin' })
      }
    }
    // Notify VA
    await supabase.from('notifications').insert({
      va_id: client.va_id,
      type: 'client_approved',
      title: 'Client approved',
      message: `${client.store_name} has been approved.`,
      is_read: false,
      created_at: now,
    })
    const templateName = allPrompts.find(p => p.id === approvePromptId)?.name ?? '—'
    void logActivity({ action: 'client_approved', details: `Approved client ${client.store_name} with template: ${templateName}`, client_id: client.id, source: 'admin', severity: 'info' })
    setApproveMode(false)
    setApproving(false)
    onRefresh()
  }

  async function handleReject() {
    setRejecting(true)
    const now = new Date().toISOString()
    await supabase.from('clients').update({
      approval_status: 'rejected',
      rejection_reason: rejectReason,
      is_active: false,
    }).eq('id', client.id)
    await supabase.from('notifications').insert({
      va_id: client.va_id,
      type: 'client_rejected',
      title: 'Client rejected',
      message: `${client.store_name} has been rejected.`,
      is_read: false,
      created_at: now,
    })
    void logActivity({ action: 'client_rejected', details: `Rejected client ${client.store_name}: ${rejectReason}`, client_id: client.id, source: 'admin', severity: 'info' })
    setRejectMode(false)
    setRejecting(false)
    onRefresh()
  }

  async function handleDeactivate() {
    setDeactivating(true)
    const now = new Date().toISOString()
    await supabase.from('clients').update({
      is_active: false,
      deactivation_reason: deactivateReason,
      deactivated_at: now,
    }).eq('id', client.id)
    await supabase.from('notifications').insert({
      va_id: client.va_id,
      type: 'client_rejected',
      title: 'Client deactivated',
      message: `${client.store_name} has been deactivated.`,
      is_read: false,
      created_at: now,
    })
    void logActivity({ action: 'client_deactivated', details: `Deactivated client ${client.store_name}: ${deactivateReason}`, client_id: client.id, source: 'admin', severity: 'warning' })
    setDeactivateMode(false)
    setDeactivating(false)
    onRefresh()
  }

  async function handleReactivate(withDeadline = false) {
    const now = new Date().toISOString()
    const update: Record<string, string | boolean | null> = {
      is_active: true,
      deactivated_at: null,
      deactivation_reason: null,
    }
    if (withDeadline) {
      update.deadline_48h = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
      update.deadline_expired = false
    }
    await supabase.from('clients').update(update).eq('id', client.id)
    await supabase.from('notifications').insert({
      va_id: client.va_id,
      type: 'client_approved',
      title: 'Client reactivated',
      message: `${client.store_name} has been reactivated.`,
      is_read: false,
      created_at: now,
    })
    void logActivity({ action: 'client_reactivated', details: `Reactivated client ${client.store_name}`, client_id: client.id, source: 'admin', severity: 'info' })
    onRefresh()
  }

  async function handleTransfer() {
    setTransferring(true)
    const now = new Date().toISOString()
    const oldVAId = client.va_id
    await supabase.from('clients').update({ va_id: transferVAId }).eq('id', client.id)
    // Notify old VA
    await supabase.from('notifications').insert({
      va_id: oldVAId,
      type: 'client_rejected',
      title: 'Client transferred',
      message: `${client.store_name} has been transferred to another operator.`,
      is_read: false,
      created_at: now,
    })
    if (transferNotify) {
      await supabase.from('notifications').insert({
        va_id: transferVAId,
        type: 'client_approved',
        title: 'Client assigned',
        message: `${client.store_name} has been assigned to you.`,
        is_read: false,
        created_at: now,
      })
    }
    void logActivity({ action: 'client_transferred', details: `Transferred client ${client.store_name} to VA ${transferVAId}`, client_id: client.id, source: 'admin', severity: 'warning' })
    setTransferMode(false)
    setTransferring(false)
    onRefresh()
  }

  async function handleChangePrompt() {
    setChangingPrompt(true)
    const now = new Date().toISOString()
    const oldPromptName = detail?.profile?.prompts?.name ?? '—'
    const newPromptName = allPrompts.find(p => p.id === changePromptId)?.name ?? changePromptId
    const existing = await supabase.from('client_profiles').select('id').eq('client_id', client.id).maybeSingle()
    if (existing.data) {
      await supabase.from('client_profiles').update({ prompt_id: changePromptId, updated_at: now, updated_by: 'admin' }).eq('client_id', client.id)
    } else {
      await supabase.from('client_profiles').insert({ client_id: client.id, prompt_id: changePromptId, updated_at: now, updated_by: 'admin' })
    }
    void logActivity({
      action: 'prompt_template_changed',
      details: `Changed template for ${client.store_name}: "${oldPromptName}" → "${newPromptName}"`,
      client_id: client.id,
      source: 'admin',
      severity: 'info',
    })
    setChangePromptMode(false)
    setChangingPrompt(false)
    onRefresh()
  }

  async function handleSaveProfile() {
    setSavingProfile(true)
    const now = new Date().toISOString()
    const existing = await supabase.from('client_profiles').select('id').eq('client_id', client.id).maybeSingle()
    if (existing.data) {
      await supabase.from('client_profiles').update({ prompt_id: editPromptId, updated_at: now, updated_by: 'admin' }).eq('client_id', client.id)
    } else {
      await supabase.from('client_profiles').insert({ client_id: client.id, prompt_id: editPromptId, updated_at: now, updated_by: 'admin' })
    }
    void logActivity({ action: 'profile_updated', details: `Updated profile for client ${client.store_name}`, client_id: client.id, source: 'admin', severity: 'info' })
    setSavingProfile(false)
    setEditProfileMode(false)
    onRefresh()
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('clients').delete().eq('id', client.id)
    void logActivity({ action: 'client_deleted', details: `Deleted client ${client.store_name}`, client_id: client.id, source: 'admin', severity: 'warning' })
    setDeleting(false)
    onRefresh()
  }

  async function handleExtendDeadline() {
    if (!client.deadline_48h) return
    const current = new Date(client.deadline_48h)
    const extended = new Date(current.getTime() + 24 * 3600 * 1000).toISOString()
    await supabase.from('clients').update({ deadline_48h: extended, deadline_expired: false }).eq('id', client.id)
    onRefresh()
  }

  async function handleCancelDeadline() {
    await supabase.from('clients').update({ deadline_48h: null, deadline_expired: false }).eq('id', client.id)
    onRefresh()
  }

  async function handleSaveNotes() {
    await supabase.from('clients').update({ admin_notes: adminNotes }).eq('id', client.id)
    void logActivity({ action: 'admin_notes_updated', details: `Updated notes for client ${client.store_name}`, client_id: client.id, source: 'admin', severity: 'info' })
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  const label9 = { fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#DDDDDD', marginBottom: 4 }
  const val14 = { fontSize: 14, color: T.black, marginBottom: 16 }

  return (
    <div style={{ padding: '20px 0', borderTop: `1px solid ${T.div}` }}>
      {loading ? (
        <div style={{ fontSize: 13, color: T.ter, padding: '16px 0' }}>Loading detail…</div>
      ) : (
        <>
          {/* Section A: Store Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginBottom: 32 }}>
            {/* Left */}
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 16 }}>Store Details</div>
              <div style={label9}>STORE NAME</div>
              <div style={val14}>{client.store_name}</div>
              <div style={label9}>STORE DOMAIN</div>
              <div style={{ ...val14 }}>
                {client.store_domain
                  ? <a href={`https://${client.store_domain}`} target="_blank" rel="noreferrer" style={{ color: T.black, textDecoration: 'underline' }}>{client.store_domain}</a>
                  : <span style={{ color: '#DDDDDD' }}>—</span>}
              </div>
              <div style={label9}>NICHE</div>
              <div style={val14}>{client.niche ?? <span style={{ color: '#DDDDDD' }}>—</span>}</div>
              <div style={label9}>MARKET</div>
              <div style={val14}>{client.market ?? <span style={{ color: '#DDDDDD' }}>—</span>}</div>
              <div style={label9}>LANGUAGE</div>
              <div style={val14}>{client.language ?? <span style={{ color: '#DDDDDD' }}>—</span>}</div>
              <div style={label9}>REGISTERED</div>
              <div style={val14}>{fmtDate(client.registered_at)} (by {client.vas?.name ?? '—'})</div>
              <div style={label9}>APPROVED</div>
              <div style={val14}>
                {client.approved_at
                  ? `${fmtDate(client.approved_at)} (by ${client.approved_by ?? '—'})`
                  : <span style={{ color: '#DDDDDD' }}>Not approved</span>}
              </div>
            </div>
            {/* Right */}
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 16 }}>Preferences</div>
              <div style={label9}>VA</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: T.black }}>{client.vas?.name ?? '—'}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: T.ghost }}>{client.va_id}</div>
              </div>
              <div style={label9}>TITLE PREFERENCE</div>
              <div style={val14}>{client.title_preference ?? <span style={{ color: '#DDDDDD' }}>—</span>}</div>
              <div style={label9}>DESCRIPTION STYLE</div>
              <div style={val14}>{client.description_style ?? <span style={{ color: '#DDDDDD' }}>—</span>}</div>
              <div style={label9}>EXPECTED PRODUCTS</div>
              <div style={val14}>{client.expected_monthly_products != null ? `${client.expected_monthly_products}/month` : <span style={{ color: '#DDDDDD' }}>—</span>}</div>
              <div style={label9}>SPECIAL INSTRUCTIONS</div>
              <div style={{ ...val14, whiteSpace: 'pre-wrap' }}>{client.special_instructions ?? <span style={{ color: '#DDDDDD' }}>None</span>}</div>
              <div style={label9}>LISTING PREFERENCES</div>
              <div style={{ marginBottom: 16 }}>
                {detail?.profile?.custom_requirements ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#CCCCCC' }}>Custom requirements</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: '#F59E0B', background: '#FFF8E7', padding: '2px 8px', borderRadius: 4 }}>
                      Yes — see Prompt Requests tab
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: 14, color: '#DDDDDD' }}>Using HigherUp templates</span>
                )}
              </div>
            </div>
          </div>

          {/* Section B: Optimization Profile */}
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>Optimization Profile</div>
              <button
                onClick={() => setEditProfileMode(v => !v)}
                style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                {editProfileMode ? 'Cancel' : 'Edit profile'}
              </button>
            </div>
            {detail?.profile ? (
              <div>
                <div style={label9}>PROMPT TEMPLATE</div>
                {editProfileMode ? (
                  <div style={{ marginBottom: 12 }}>
                    <PromptDropdown
                      prompts={allPrompts}
                      clientNiche={client.niche ?? null}
                      clientLanguage={client.language ?? null}
                      value={editPromptId}
                      onChange={setEditPromptId}
                    />
                    <button
                      onClick={() => void handleSaveProfile()}
                      disabled={savingProfile || !editPromptId}
                      style={{ marginTop: 8, padding: '6px 14px', background: T.black, color: T.bg, border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                    >
                      {savingProfile ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: T.black, marginBottom: 4 }}>
                    <a href={`/admin/prompts`} style={{ color: T.black, textDecoration: 'underline' }}>
                      {detail.profile.prompts?.name ?? 'Unknown'}
                    </a>
                  </div>
                )}
                {detail.profile.prompts && (
                  <div style={{ fontSize: 11, color: T.ghost }}>
                    {detail.profile.prompts.niche ?? '—'} · {detail.profile.prompts.language ?? '—'}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, color: '#DDDDDD', marginBottom: 12 }}>Not assigned</div>
                {editProfileMode && (
                  <div>
                    <PromptDropdown
                      prompts={allPrompts}
                      clientNiche={client.niche ?? null}
                      clientLanguage={client.language ?? null}
                      value={editPromptId}
                      onChange={setEditPromptId}
                    />
                    <button
                      onClick={() => void handleSaveProfile()}
                      disabled={savingProfile || !editPromptId}
                      style={{ marginTop: 8, padding: '6px 14px', background: T.black, color: T.bg, border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                    >
                      {savingProfile ? 'Saving…' : 'Assign template'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section C: Stats */}
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 16 }}>Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                ['Products this month', `${client.current_month_variants ?? 0}`],
                ['Current tier', `${tierLabel(client.current_month_tier)} ($${tierAmount(client.current_month_tier)})`],
                ['Total products all time', `${client.total_variants_processed ?? 0}`],
                ['Total uploads', `${client.total_uploads ?? 0}`],
                ['Last upload', relDate(client.last_upload_at)],
                ['Detected as Shopify', client.detected_as_shopify ? 'Yes' : 'No'],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={label9}>{label}</div>
                  <div style={{ fontSize: 14, color: T.black }}>{val}</div>
                </div>
              ))}
              <div>
                <div style={label9}>LAST COLUMN MAPPING</div>
                <div style={{ fontSize: 13, color: T.sec }}>
                  {client.last_column_mapping
                    ? Object.keys(client.last_column_mapping).join(', ')
                    : <span style={{ color: '#DDDDDD' }}>None</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Section D: Recent Uploads */}
          {detail && detail.uploads.length > 0 && (
            <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 12 }}>Recent Uploads</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Products', 'Unique', 'Status', 'Cost', 'Time'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, paddingBottom: 8, fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.uploads.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontSize: 12, color: T.ghost, fontFamily: 'monospace', padding: '6px 0' }}>{fmtDate(u.uploaded_at)}</td>
                      <td style={{ fontSize: 13, color: T.black, padding: '6px 8px 6px 0' }}>{u.product_row_count ?? '—'}</td>
                      <td style={{ fontSize: 13, color: T.black, padding: '6px 8px 6px 0' }}>{u.unique_product_count ?? '—'}</td>
                      <td style={{ fontSize: 13, color: T.black, padding: '6px 8px 6px 0' }}>{u.status}</td>
                      <td style={{ fontSize: 13, color: T.black, padding: '6px 8px 6px 0' }}>{u.api_cost_usd != null ? `$${u.api_cost_usd.toFixed(4)}` : '—'}</td>
                      <td style={{ fontSize: 13, color: T.black, padding: '6px 0' }}>{u.processing_time_seconds != null ? `${u.processing_time_seconds}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section E: Change Request History */}
          {detail && (
            <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 12 }}>
                CHANGE REQUESTS ({detail.changeReqs.length})
              </div>
              {detail.changeReqs.length === 0 ? (
                <div style={{ fontSize: 13, color: '#DDDDDD' }}>No change requests</div>
              ) : detail.changeReqs.map(req => (
                <div key={req.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${T.row}` }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: T.ghost, flexShrink: 0 }}>{fmtDate(req.created_at)}</div>
                    <div>
                      <div style={{ fontSize: 13, color: T.black, marginBottom: 4 }}>{req.request_text}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 11, padding: '2px 6px', borderRadius: 4,
                          background: req.status === 'approved' ? '#F0FFF0' : req.status === 'rejected' ? '#FFF0F0' : T.row,
                          color: req.status === 'approved' ? '#007700' : req.status === 'rejected' ? '#CC0000' : T.ter,
                        }}>{req.status}</span>
                        {req.admin_notes && <span style={{ fontSize: 12, color: T.ter }}>{req.admin_notes}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section E2: Prompt Requests */}
          {promptRequests.length > 0 && (
            <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 12 }}>
                PROMPT REQUESTS ({promptRequests.length})
              </div>
              {promptRequests.map((req: PromptRequest & { vas?: { name: string }; clients?: { store_name: string } }) => {
                const statusMap: Record<string, { color: string; label: string }> = {
                  submitted: { color: '#F59E0B', label: 'Pending' },
                  reviewed:  { color: '#3B82F6', label: 'Reviewed' },
                  applied:   { color: '#2DB87E', label: 'Applied ✓' },
                  rejected:  { color: '#999999', label: 'Rejected' },
                }
                const s = statusMap[req.status] || statusMap.submitted
                const isPending = req.status === 'submitted' || req.status === 'reviewed'
                const fileUrls = (req as unknown as { file_urls?: string[] }).file_urls ?? []
                const filePaths = (req as unknown as { file_paths?: string[] }).file_paths ?? []
                const fileNames = req.file_names ?? []
                return (
                  <div key={req.id} style={{ paddingTop: 16, borderTop: `1px solid ${T.div}`, marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: T.ghost }}>
                        {fmtDate(req.created_at)}
                        {req.vas?.name && <span style={{ marginLeft: 8 }}>via {req.vas.name}</span>}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: s.color }}>{s.label}</span>
                    </div>
                    {req.message && <p style={{ fontSize: 13, color: T.sec, marginBottom: 8 }}>{req.message}</p>}
                    {Array.isArray(fileNames) && fileNames.map((name: string, i: number) => {
                      const pathOrUrl = filePaths[i] || fileUrls[i] || ''
                      const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(name)
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          {isImage && fileUrls[i] && <img src={fileUrls[i]} alt={name} style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />}
                          <span style={{ fontSize: 13, color: T.black, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {name}</span>
                          {pathOrUrl && (
                            <button type="button" onClick={async () => { const url = await getSignedUrl(pathOrUrl); if (url) window.open(url, '_blank') }} style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.color = T.black }}
                              onMouseLeave={e => { e.currentTarget.style.color = T.ghost }}>View</button>
                          )}
                          {pathOrUrl && (
                            <button type="button" onClick={async () => { const url = await getSignedUrl(pathOrUrl); if (url) { const a = document.createElement('a'); a.href = url; a.download = name; a.click() } }} style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.color = T.black }}
                              onMouseLeave={e => { e.currentTarget.style.color = T.ghost }}>↓</button>
                          )}
                        </div>
                      )
                    })}
                    {req.admin_response && !isPending && (
                      <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #F0F0F0' }}>
                        <p style={{ fontSize: 12, color: T.ter }}>{req.admin_response}</p>
                      </div>
                    )}
                    {isPending && (
                      <div style={{ marginTop: 12 }}>
                        <input
                          type="text"
                          value={adminResponses[req.id] || ''}
                          onChange={(e) => setAdminResponses(prev => ({ ...prev, [req.id]: e.target.value }))}
                          placeholder="What was changed or why rejected..."
                          style={{ width: '100%', paddingBottom: 6, fontSize: 13, color: T.black, border: 'none', borderBottom: `1px solid ${T.div}`, outline: 'none', background: 'transparent', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                          onFocus={e => { e.currentTarget.style.borderBottomColor = T.black }}
                          onBlur={e => { e.currentTarget.style.borderBottomColor = T.div }}
                        />
                        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                          <button type="button" onClick={() => void markRequestReviewed(req.id)} style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#3B82F6' }}
                            onMouseLeave={e => { e.currentTarget.style.color = T.ghost }}>Mark as reviewed</button>
                          <button type="button" onClick={() => void markRequestApplied(req.id, req.va_id, client.store_name)} style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#2DB87E' }}
                            onMouseLeave={e => { e.currentTarget.style.color = T.ghost }}>Mark as applied</button>
                          <button type="button" onClick={() => void rejectRequest(req.id, req.va_id, client.store_name)} style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }}
                            onMouseLeave={e => { e.currentTarget.style.color = T.ghost }}>Reject</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Section F: Billing Impact */}
          {detail && detail.lineItems.length > 0 && (
            <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 12 }}>Billing Impact</div>
              <div style={{ fontSize: 14, color: T.black, marginBottom: 8 }}>
                This month: {client.current_month_variants ?? 0} products = {tierLabel(client.current_month_tier)} (${client.current_month_amount ?? 0})
              </div>
              {detail.lineItems.slice(0, 3).map((li, i) => (
                <div key={i} style={{ fontSize: 13, color: T.sec, marginBottom: 4 }}>
                  {li.first_upload_at ? fmtDate(li.first_upload_at).split(' ').slice(1).join(' ') : '—'}: {li.variant_count} products = {tierLabel(li.tier)} (${li.amount})
                </div>
              ))}
              <div style={{ fontSize: 13, color: T.black, marginTop: 8, fontWeight: 500 }}>
                Total from this client: ${detail.lineItems.reduce((sum, li) => sum + li.amount, 0)}
              </div>
            </div>
          )}

          {/* Section G: 48H Deadline */}
          {client.deadline_48h && (
            <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 12 }}>48H Deadline</div>
              {client.deadline_expired ? (
                <div>
                  <div style={{ fontSize: 14, color: T.black, marginBottom: 4 }}>Deadline expired: {fmtDate(client.deadline_48h)}</div>
                  <div style={{ fontSize: 13, color: T.ter }}>Client was deactivated automatically</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, color: T.black, marginBottom: 4 }}>Deadline: {fmtDate(client.deadline_48h)} · {timeRemaining(client.deadline_48h)}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button onClick={() => void handleExtendDeadline()} style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Extend 24h</button>
                    <button onClick={() => void handleCancelDeadline()} style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Cancel deadline</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin Actions */}
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 16 }}>Admin Actions</div>

            {/* PENDING */}
            {status === 'pending' && (
              <div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => { setApproveMode(v => !v); setRejectMode(false) }}
                    style={{ padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { setRejectMode(v => !v); setApproveMode(false) }}
                    style={{ padding: '8px 16px', background: 'none', color: T.black, border: `1px solid ${T.div}`, borderRadius: 20, fontSize: 13, cursor: 'pointer' }}
                  >
                    Reject
                  </button>
                </div>
                {approveMode && (
                  <div style={{ marginTop: 16, padding: 16, background: T.row, borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: T.sec, marginBottom: 8 }}>Select prompt template:</div>
                    <PromptDropdown prompts={allPrompts} clientNiche={client.niche ?? null} clientLanguage={client.language ?? null} value={approvePromptId} onChange={setApprovePromptId} />
                    <button
                      onClick={() => void handleApprove()}
                      disabled={approving || !approvePromptId}
                      style={{ marginTop: 12, padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                    >
                      {approving ? 'Approving…' : 'Confirm & approve'}
                    </button>
                  </div>
                )}
                {rejectMode && (
                  <div style={{ marginTop: 16, padding: 16, background: T.row, borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: T.sec, marginBottom: 8 }}>Rejection reason:</div>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Enter reason…"
                      style={{ width: '100%', minHeight: 80, padding: 10, border: `1px solid ${T.div}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={() => void handleReject()}
                      disabled={rejecting || !rejectReason.trim()}
                      style={{ marginTop: 8, padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                    >
                      {rejecting ? 'Rejecting…' : 'Confirm rejection'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ACTIVE */}
            {status === 'active' && (
              <div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => { setDeactivateMode(v => !v); setTransferMode(false); setChangePromptMode(false) }}
                    style={{ padding: '8px 16px', background: 'none', color: T.black, border: `1px solid ${T.div}`, borderRadius: 20, fontSize: 13, cursor: 'pointer' }}
                  >
                    Deactivate
                  </button>
                  <button
                    onClick={() => { setTransferMode(v => !v); setDeactivateMode(false); setChangePromptMode(false) }}
                    style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    Transfer to another VA
                  </button>
                  <button
                    onClick={() => { setChangePromptMode(v => !v); setDeactivateMode(false); setTransferMode(false) }}
                    style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    Change prompt
                  </button>
                </div>
                {deactivateMode && (
                  <div style={{ marginTop: 16, padding: 16, background: T.row, borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: T.sec, marginBottom: 8 }}>Deactivation reason:</div>
                    <textarea
                      value={deactivateReason}
                      onChange={e => setDeactivateReason(e.target.value)}
                      placeholder="Enter reason…"
                      style={{ width: '100%', minHeight: 60, padding: 10, border: `1px solid ${T.div}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={() => void handleDeactivate()}
                      disabled={deactivating || !deactivateReason.trim()}
                      style={{ marginTop: 8, padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                    >
                      {deactivating ? 'Deactivating…' : 'Confirm deactivation'}
                    </button>
                  </div>
                )}
                {transferMode && (
                  <div style={{ marginTop: 16, padding: 16, background: T.row, borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: T.sec, marginBottom: 8 }}>Transfer to VA:</div>
                    <select
                      value={transferVAId}
                      onChange={e => setTransferVAId(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', border: `1px solid ${T.div}`, borderRadius: 8, fontSize: 13, background: T.bg, outline: 'none' }}
                    >
                      <option value="">— Select VA —</option>
                      {allVAs.filter(v => v.id !== client.va_id).map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: T.sec, cursor: 'pointer' }}>
                      <input type="checkbox" checked={transferNotify} onChange={e => setTransferNotify(e.target.checked)} />
                      Notify new VA
                    </label>
                    <button
                      onClick={() => void handleTransfer()}
                      disabled={transferring || !transferVAId}
                      style={{ marginTop: 10, padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                    >
                      {transferring ? 'Transferring…' : 'Confirm transfer'}
                    </button>
                  </div>
                )}
                {changePromptMode && (
                  <div style={{ marginTop: 16, padding: 16, background: T.row, borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: T.sec, marginBottom: 8 }}>Select new prompt:</div>
                    <PromptDropdown prompts={allPrompts} clientNiche={client.niche ?? null} clientLanguage={client.language ?? null} value={changePromptId} onChange={setChangePromptId} />
                    <button
                      onClick={() => void handleChangePrompt()}
                      disabled={changingPrompt || !changePromptId}
                      style={{ marginTop: 10, padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                    >
                      {changingPrompt ? 'Saving…' : 'Confirm change'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* REJECTED */}
            {status === 'rejected' && (
              <div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => { setApproveMode(v => !v) }}
                    style={{ padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                  >
                    Re-approve
                  </button>
                  {!deleteMode ? (
                    <button
                      onClick={() => setDeleteMode(true)}
                      style={{ fontSize: 12, color: '#DDDDDD', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Delete
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: T.sec }}>Are you sure?</span>
                      <button onClick={() => void handleDelete()} disabled={deleting} style={{ fontSize: 12, color: '#CC0000', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button onClick={() => setDeleteMode(false)} style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
                    </div>
                  )}
                </div>
                {approveMode && (
                  <div style={{ marginTop: 16, padding: 16, background: T.row, borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: T.sec, marginBottom: 8 }}>Select prompt template:</div>
                    <PromptDropdown prompts={allPrompts} clientNiche={client.niche ?? null} clientLanguage={client.language ?? null} value={approvePromptId} onChange={setApprovePromptId} />
                    <button
                      onClick={() => void handleApprove()}
                      disabled={approving || !approvePromptId}
                      style={{ marginTop: 12, padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                    >
                      {approving ? 'Approving…' : 'Confirm & approve'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* INACTIVE */}
            {status === 'inactive' && (
              <div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => void handleReactivate(false)}
                    style={{ padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                  >
                    Reactivate
                  </button>
                  {!deleteMode ? (
                    <button
                      onClick={() => setDeleteMode(true)}
                      style={{ fontSize: 12, color: '#DDDDDD', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Delete
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: T.sec }}>Are you sure?</span>
                      <button onClick={() => void handleDelete()} disabled={deleting} style={{ fontSize: 12, color: '#CC0000', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button onClick={() => setDeleteMode(false)} style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* EXPIRED */}
            {status === 'expired' && (
              <div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => void handleReactivate(true)}
                    style={{ padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                  >
                    Reactivate with new deadline
                  </button>
                  {!deleteMode ? (
                    <button
                      onClick={() => setDeleteMode(true)}
                      style={{ fontSize: 12, color: '#DDDDDD', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Delete
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: T.sec }}>Are you sure?</span>
                      <button onClick={() => void handleDelete()} disabled={deleting} style={{ fontSize: 12, color: '#CC0000', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button onClick={() => setDeleteMode(false)} style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Admin Notes */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 10 }}>Admin Notes</div>
            <textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              placeholder="Add notes…"
              style={{ width: '100%', minHeight: 60, padding: 12, border: `1px solid ${T.div}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <button
                onClick={() => void handleSaveNotes()}
                style={{ fontSize: 12, padding: '5px 12px', background: T.black, color: T.bg, border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Save
              </button>
              {notesSaved && <span style={{ fontSize: 12, color: T.ter }}>Saved ✓</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientWithVA[]>([])
  const [allVAs, setAllVAs] = useState<ActiveVA[]>([])
  const [allPrompts, setAllPrompts] = useState<PromptOption[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('activity')

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<string | null>(null)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkPromptId, setBulkPromptId] = useState('')
  const [bulkVAId, setBulkVAId] = useState('')
  const [bulkProcessing, setBulkProcessing] = useState(false)

  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const loadData = useCallback(async () => {
    setLoading(true)
    const [
      { data: clientsRaw },
      { data: vasRaw },
      { data: promptsRaw },
    ] = await Promise.all([
      supabase.from('clients').select('*, vas(id, name)').order('registered_at', { ascending: false }),
      supabase.from('vas').select('id, name').eq('status', 'active'),
      supabase.from('prompts').select('id, name, niche, language, is_default, is_active').eq('is_active', true).order('name'),
    ])
    setClients((clientsRaw ?? []) as unknown as ClientWithVA[])
    setAllVAs((vasRaw ?? []) as ActiveVA[])
    setAllPrompts((promptsRaw ?? []) as PromptOption[])
    setLoading(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  // Stats
  const stats = useMemo(() => {
    const active = clients.filter(c => clientStatus(c) === 'active')
    const pending = clients.filter(c => clientStatus(c) === 'pending')
    const rejected = clients.filter(c => clientStatus(c) === 'rejected')
    const inactive = clients.filter(c => clientStatus(c) === 'inactive')
    const totalRevenue = active.reduce((sum, c) => sum + (c.current_month_amount ?? 0), 0)
    const variantsArr = active.filter(c => c.current_month_variants != null).map(c => c.current_month_variants!)
    const avgVariants = variantsArr.length ? Math.round(variantsArr.reduce((a, b) => a + b, 0) / variantsArr.length) : 0
    const tierAmounts = active.map(c => tierAmount(c.current_month_tier))
    const avgTier = tierAmounts.length ? Math.round(tierAmounts.reduce((a, b) => a + b, 0) / tierAmounts.length) : 0
    const approved = clients.filter(c => c.approval_status === 'approved').length
    const rejectedCount = clients.filter(c => c.approval_status === 'rejected').length
    const approvalRate = (approved + rejectedCount) > 0 ? Math.round(approved / (approved + rejectedCount) * 100) : 0
    return { active: active.length, pending: pending.length, rejected: rejected.length, inactive: inactive.length, totalRevenue, avgVariants, avgTier, approvalRate }
  }, [clients])

  // Filtered + sorted + paginated
  const filtered = useMemo(() => {
    let list = clients
    if (statusFilter !== 'all') {
      list = list.filter(c => clientStatus(c) === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.store_name.toLowerCase().includes(q) ||
        (c.store_domain ?? '').toLowerCase().includes(q) ||
        (c.vas?.name ?? '').toLowerCase().includes(q) ||
        (c.niche ?? '').toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'nameAZ': return a.store_name.localeCompare(b.store_name)
        case 'variants': return (b.current_month_variants ?? 0) - (a.current_month_variants ?? 0)
        case 'tier': return tierAmount(b.current_month_tier) - tierAmount(a.current_month_tier)
        case 'newest': return new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime()
        case 'vaName': return (a.vas?.name ?? '').localeCompare(b.vas?.name ?? '')
        case 'activity':
        default:
          return new Date(b.last_upload_at ?? b.registered_at).getTime() - new Date(a.last_upload_at ?? a.registered_at).getTime()
      }
    })
    return list
  }, [clients, statusFilter, search, sortKey])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
    setLoadedIds(prev => new Set([...prev, id]))
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === paginated.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(paginated.map(c => c.id)))
    }
  }

  async function handleBulkAction() {
    if (!bulkAction) return
    setBulkProcessing(true)
    const selectedClients = clients.filter(c => selected.has(c.id))
    const now = new Date().toISOString()

    if (bulkAction === 'approve') {
      for (const c of selectedClients) {
        const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
        await supabase.from('clients').update({ approval_status: 'approved', approved_at: now, approved_by: 'admin', is_active: true, deadline_48h: deadline, deadline_expired: false }).eq('id', c.id)
        if (bulkPromptId) {
          const ex = await supabase.from('client_profiles').select('id').eq('client_id', c.id).maybeSingle()
          if (ex.data) {
            await supabase.from('client_profiles').update({ prompt_id: bulkPromptId, updated_at: now, updated_by: 'admin' }).eq('client_id', c.id)
          } else {
            await supabase.from('client_profiles').insert({ client_id: c.id, prompt_id: bulkPromptId, updated_at: now, updated_by: 'admin' })
          }
        }
        await supabase.from('notifications').insert({ va_id: c.va_id, type: 'client_approved', title: 'Client approved', message: `${c.store_name} has been approved.`, is_read: false, created_at: now })
        void logActivity({ action: 'client_approved', details: `Bulk approved client ${c.store_name}`, client_id: c.id, source: 'admin', severity: 'info' })
      }
    } else if (bulkAction === 'reject') {
      for (const c of selectedClients) {
        await supabase.from('clients').update({ approval_status: 'rejected', rejection_reason: bulkReason, is_active: false }).eq('id', c.id)
        await supabase.from('notifications').insert({ va_id: c.va_id, type: 'client_rejected', title: 'Client rejected', message: `${c.store_name} has been rejected.`, is_read: false, created_at: now })
        void logActivity({ action: 'client_rejected', details: `Bulk rejected client ${c.store_name}`, client_id: c.id, source: 'admin', severity: 'info' })
      }
    } else if (bulkAction === 'deactivate') {
      for (const c of selectedClients) {
        await supabase.from('clients').update({ is_active: false, deactivation_reason: bulkReason, deactivated_at: now }).eq('id', c.id)
        await supabase.from('notifications').insert({ va_id: c.va_id, type: 'client_rejected', title: 'Client deactivated', message: `${c.store_name} has been deactivated.`, is_read: false, created_at: now })
        void logActivity({ action: 'client_deactivated', details: `Bulk deactivated client ${c.store_name}`, client_id: c.id, source: 'admin', severity: 'warning' })
      }
    } else if (bulkAction === 'reactivate') {
      for (const c of selectedClients) {
        await supabase.from('clients').update({ is_active: true, deactivated_at: null, deactivation_reason: null }).eq('id', c.id)
        await supabase.from('notifications').insert({ va_id: c.va_id, type: 'client_approved', title: 'Client reactivated', message: `${c.store_name} has been reactivated.`, is_read: false, created_at: now })
        void logActivity({ action: 'client_reactivated', details: `Bulk reactivated client ${c.store_name}`, client_id: c.id, source: 'admin', severity: 'info' })
      }
    } else if (bulkAction === 'changePrompt' && bulkPromptId) {
      for (const c of selectedClients) {
        const ex = await supabase.from('client_profiles').select('id').eq('client_id', c.id).maybeSingle()
        if (ex.data) {
          await supabase.from('client_profiles').update({ prompt_id: bulkPromptId, updated_at: now, updated_by: 'admin' }).eq('client_id', c.id)
        } else {
          await supabase.from('client_profiles').insert({ client_id: c.id, prompt_id: bulkPromptId, updated_at: now, updated_by: 'admin' })
        }
        void logActivity({ action: 'prompt_changed', details: `Bulk changed prompt for client ${c.store_name}`, client_id: c.id, source: 'admin', severity: 'info' })
      }
    } else if (bulkAction === 'transfer' && bulkVAId) {
      for (const c of selectedClients) {
        const oldVAId = c.va_id
        await supabase.from('clients').update({ va_id: bulkVAId }).eq('id', c.id)
        await supabase.from('notifications').insert({ va_id: oldVAId, type: 'client_rejected', title: 'Client transferred', message: `${c.store_name} has been transferred to another operator.`, is_read: false, created_at: now })
        await supabase.from('notifications').insert({ va_id: bulkVAId, type: 'client_approved', title: 'Client assigned', message: `${c.store_name} has been assigned to you.`, is_read: false, created_at: now })
        void logActivity({ action: 'client_transferred', details: `Bulk transferred client ${c.store_name}`, client_id: c.id, source: 'admin', severity: 'warning' })
      }
    } else if (bulkAction === 'exportCSV') {
      const rows: (string | number | null)[][] = [
        ['Store name', 'Domain', 'VA name', 'Niche', 'Market', 'Language', 'Products this month', 'Tier', 'Status', 'Registered date', 'Approved date', 'Prompt template'],
      ]
      for (const c of selectedClients) {
        rows.push([
          c.store_name, c.store_domain, c.vas?.name ?? '', c.niche, c.market, c.language,
          c.current_month_variants, tierLabel(c.current_month_tier), clientStatus(c),
          fmtDate(c.registered_at), fmtDate(c.approved_at), '',
        ])
      }
      downloadCSV('clients-export.csv', rows)
      setBulkAction(null)
      setBulkProcessing(false)
      setSelected(new Set())
      setBulkMenuOpen(false)
      return
    }

    setBulkProcessing(false)
    setBulkAction(null)
    setBulkReason('')
    setBulkPromptId('')
    setBulkVAId('')
    setSelected(new Set())
    setBulkMenuOpen(false)
    void loadData()
  }

  function handleExportAll() {
    const rows: (string | number | null)[][] = [
      ['Store name', 'Domain', 'VA name', 'Niche', 'Market', 'Language', 'Products this month', 'Tier', 'Status', 'Registered date', 'Approved date', 'Prompt template'],
    ]
    for (const c of filtered) {
      rows.push([
        c.store_name, c.store_domain, c.vas?.name ?? '', c.niche, c.market, c.language,
        c.current_month_variants, tierLabel(c.current_month_tier), clientStatus(c),
        fmtDate(c.registered_at), fmtDate(c.approved_at), '',
      ])
    }
    downloadCSV('all-clients.csv', rows)
  }

  function statusColor(s: CStatus): string {
    if (s === 'active') return T.black
    if (s === 'pending') return T.ghost
    return T.ghost
  }

  function rowOpacity(s: CStatus): number {
    if (s === 'pending') return 0.6
    if (s === 'rejected' || s === 'inactive' || s === 'expired') return 0.4
    return 1
  }

  const filterPills: StatusFilter[] = ['all', 'active', 'pending', 'rejected', 'inactive', 'expired']

  if (loading) {
    return (
      <div style={{ minHeight: 'calc(100vh - 52px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ fontSize: 13, color: T.ter }}>Loading clients…</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 1100, margin: '0 auto', padding: '40px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 300, color: T.black, letterSpacing: '-0.03em' }}>Client management</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 13, color: T.ghost }}>
            {stats.active} active · {stats.pending} pending · {stats.rejected} rejected · {stats.inactive} inactive · {clients.length} total
          </div>
          <button
            onClick={handleExportAll}
            style={{ fontSize: 12, color: T.ter, background: 'none', border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
          >
            Export all clients
          </button>
        </div>
      </div>

      {/* Top Stats */}
      <div style={{ display: 'flex', gap: 48, marginBottom: 32 }}>
        {[
          { label: 'TOTAL REVENUE', value: `$${stats.totalRevenue}` },
          { label: 'AVG PRODUCTS/CLIENT', value: `${stats.avgVariants}/month` },
          { label: 'AVG TIER', value: `$${stats.avgTier}` },
          { label: 'APPROVAL RATE', value: `${stats.approvalRate}%` },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 36, fontWeight: 600, color: T.black, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter + Sort */}
      <div style={{ marginBottom: 32 }}>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search by store name, domain, VA name, or niche…"
          style={{
            width: '100%', border: 'none', borderBottom: `1.5px solid ${T.div}`, outline: 'none',
            fontSize: 13, color: T.black, padding: '10px 0', background: 'transparent',
            boxSizing: 'border-box', marginBottom: 16,
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderBottomColor = T.black)}
          onBlur={e => (e.target.style.borderBottomColor = T.div)}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {filterPills.map(f => (
              <button
                key={f}
                onClick={() => { setStatusFilter(f); setPage(0) }}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${statusFilter === f ? T.black : T.div}`,
                  background: statusFilter === f ? T.black : 'transparent',
                  color: statusFilter === f ? T.bg : T.sec,
                  fontWeight: statusFilter === f ? 500 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {f === 'all' ? `All (${clients.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${clients.filter(c => clientStatus(c) === f).length})`}
              </button>
            ))}
          </div>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            style={{ fontSize: 12, color: T.sec, border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 10px', background: T.bg, outline: 'none', cursor: 'pointer' }}
          >
            <option value="activity">Recent activity</option>
            <option value="nameAZ">Store A–Z</option>
            <option value="variants">Most products</option>
            <option value="tier">Highest tier</option>
            <option value="newest">Newest</option>
            <option value="vaName">VA A–Z</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: T.row, borderRadius: 10, marginBottom: 16, position: 'relative' }}>
          <span style={{ fontSize: 13, color: T.black, fontWeight: 500 }}>{selected.size} selected</span>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setBulkMenuOpen(v => !v)}
              style={{ fontSize: 12, color: T.black, background: 'none', border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
            >
              Bulk actions ▾
            </button>
            {bulkMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: T.bg, border: `1px solid ${T.div}`, borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', zIndex: 100, minWidth: 200 }}>
                {[
                  { key: 'approve', label: 'Approve selected' },
                  { key: 'reject', label: 'Reject selected' },
                  { key: 'deactivate', label: 'Deactivate selected' },
                  { key: 'reactivate', label: 'Reactivate selected' },
                  { key: 'changePrompt', label: 'Change prompt template' },
                  { key: 'transfer', label: 'Transfer to VA' },
                  { key: 'exportCSV', label: 'Export selected CSV' },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => { setBulkAction(item.key); setBulkMenuOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13, color: T.black, background: 'none', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${T.row}` }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { setSelected(new Set()); setBulkAction(null) }} style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>Clear</button>
        </div>
      )}

      {/* Bulk action confirmation panel */}
      {bulkAction && bulkAction !== 'exportCSV' && (
        <div style={{ padding: 16, background: T.row, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: T.black, marginBottom: 12 }}>
            {bulkAction === 'approve' && 'Approve selected clients'}
            {bulkAction === 'reject' && 'Reject selected clients'}
            {bulkAction === 'deactivate' && 'Deactivate selected clients'}
            {bulkAction === 'reactivate' && 'Reactivate selected clients'}
            {bulkAction === 'changePrompt' && 'Change prompt for selected clients'}
            {bulkAction === 'transfer' && 'Transfer selected clients to VA'}
          </div>
          {(bulkAction === 'reject' || bulkAction === 'deactivate') && (
            <textarea
              value={bulkReason}
              onChange={e => setBulkReason(e.target.value)}
              placeholder="Reason…"
              style={{ width: '100%', minHeight: 60, padding: 10, border: `1px solid ${T.div}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }}
            />
          )}
          {(bulkAction === 'approve' || bulkAction === 'changePrompt') && (
            <div style={{ marginBottom: 10 }}>
              <PromptDropdown prompts={allPrompts} clientNiche={null} clientLanguage={null} value={bulkPromptId} onChange={setBulkPromptId} />
            </div>
          )}
          {bulkAction === 'transfer' && (
            <div style={{ marginBottom: 10 }}>
              <select
                value={bulkVAId}
                onChange={e => setBulkVAId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${T.div}`, borderRadius: 8, fontSize: 13, background: T.bg, outline: 'none' }}
              >
                <option value="">— Select VA —</option>
                {allVAs.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void handleBulkAction()}
              disabled={bulkProcessing}
              style={{ padding: '8px 16px', background: T.black, color: T.bg, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              {bulkProcessing ? 'Processing…' : 'Confirm'}
            </button>
            <button
              onClick={() => { setBulkAction(null); setBulkReason(''); setBulkPromptId(''); setBulkVAId('') }}
              style={{ padding: '8px 16px', background: 'none', color: T.sec, border: `1px solid ${T.div}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 80px 80px', gap: 16, padding: '8px 0', borderBottom: `1px solid ${T.div}`, marginBottom: 4 }}>
        <div>
          <SelectAllCheckbox
            allSelected={paginated.length > 0 && selected.size === paginated.length}
            someSelected={selected.size > 0 && selected.size < paginated.length}
            onChange={toggleSelectAll}
          />
        </div>
        {['STORE / VA', 'STATS', 'TIER', 'STATUS'].map(h => (
          <div key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, fontWeight: 400 }}>{h}</div>
        ))}
      </div>

      {/* Client rows */}
      {paginated.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: T.ter }}>No clients found</div>
      ) : paginated.map(client => {
        const st = clientStatus(client)
        const isExpanded = expandedIds.has(client.id)
        const isLoaded = loadedIds.has(client.id)
        const isSelected = selected.has(client.id)
        const op = rowOpacity(st)

        return (
          <div
            key={client.id}
            style={{ opacity: op, borderBottom: `1px solid ${T.row}` }}
          >
            <div
              style={{
                display: 'grid', gridTemplateColumns: '32px 1fr 1fr 80px 80px', gap: 16,
                padding: '16px 0', cursor: 'pointer', alignItems: 'center',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = String(op * 0.6))}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <div onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(client.id)} style={{ cursor: 'pointer' }} />
              </div>
              <div onClick={() => toggleExpand(client.id)}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 2 }}>{client.store_name}</div>
                <div style={{ fontSize: 12, color: T.ter }}>{client.vas?.name ?? '—'}</div>
              </div>
              <div onClick={() => toggleExpand(client.id)}>
                <div style={{ fontSize: 12, color: T.ter }}>
                  {[client.niche, client.market].filter(Boolean).join(' · ')}
                  {client.current_month_variants != null && ` · `}
                  {client.current_month_variants != null && <span style={{ color: T.black }}>{client.current_month_variants} products</span>}
                </div>
              </div>
              <div onClick={() => toggleExpand(client.id)} style={{ fontSize: 12, color: T.ghost }}>
                {tierLabel(client.current_month_tier)}
              </div>
              <div onClick={() => toggleExpand(client.id)}>
                <span style={{
                  fontSize: 12,
                  color: statusColor(st),
                  fontStyle: st === 'pending' ? 'italic' : 'normal',
                  textTransform: 'capitalize',
                }}>
                  {st}
                </span>
              </div>
            </div>

            {isExpanded && isLoaded && (
              <ClientDetail
                client={client}
                allVAs={allVAs}
                allPrompts={allPrompts}
                onRefresh={() => void loadData()}
              />
            )}
          </div>
        )
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.div}` }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 14px', border: `1px solid ${T.div}`, borderRadius: 6, fontSize: 12, color: page === 0 ? T.ghost : T.black, background: 'none', cursor: page === 0 ? 'default' : 'pointer' }}
          >
            Previous
          </button>
          <div style={{ fontSize: 12, color: T.ter }}>
            Page {page + 1} of {totalPages} · {filtered.length} total
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '6px 14px', border: `1px solid ${T.div}`, borderRadius: 6, fontSize: 12, color: page >= totalPages - 1 ? T.ghost : T.black, background: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// Suppress unused import warnings for types used only as type annotations
export type { Client, Prompt, ClientProfile, ProfileChangeRequest }
void variantsToTier
