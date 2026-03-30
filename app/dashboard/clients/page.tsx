'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useVA } from '@/context/va-context'
import { supabase, type Client, type Upload, type ClientProfile, type Prompt, type ProfileChangeRequest, type PromptRequest } from '@/lib/supabase'
import { getTier } from '@/lib/tier'
import { timeAgo, getMarketFlag } from '@/lib/utils'
import { downloadOutput } from '@/lib/download'
import { logActivity } from '@/lib/activity-log'
import { OptimizationStatus } from '@/components/dashboard/OptimizationStatus'

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
}

// ─── Label maps ───────────────────────────────────────────────────────────────

const NICHE_LABELS: Record<string, string> = {
  fashion: 'Fashion', electronics: 'Electronics', beauty: 'Beauty',
  home_garden: 'Home & Garden', health: 'Health', sports: 'Sports', other: 'Other',
}

const LANG_LABELS: Record<string, string> = {
  english: 'English', german: 'German', french: 'French', dutch: 'Dutch',
  spanish: 'Spanish', polish: 'Polish', portuguese: 'Portuguese', italian: 'Italian',
  swedish: 'Swedish', danish: 'Danish', norwegian: 'Norwegian', other: 'Other',
}

const DESC_STYLE_LABELS: Record<string, string> = {
  minimal: 'Minimal', standard: 'Standard', detailed: 'Detailed',
}

const TITLE_PREF_LABELS: Record<string, string> = {
  short: 'Short titles', medium: 'Medium titles', long: 'Long titles',
}

const UPLOAD_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued', processing: 'Processing', done: 'Done',
  failed: 'Failed', on_hold: 'On hold',
}

const UPLOAD_STATUS_COLORS: Record<string, string> = {
  queued: T.ghost, processing: T.orange, done: T.green,
  failed: T.red, on_hold: T.orange,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Filter = 'all' | 'active' | 'pending' | 'rejected' | 'inactive' | 'expired'
type Sort   = 'recent' | 'name' | 'variants' | 'oldest'

function fmt48h(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function clientMatchesFilter(c: Client, filter: Filter): boolean {
  if (filter === 'all')      return true
  if (filter === 'active')   return c.is_active && c.approval_status === 'approved'
  if (filter === 'pending')  return c.approval_status === 'pending' && !c.deadline_expired
  if (filter === 'rejected') return c.approval_status === 'rejected'
  if (filter === 'inactive') return !c.is_active && c.approval_status === 'approved'
  if (filter === 'expired')  return c.deadline_expired === true
  return true
}

function getClientStatusColor(c: Client): string {
  if (c.deadline_expired)              return T.red
  if (c.approval_status === 'pending') return T.orange
  if (c.approval_status === 'rejected')return T.red
  if (!c.is_active)                    return T.ghost
  return T.green
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', paddingBlock: 9, borderBottom: `1px solid ${T.div}` }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: T.ghost }}>{label}</div>
      <div style={{ fontSize: 13, color: T.black }}>{value || '—'}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: T.ghost, marginBottom: 12, marginTop: 20,
    }}>
      {children}
    </div>
  )
}

function StatusPill({ status, expired }: { status: Client['approval_status']; expired?: boolean | null }) {
  if (expired) return (
    <span style={{ fontSize: 11, color: T.red, border: `1px solid ${T.red}`, borderRadius: 100, padding: '2px 9px' }}>
      Expired
    </span>
  )
  const map: Record<string, { label: string; color: string }> = {
    pending:  { label: 'Pending',  color: T.orange },
    approved: { label: 'Active',   color: T.green  },
    rejected: { label: 'Rejected', color: T.red    },
  }
  const { label, color } = map[status] ?? { label: status, color: T.ghost }
  return (
    <span style={{ fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 100, padding: '2px 9px' }}>
      {label}
    </span>
  )
}

// ─── Upload row ───────────────────────────────────────────────────────────────

function UploadRow({
  upload,
  onDownload,
  dlWorking,
}: {
  upload: Upload
  onDownload: (u: Upload) => void
  dlWorking: string | null
}) {
  const isWorking = dlWorking === upload.id
  const canDownload = upload.status === 'done' && !!upload.output_file_path

  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingBlock: 10, borderBottom: `1px solid ${T.div}`, gap: 12 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: UPLOAD_STATUS_COLORS[upload.status] ?? T.ghost,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.black }}>
          {upload.unique_product_count ?? upload.product_row_count ?? '—'} products
          {upload.file_type && <span style={{ color: T.ghost, marginLeft: 6 }}>· {upload.file_type.toUpperCase()}</span>}
        </div>
        <div style={{ fontSize: 11, color: T.ghost, marginTop: 2 }}>{timeAgo(upload.uploaded_at)}</div>
      </div>
      <span style={{ fontSize: 12, color: UPLOAD_STATUS_COLORS[upload.status] ?? T.ghost }}>
        {UPLOAD_STATUS_LABELS[upload.status] ?? upload.status}
      </span>
      {canDownload && (
        <button
          onClick={() => onDownload(upload)}
          disabled={isWorking}
          style={{
            fontSize: 12, color: isWorking ? T.ghost : T.black,
            background: 'none', border: 'none', cursor: isWorking ? 'default' : 'pointer',
            padding: 0, fontFamily: 'inherit', textDecoration: 'underline',
            textUnderlineOffset: 3, transition: 'color 0.15s',
          }}
        >
          {isWorking ? 'Downloading…' : 'Download'}
        </button>
      )}
    </div>
  )
}

// ─── Client row ───────────────────────────────────────────────────────────────

function ClientRow({
  client,
  clientUploads,
  profile,
  prompt,
  pendingRequests,
  promptPendingRequests,
  isExpanded,
  onToggle,
  onDownload,
  dlWorking,
  tick,
  router,
}: {
  client: Client
  clientUploads: Upload[]
  profile: ClientProfile | null
  prompt: Prompt | null
  pendingRequests: number
  promptPendingRequests: number
  isExpanded: boolean
  onToggle: () => void
  onDownload: (u: Upload) => void
  dlWorking: string | null
  tick: number
  router: ReturnType<typeof useRouter>
}) {
  void tick // used to re-render countdown
  const { currentVA } = useVA()

  const [titlePref,          setTitlePref]          = useState<string | null>(client.title_preference ?? null)
  const [descStyle,          setDescStyle]          = useState<string | null>(client.description_style ?? null)
  const [savingPref,         setSavingPref]         = useState(false)
  const [standingInstr,      setStandingInstr]      = useState(client.special_instructions ?? '')
  const [savingStanding,     setSavingStanding]     = useState(false)
  const [standingSaved,      setStandingSaved]      = useState(false)
  const [vaRate,             setVaRate]             = useState<string>(
    client.va_rate_per_product != null ? String(client.va_rate_per_product) : ''
  )
  const [savingRate,  setSavingRate]  = useState(false)
  const [rateSaved,   setRateSaved]   = useState(false)

  // ── Prompt request state ─────────────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState<'info' | 'requests'>('info')
  const [requestMessage, setRequestMessage] = useState('')
  const [uploadedFiles, setUploadedFiles]   = useState<File[]>([])
  const [submitting, setSubmitting]         = useState(false)
  const [showSuccess, setShowSuccess]       = useState(false)
  const [requestHistory, setRequestHistory] = useState<PromptRequest[]>([])

  async function loadRequestHistory() {
    const { data } = await supabase
      .from('prompt_requests')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
    setRequestHistory((data || []) as PromptRequest[])
  }

  // Load request history when expanded or tab switches to requests
  useEffect(() => {
    if (isExpanded && activeTab === 'requests') {
      void loadRequestHistory()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, activeTab, client.id])

  // Also load when first expanded
  useEffect(() => {
    if (isExpanded) {
      void loadRequestHistory()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, client.id])

  function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  async function uploadRequestFiles(files: File[]): Promise<{ urls: string[]; names: string[]; paths: string[] }> {
    const urls: string[] = []
    const names: string[] = []
    const paths: string[] = []
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { alert(`${file.name} exceeds 5MB limit.`); continue }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${client.id}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('prompt-requests').upload(path, file, { upsert: false })
      if (error) { console.error('[UPLOAD]', file.name, error.message); alert(`Upload failed: ${file.name} — ${error.message}`); continue }
      const { data: signed } = await supabase.storage.from('prompt-requests').createSignedUrl(path, 60 * 60 * 24 * 365)
      paths.push(path)
      names.push(file.name)
      urls.push(signed?.signedUrl ?? path)
    }
    return { urls, names, paths }
  }

  async function handleSubmitRequest() {
    const msg = requestMessage
    const files = uploadedFiles
    if (!msg.trim() && files.length === 0) return
    setSubmitting(true)

    let fileUrls: string[] = []
    let fileNames: string[] = []
    let filePaths: string[] = []
    if (files.length > 0) {
      const result = await uploadRequestFiles(files)
      fileUrls = result.urls
      fileNames = result.names
      filePaths = result.paths
    }

    const insertPayload: Record<string, unknown> = {
      client_id: client.id,
      va_id: currentVA?.id,
      message: msg.trim() || null,
      file_urls: fileUrls,
      file_names: fileNames,
      status: 'submitted',
    }
    if (filePaths.length > 0) {
      insertPayload.file_paths = filePaths
    }

    const { error } = await supabase.from('prompt_requests').insert(insertPayload)

    if (error) { alert('Failed: ' + error.message); setSubmitting(false); return }

    setRequestMessage('')
    setUploadedFiles([])
    setSubmitting(false)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 3000)
    await loadRequestHistory()
  }

  async function saveRate(raw: string) {
    const parsed = raw === '' ? null : parseFloat(raw)
    if (parsed !== null && isNaN(parsed)) return
    setSavingRate(true)
    await supabase.from('clients').update({ va_rate_per_product: parsed }).eq('id', client.id)
    setSavingRate(false)
    setRateSaved(true)
    setTimeout(() => setRateSaved(false), 2000)
    void logActivity({
      action: 'client_preference_updated',
      va_id: client.va_id,
      client_id: client.id,
      source: 'va',
      details: `${client.store_name} va_rate_per_product updated to ${parsed}`,
    })
  }

  async function savePref(field: 'title_preference' | 'description_style', value: string) {
    setSavingPref(true)
    await supabase.from('clients').update({ [field]: value }).eq('id', client.id)
    if (field === 'title_preference') setTitlePref(value)
    else setDescStyle(value)
    setSavingPref(false)
    void logActivity({
      action: 'client_preference_updated',
      va_id: client.va_id,
      client_id: client.id,
      source: 'va',
      details: `${client.store_name} ${field} updated to ${value}`,
    })
  }

  async function saveStanding() {
    const trimmed = standingInstr.trim()
    const prev    = (client.special_instructions ?? '').trim()
    if (trimmed === prev) return   // no change
    setSavingStanding(true)
    await supabase.from('clients').update({ special_instructions: trimmed || null }).eq('id', client.id)
    setSavingStanding(false)
    setStandingSaved(true)
    setTimeout(() => setStandingSaved(false), 2000)
    void logActivity({
      action: 'client_preference_updated',
      va_id: client.va_id,
      client_id: client.id,
      source: 'va',
      details: `${client.store_name} standing instructions updated`,
    })
  }

  const monthVariants = client.current_month_variants ?? 0
  const monthTier     = client.current_month_tier ?? getTier(monthVariants).name
  const monthAmount   = client.current_month_amount ?? getTier(monthVariants).amount
  const statusColor   = getClientStatusColor(client)
  const flag          = getMarketFlag(client.market)

  const has48h    = !!client.deadline_48h && client.approval_status === 'pending' && !client.deadline_expired
  const countdown = has48h ? fmt48h(client.deadline_48h!) : null

  return (
    <div style={{ borderBottom: `1px solid ${T.div}` }}>

      {/* ── Row summary ─────────────────────────────────────────────── */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBlock: 14, cursor: 'pointer' }}
      >
        {/* Status dot */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: statusColor,
        }} />

        {/* Name + domain */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{client.store_name}</span>
            {/* Template status dot */}
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: profile?.prompt_id ? '#2DB87E' : '#DDDDDD',
              verticalAlign: 'middle', flexShrink: 0,
            }} />
            {client.niche && (
              <span style={{ fontSize: 11, color: T.ghost, border: `1px solid ${T.div}`, borderRadius: 100, padding: '1px 8px' }}>
                {NICHE_LABELS[client.niche] ?? client.niche}
              </span>
            )}
            {pendingRequests > 0 && (
              <span style={{ fontSize: 11, color: T.orange }}>
                {pendingRequests} pending request{pendingRequests > 1 ? 's' : ''}
              </span>
            )}
            {/* Prompt request pending badge */}
            {promptPendingRequests > 0 && (
              <span style={{ fontSize: 10, fontWeight: 500, color: '#F59E0B', marginLeft: 2 }}>
                Request pending
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.ter, marginTop: 2 }}>
            {flag} {client.market ?? '—'}
            {client.store_domain && <span style={{ marginLeft: 6 }}>· {client.store_domain}</span>}
          </div>
        </div>

        {/* Countdown badge */}
        {countdown && (
          <span style={{
            fontSize: 11, color: T.orange,
            border: `1px solid ${T.orange}`, borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap',
          }}>
            {countdown}
          </span>
        )}
        {client.deadline_expired && client.approval_status === 'pending' && (
          <span style={{ fontSize: 11, color: T.red, border: `1px solid ${T.red}`, borderRadius: 100, padding: '2px 9px' }}>
            48h expired
          </span>
        )}

        {/* Variants this month */}
        {client.approval_status === 'approved' && client.is_active && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{monthVariants.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: T.ghost }}>products</div>
          </div>
        )}

        {/* Status pill */}
        <StatusPill status={client.approval_status} expired={client.deadline_expired} />

        {/* Expand arrow */}
        <span style={{ fontSize: 11, color: T.ghost, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
      </div>

      {/* ── Expanded ────────────────────────────────────────────────── */}
      {isExpanded && (
        <div style={{ paddingBottom: 24, paddingLeft: 21 }}>

          {/* ── Tab switcher ────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid #F0F0F0', marginBottom: 24 }}>
            {(['info', 'requests'] as const).map(tab => {
              const isActive = activeTab === tab
              const pendingCount = tab === 'requests'
                ? requestHistory.filter(r => r.status === 'submitted').length
                : 0
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    fontSize: 14, fontWeight: isActive ? 500 : 400,
                    color: isActive ? '#111111' : '#CCCCCC',
                    background: 'none', border: 'none', cursor: 'pointer',
                    paddingBottom: 12, paddingLeft: 0, paddingRight: 0,
                    borderBottom: isActive ? '2px solid #111111' : '2px solid transparent',
                    fontFamily: 'inherit', transition: 'color 0.15s',
                    marginBottom: -1,
                  }}
                >
                  {tab === 'info' ? 'Client info' : `Optimization requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
                </button>
              )
            })}
          </div>

          {/* ── Client info tab ─────────────────────────────────────── */}
          {activeTab === 'info' && (<>

          {/* ── Optimization status ─────────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 10 }}>
              OPTIMIZATION STATUS
            </p>
            <OptimizationStatus
              clientId={client.id}
              vaId={currentVA!.id}
              onSwitchToRequests={() => setActiveTab('requests')}
            />
          </div>

          {/* ── Rejection notice ────────────────────────────────────── */}
          {client.approval_status === 'rejected' && client.rejection_reason && (
            <div style={{
              marginBottom: 20, padding: '12px 16px',
              background: '#FFF5F5', border: `1px solid #FFCCCC`, borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.red, marginBottom: 4 }}>REJECTION REASON</div>
              <div style={{ fontSize: 13, color: T.black }}>{client.rejection_reason}</div>
            </div>
          )}

          {/* ── Inactive notice ─────────────────────────────────────── */}
          {!client.is_active && client.approval_status === 'approved' && (
            <div style={{
              marginBottom: 20, padding: '12px 16px',
              background: '#F8F8F8', border: `1px solid ${T.div}`, borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.ghost, marginBottom: 4 }}>CLIENT INACTIVE</div>
              {client.deactivation_reason && (
                <div style={{ fontSize: 13, color: T.ter }}>{client.deactivation_reason}</div>
              )}
              {client.deactivated_at && (
                <div style={{ fontSize: 12, color: T.ghost, marginTop: 4 }}>Since {formatDate(client.deactivated_at)}</div>
              )}
            </div>
          )}

          {/* ── Grid layout ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 48px' }}>

            {/* Left column */}
            <div>
              <SectionLabel>Store details</SectionLabel>
              <InfoRow label="Store name"    value={client.store_name} />
              <InfoRow label="Domain"        value={client.store_domain} />
              <InfoRow label="Niche"         value={client.niche ? (NICHE_LABELS[client.niche] ?? client.niche) : null} />
              <InfoRow label="Market"        value={client.market ? `${flag} ${client.market}` : null} />
              <InfoRow label="Language"      value={client.language ? (LANG_LABELS[client.language] ?? client.language) : null} />
              <SectionLabel>Listing preferences</SectionLabel>
              {/* Title preference */}
              <div style={{ display: 'flex', alignItems: 'center', paddingBlock: 7, borderBottom: '1px solid #F5F5F5' }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: '#AAAAAA' }}>Title length</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['short', 'medium', 'long'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => { if (!savingPref) void savePref('title_preference', v) }}
                      disabled={savingPref}
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 100, border: 'none', cursor: savingPref ? 'default' : 'pointer',
                        background: titlePref === v ? '#111111' : '#F5F5F5',
                        color: titlePref === v ? '#FFFFFF' : '#999999',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description depth */}
              <div style={{ display: 'flex', alignItems: 'center', paddingBlock: 7, borderBottom: '1px solid #F5F5F5' }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: '#AAAAAA' }}>Description depth</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['minimal', 'standard', 'detailed'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => { if (!savingPref) void savePref('description_style', v) }}
                      disabled={savingPref}
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 100, border: 'none', cursor: savingPref ? 'default' : 'pointer',
                        background: descStyle === v ? '#111111' : '#F5F5F5',
                        color: descStyle === v ? '#FFFFFF' : '#999999',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* VA Rate per product */}
              <div style={{ display: 'flex', alignItems: 'center', paddingBlock: 7, borderBottom: '1px solid #F5F5F5' }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: '#AAAAAA' }}>Your rate</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#CCCCCC' }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={vaRate}
                    placeholder="0.65"
                    onChange={e => setVaRate(e.target.value)}
                    onBlur={() => void saveRate(vaRate)}
                    style={{
                      width: 72,
                      fontSize: 13,
                      color: '#111111',
                      border: 'none',
                      borderBottom: '1.5px solid #EEEEEE',
                      outline: 'none',
                      padding: '2px 0',
                      background: 'transparent',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => (e.currentTarget.style.borderBottomColor = '#111111')}
                  />
                  <span style={{ fontSize: 13, color: '#CCCCCC' }}>per product</span>
                  {rateSaved && <span style={{ fontSize: 11, color: '#10B981' }}>Saved ✓</span>}
                  {savingRate && <span style={{ fontSize: 11, color: '#CCCCCC' }}>Saving…</span>}
                </div>
                {parseFloat(vaRate) > 0 && parseFloat(vaRate) < 0.50 && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFFBEB', borderRadius: 6 }}>
                    <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
                      We recommend at least $0.50 per product. Most operators charge $0.65–$1.20.
                    </p>
                  </div>
                )}
              </div>

              <InfoRow label="Est. products" value={client.expected_monthly_products ? `${client.expected_monthly_products.toLocaleString()} / month` : null} />
              {/* Standing instructions — editable textarea */}
              <div style={{ paddingBlock: 9, borderBottom: `1px solid ${T.div}` }}>
                <div style={{ fontSize: 12, color: T.ghost, marginBottom: 6 }}>Standing instructions</div>
                <textarea
                  value={standingInstr}
                  onChange={e => setStandingInstr(e.target.value)}
                  onBlur={() => void saveStanding()}
                  placeholder={'Always include the brand name in the title.\nFocus on sustainability keywords.'}
                  rows={3}
                  style={{
                    width: '100%', fontFamily: 'inherit', fontSize: 13, color: T.black,
                    background: '#FAFAFA', border: `1px solid ${T.div}`, borderRadius: 6,
                    padding: '8px 10px', resize: 'vertical', outline: 'none',
                    boxSizing: 'border-box', lineHeight: 1.6, transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = T.black }}
                />
                <div style={{ height: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {standingSaved   && <span style={{ fontSize: 11, color: T.green }}>Saved ✓</span>}
                  {savingStanding  && <span style={{ fontSize: 11, color: T.ghost }}>Saving…</span>}
                  {!standingSaved && !savingStanding && standingInstr.trim() && (
                    <span style={{ fontSize: 11, color: T.ghost }}>Added to every upload for this client</span>
                  )}
                </div>
              </div>

              <SectionLabel>Billing</SectionLabel>
              <InfoRow label="Payment method" value={client.va_client_payment_method} />
              <InfoRow label="This month"     value={monthVariants > 0 ? `${monthTier} — $${monthAmount}` : 'No activity yet'} />
              <InfoRow label="Registered"     value={formatDate(client.registered_at)} />
              {client.approved_at && (
                <InfoRow label="Approved" value={formatDate(client.approved_at)} />
              )}
            </div>

            {/* Right column */}
            <div>
              <SectionLabel>Optimization profile</SectionLabel>
              {profile && profile.prompt_id ? (
                <>
                  <div style={{ paddingBlock: 9, borderBottom: `1px solid ${T.div}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#10B981', fontWeight: 500 }}>Optimization: Active</span>
                  </div>
                  {pendingRequests > 0 && (
                    <div style={{ paddingBlock: 9, borderBottom: `1px solid ${T.div}` }}>
                      <div style={{ fontSize: 13, color: T.orange }}>
                        {pendingRequests} pending change request{pendingRequests > 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ paddingBlock: 9, borderBottom: `1px solid ${T.div}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.ghost, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: T.ghost }}>
                    {client.approval_status === 'approved' ? 'Optimization: Pending setup' : 'Optimization: Pending setup'}
                  </span>
                </div>
              )}

              <SectionLabel>Lifetime stats</SectionLabel>
              <InfoRow label="Total uploads"   value={client.total_uploads ?? 0} />
              <InfoRow label="Total products"  value={(client.total_variants_processed ?? 0).toLocaleString()} />
              {client.last_upload_at && (
                <InfoRow label="Last upload" value={timeAgo(client.last_upload_at)} />
              )}

              <SectionLabel>Recent uploads</SectionLabel>
              {clientUploads.length === 0 ? (
                <div style={{ paddingBlock: 8 }}>
                  <div style={{ fontSize: 13, color: T.ghost, marginBottom: 10 }}>No uploads yet.</div>
                  {client.approval_status === 'approved' && client.is_active && (
                    <Link
                      href={`/dashboard/upload?client=${client.id}`}
                      style={{
                        fontSize: 12, color: T.black,
                        border: `1px solid ${T.div}`, borderRadius: 100,
                        padding: '6px 16px', textDecoration: 'none', display: 'inline-block',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = T.black}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = T.div}
                    >
                      Upload first file →
                    </Link>
                  )}
                </div>
              ) : (
                clientUploads.map(u => (
                  <UploadRow key={u.id} upload={u} onDownload={onDownload} dlWorking={dlWorking} />
                ))
              )}
            </div>
          </div>

          {/* ── Actions ─────────────────────────────────────────────── */}
          {client.approval_status === 'approved' && client.is_active && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              <Link
                href={`/dashboard/upload?client=${client.id}`}
                style={{
                  fontSize: 13, fontWeight: 500, color: '#FFFFFF',
                  background: T.black, border: 'none', borderRadius: 100,
                  padding: '9px 22px', textDecoration: 'none', display: 'inline-block',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              >
                Upload file
              </Link>
              <button
                onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                style={{
                  fontSize: 13, color: T.ter, background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0,
                  fontFamily: 'inherit', transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >
                View all uploads
              </button>
            </div>
          )}

          {client.approval_status === 'pending' && !client.deadline_expired && (
            <div style={{ marginTop: 16, fontSize: 13, color: T.ter }}>
              Awaiting admin approval.
              {countdown && <span style={{ color: T.orange, marginLeft: 6 }}>{countdown}</span>}
            </div>
          )}

          {client.deadline_expired && client.approval_status === 'pending' && (
            <div style={{ marginTop: 16, fontSize: 13, color: T.red }}>
              The 48-hour approval window has expired. Please contact support.
            </div>
          )}

          {client.approval_status === 'rejected' && (
            <div style={{ marginTop: 16, fontSize: 13, color: T.ter }}>
              This client was rejected and cannot be used.
            </div>
          )}

          </>)}

          {/* ── Optimization requests tab ───────────────────────────── */}
          {activeTab === 'requests' && (
            <div>
              <p style={{ fontSize: 18, fontWeight: 400, color: '#111111', marginBottom: 6 }}>What does your client need?</p>
              <p style={{ fontSize: 13, color: '#999999', marginBottom: 20 }}>
                Share preferences, brand guidelines, or examples. We&apos;ll build a custom optimization template.
              </p>

              {showSuccess ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: 15, color: '#2DB87E', fontWeight: 500 }}>Request submitted ✓</p>
                  <p style={{ fontSize: 13, color: '#CCCCCC', marginTop: 6 }}>We&apos;ll review it and update the template.</p>
                </div>
              ) : (
                <>
                  <textarea
                    value={requestMessage}
                    onChange={e => setRequestMessage(e.target.value)}
                    placeholder={'e.g. "Short titles, brand name first, no emoji. Formal tone. UK market. Always mention material and size."'}
                    maxLength={50000}
                    rows={6}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 14, color: '#111111', border: '1px solid #EEEEEE', borderRadius: 10, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white', transition: 'border-color 0.15s' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#111111' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#EEEEEE' }}
                  />

                  <div style={{ marginTop: 20 }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase', marginBottom: 10 }}>ATTACHMENTS</p>
                    {uploadedFiles.map((file, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: '#111111', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                        <span style={{ fontSize: 11, color: '#CCCCCC', flexShrink: 0 }}>{formatFileSize(file.size)}</span>
                        <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 16, color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                    {uploadedFiles.length < 5 && (
                      <label
                        style={{ display: 'inline-block', marginTop: 6, fontSize: 13, color: '#CCCCCC', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#111111' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#CCCCCC' }}
                      >
                        + Add file
                        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.csv" style={{ display: 'none' }}
                          onChange={e => {
                            const newFiles = Array.from(e.target.files || [])
                            const combined = [...uploadedFiles, ...newFiles].slice(0, 5)
                            const oversized = combined.filter(f => f.size > 5 * 1024 * 1024)
                            if (oversized.length > 0) { alert(`Files exceed 5MB: ${oversized.map(f => f.name).join(', ')}`); return }
                            setUploadedFiles(combined)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                    <p style={{ fontSize: 11, color: '#DDDDDD', marginTop: 6 }}>Max 5 files · 5MB each</p>
                  </div>

                  <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => void handleSubmitRequest()}
                      disabled={submitting || (!requestMessage.trim() && uploadedFiles.length === 0)}
                      style={{ padding: '12px 32px', borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: (requestMessage.trim() || uploadedFiles.length > 0) && !submitting ? '#111111' : '#F5F5F5', color: (requestMessage.trim() || uploadedFiles.length > 0) && !submitting ? 'white' : '#CCCCCC', transition: 'opacity 0.15s' }}
                    >
                      {submitting ? 'Submitting…' : 'Submit request'}
                    </button>
                  </div>
                </>
              )}

              {/* History */}
              {requestHistory.length > 0 && (
                <div style={{ marginTop: 36 }}>
                  <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: '#CCCCCC', textTransform: 'uppercase', marginBottom: 4 }}>HISTORY</p>
                  {requestHistory.map((req, idx) => {
                    const statusMap: Record<string, { color: string; label: string }> = {
                      submitted: { color: '#F59E0B', label: 'Submitted' },
                      reviewed:  { color: '#3B82F6', label: 'Reviewed' },
                      applied:   { color: '#2DB87E', label: 'Applied ✓' },
                      rejected:  { color: '#999999', label: 'Not applicable' },
                    }
                    const st = statusMap[req.status] || statusMap.submitted
                    return (
                      <div key={req.id} style={{ paddingTop: 16, paddingBottom: 16, borderBottom: idx < requestHistory.length - 1 ? '1px solid #F5F5F5' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: '#CCCCCC' }}>
                            {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: st.color }}>{st.label}</span>
                        </div>
                        {req.message && (
                          <p style={{ fontSize: 13, color: '#999999', marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: 'vertical' as const }}>
                            &quot;{req.message}&quot;
                          </p>
                        )}
                        {Array.isArray(req.file_names) && req.file_names.length > 0 && (
                          <p style={{ fontSize: 12, color: '#CCCCCC', marginBottom: 4 }}>📎 {req.file_names.length} file{req.file_names.length !== 1 ? 's' : ''}</p>
                        )}
                        {req.admin_response && (
                          <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #E8E8E8' }}>
                            <p style={{ fontSize: 12, color: '#999999' }}>{req.admin_response}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 80 }}>
      <div style={{ fontSize: 14, color: T.ter, marginBottom: 8 }}>No clients yet</div>
      <div style={{ fontSize: 13, color: T.ghost, marginBottom: 28 }}>
        Register your first client to start uploading and optimizing listings.
      </div>
      <Link
        href="/dashboard/clients/new"
        style={{
          fontSize: 13, fontWeight: 500, color: T.black,
          border: `1px solid ${T.div}`, borderRadius: 100,
          padding: '9px 22px', textDecoration: 'none', display: 'inline-block',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = T.black}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = T.div}
      >
        Register first client
      </Link>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router       = useRouter()
  const { currentVA } = useVA()

  const [clients,        setClients]       = useState<Client[]>([])
  const [uploadsMap,     setUploadsMap]    = useState<Record<string, Upload[]>>({})
  const [profilesMap,    setProfilesMap]   = useState<Record<string, ClientProfile>>({})
  const [promptsMap,     setPromptsMap]    = useState<Record<string, Prompt>>({})
  const [pendingReqMap,         setPendingReqMap]         = useState<Record<string, number>>({})
  const [promptPendingReqMap,   setPromptPendingReqMap]   = useState<Record<string, number>>({})
  const [loading,        setLoading]       = useState(true)
  const [search,         setSearch]        = useState('')
  const [filter,         setFilter]        = useState<Filter>('all')
  const [sort,           setSort]          = useState<Sort>('recent')
  const [expanded,       setExpanded]      = useState<string | null>(null)
  const [tick,           setTick]          = useState(0)
  const [dlWorking,      setDlWorking]     = useState<string | null>(null)

  // Countdown tick every 60s
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(iv)
  }, [])

  const load = useCallback(async () => {
    if (!currentVA) return
    setLoading(true)

    // 1. Clients
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('va_id', currentVA.id)
      .order('registered_at', { ascending: false })

    const clientList = (clientData ?? []) as Client[]
    setClients(clientList)

    if (clientList.length > 0) {
      const ids = clientList.map(c => c.id)

      // 2. Uploads (last 3 per client — fetch all, trim in JS)
      const { data: uploadData } = await supabase
        .from('uploads')
        .select('*')
        .in('client_id', ids)
        .order('uploaded_at', { ascending: false })

      const uMap: Record<string, Upload[]> = {}
      for (const u of (uploadData ?? []) as Upload[]) {
        if (!uMap[u.client_id]) uMap[u.client_id] = []
        if (uMap[u.client_id].length < 3) uMap[u.client_id].push(u)
      }
      setUploadsMap(uMap)

      // 3. Client profiles
      const { data: profileData } = await supabase
        .from('client_profiles')
        .select('*')
        .in('client_id', ids)

      const pMap: Record<string, ClientProfile> = {}
      const promptIds: string[] = []
      for (const p of (profileData ?? []) as ClientProfile[]) {
        pMap[p.client_id] = p
        if (p.prompt_id && !promptIds.includes(p.prompt_id)) promptIds.push(p.prompt_id)
      }
      setProfilesMap(pMap)

      // 4. Prompts (for profile names)
      if (promptIds.length > 0) {
        const { data: promptData } = await supabase
          .from('prompts')
          .select('id, name, niche, language, version')
          .in('id', promptIds)

        const prMap: Record<string, Prompt> = {}
        for (const pr of (promptData ?? []) as Prompt[]) {
          prMap[pr.id] = pr
        }
        setPromptsMap(prMap)
      }

      // 5. Pending profile change requests count per client
      const { data: reqData } = await supabase
        .from('profile_change_requests')
        .select('client_id')
        .in('client_id', ids)
        .eq('status', 'pending')

      const reqMap: Record<string, number> = {}
      for (const r of (reqData ?? []) as ProfileChangeRequest[]) {
        reqMap[r.client_id] = (reqMap[r.client_id] ?? 0) + 1
      }
      setPendingReqMap(reqMap)

      // 6. Submitted prompt_requests count per client (for list badge)
      const { data: promptReqData } = await supabase
        .from('prompt_requests')
        .select('client_id')
        .in('client_id', ids)
        .eq('va_id', currentVA.id)
        .eq('status', 'submitted')

      const promptReqMap: Record<string, number> = {}
      for (const r of (promptReqData ?? []) as { client_id: string }[]) {
        promptReqMap[r.client_id] = (promptReqMap[r.client_id] ?? 0) + 1
      }
      setPromptPendingReqMap(promptReqMap)
    }

    setLoading(false)
  }, [currentVA])

  useEffect(() => { load() }, [load])

  const handleDownload = async (upload: Upload) => {
    setDlWorking(upload.id)
    await downloadOutput(upload)
    setDlWorking(null)
  }

  // ── Filter + search + sort ───────────────────────────────────────────────

  const filtered = clients
    .filter(c => clientMatchesFilter(c, filter))
    .filter(c => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        c.store_name.toLowerCase().includes(q) ||
        (c.store_domain ?? '').toLowerCase().includes(q) ||
        (c.market ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sort === 'name')     return a.store_name.localeCompare(b.store_name)
      if (sort === 'variants') return (b.current_month_variants ?? 0) - (a.current_month_variants ?? 0)
      if (sort === 'oldest')   return new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime()
      // recent: last_upload_at ?? registered_at
      const aT = a.last_upload_at ?? a.registered_at
      const bT = b.last_upload_at ?? b.registered_at
      return new Date(bT).getTime() - new Date(aT).getTime()
    })

  const counts: Record<Filter, number> = {
    all:      clients.length,
    active:   clients.filter(c => clientMatchesFilter(c, 'active')).length,
    pending:  clients.filter(c => clientMatchesFilter(c, 'pending')).length,
    rejected: clients.filter(c => clientMatchesFilter(c, 'rejected')).length,
    inactive: clients.filter(c => clientMatchesFilter(c, 'inactive')).length,
    expired:  clients.filter(c => clientMatchesFilter(c, 'expired')).length,
  }

  if (!currentVA) return null

  return (
    <div style={{ paddingTop: 48, paddingBottom: 100, maxWidth: 960, margin: '0 auto', paddingInline: 48 }}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 300, color: T.black }}>
          Clients
          {!loading && clients.length > 0 && (
            <span style={{ fontSize: 14, fontWeight: 400, color: T.ghost, marginLeft: 10 }}>
              {clients.length}
            </span>
          )}
        </div>
        <Link
          href="/dashboard/clients/new"
          style={{
            fontSize: 13, fontWeight: 500, color: '#FFFFFF',
            background: T.black, borderRadius: 100,
            padding: '9px 20px', textDecoration: 'none', display: 'inline-block',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
        >
          + New client
        </Link>
      </div>

      {/* ── Search + Sort ────────────────────────────────────────────── */}
      {clients.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by store name, domain or market…"
              style={{
                flex: 1, fontSize: 13, color: T.black,
                border: `1px solid ${T.div}`, borderRadius: 8,
                padding: '9px 14px', fontFamily: 'inherit', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = T.black }}
              onBlur={e => { e.target.style.borderColor = T.div }}
            />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as Sort)}
              style={{
                fontSize: 13, color: T.black,
                border: `1px solid ${T.div}`, borderRadius: 8,
                padding: '9px 14px', fontFamily: 'inherit', outline: 'none',
                background: T.bg, cursor: 'pointer',
              }}
            >
              <option value="recent">Recent activity</option>
              <option value="name">Name A–Z</option>
              <option value="variants">Most products</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          {/* ── Filter pills ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {(['all', 'active', 'pending', 'rejected', 'inactive', 'expired'] as Filter[]).map(f => {
              const active = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontSize: 12, fontWeight: active ? 500 : 400,
                    color: active ? T.black : T.ghost,
                    background: active ? T.div : 'none',
                    border: `1px solid ${active ? T.div : T.div}`,
                    borderRadius: 100, padding: '5px 14px',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {counts[f] > 0 && <span style={{ marginLeft: 4, color: active ? T.sec : T.ghost }}>{counts[f]}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Content ──────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ fontSize: 13, color: T.ghost, paddingTop: 20 }}>Loading…</div>
      ) : clients.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: T.ghost, paddingTop: 20 }}>No clients match your search or filter.</div>
      ) : (
        filtered.map(client => (
          <ClientRow
            key={client.id}
            client={client}
            clientUploads={uploadsMap[client.id] ?? []}
            profile={profilesMap[client.id] ?? null}
            prompt={
              profilesMap[client.id]?.prompt_id
                ? (promptsMap[profilesMap[client.id]!.prompt_id!] ?? null)
                : null
            }
            pendingRequests={pendingReqMap[client.id] ?? 0}
            promptPendingRequests={promptPendingReqMap[client.id] ?? 0}
            isExpanded={expanded === client.id}
            onToggle={() => setExpanded(expanded === client.id ? null : client.id)}
            onDownload={handleDownload}
            dlWorking={dlWorking}
            tick={tick}
            router={router}
          />
        ))
      )}
    </div>
  )
}
