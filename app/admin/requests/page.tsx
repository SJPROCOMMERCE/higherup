'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestWithRelations = {
  id: string
  client_id: string
  va_id: string
  message: string | null
  file_urls: string[]
  file_names: string[]
  file_paths: string[]
  structured_data: Record<string, unknown> | null
  status: 'submitted' | 'reviewed' | 'applied' | 'rejected'
  admin_response: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  applied_at: string | null
  linked_prompt_id: string | null
  created_at: string
  updated_at: string
  clients: { id: string; store_name: string; niche: string | null; language: string | null; market: string | null; va_id: string } | null
  vas: { id: string; name: string } | null
}

type Stats = { pending: number; reviewed: number; applied: number; total: number }
type FilterKey = 'submitted' | 'reviewed' | 'applied' | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    submitted: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    reviewed:  { bg: '#DBEAFE', color: '#1E40AF', label: 'Reviewed' },
    applied:   { bg: '#D1FAE5', color: '#065F46', label: 'Applied' },
    rejected:  { bg: '#F3F4F6', color: '#6B7280', label: 'Not applicable' },
  }
  const c = config[status] || config.submitted
  return (
    <span style={{ background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>
      {c.label}
    </span>
  )
}

// ─── RequestFile ──────────────────────────────────────────────────────────────

function RequestFile({ name, path }: { name: string; path: string }) {
  const [url, setUrl] = useState<string | null>(path.startsWith('http') ? path : null)
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)

  useEffect(() => {
    if (!path.startsWith('http')) {
      supabase.storage.from('prompt-requests').createSignedUrl(path, 3600).then(({ data }) => {
        if (data?.signedUrl) setUrl(data.signedUrl)
      })
    }
  }, [path])

  function handleView() {
    if (url) window.open(url, '_blank')
  }

  function handleDownload() {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      {isImage && url ? (
        <img src={url} alt={name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #EEEEEE', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 6, background: '#F5F5F7', border: '1px solid #EEEEEE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: '#86868B', textTransform: 'uppercase' }}>{ext || 'file'}</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      </div>
      <button
        type="button"
        onClick={handleView}
        disabled={!url}
        style={{ fontSize: 11, color: '#86868B', background: 'none', border: 'none', cursor: url ? 'pointer' : 'default', padding: '3px 8px', borderRadius: 6, fontFamily: 'inherit', opacity: url ? 1 : 0.4 }}
      >
        View
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={!url}
        style={{ fontSize: 11, color: '#86868B', background: 'none', border: 'none', cursor: url ? 'pointer' : 'default', padding: '3px 8px', borderRadius: 6, fontFamily: 'inherit', opacity: url ? 1 : 0.4 }}
      >
        Download
      </button>
    </div>
  )
}

// ─── StructuredData ───────────────────────────────────────────────────────────

function StructuredData({ data }: { data: Record<string, unknown> }) {
  const label = (s: string) => (
    <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginBottom: 3 }}>{s}</div>
  )
  const val = (v: unknown) => (
    <div style={{ fontSize: 13, color: '#1D1D1F' }}>{String(v)}</div>
  )
  const gridFields: Array<{ key: string; label: string }> = [
    { key: 'platform',           label: 'Platform' },
    { key: 'maxDiscount',        label: 'Max Discount' },
    { key: 'competitorPriceDiff',label: 'Competitor Price Diff' },
    { key: 'skuStructure',       label: 'SKU Structure' },
    { key: 'avgStock',           label: 'Avg Stock' },
  ]
  const fullFields: Array<{ key: string; label: string }> = [
    { key: 'titlePrompt',        label: 'Title Prompt' },
    { key: 'descriptionPrompt',  label: 'Description Prompt' },
    { key: 'collections',        label: 'Collections' },
    { key: 'additionalNotes',    label: 'Additional Notes' },
  ]

  const hasGrid = gridFields.some(f => data[f.key] != null && data[f.key] !== '')
  const hasFull = fullFields.some(f => data[f.key] != null && data[f.key] !== '')
  if (!hasGrid && !hasFull) return null

  return (
    <div style={{ marginTop: 10, padding: '12px 16px', background: '#FAFAFA', borderRadius: 10, border: '1px solid #EEEEEE' }}>
      {hasGrid && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: hasFull ? 12 : 0 }}>
          {gridFields.map(f => {
            if (data[f.key] == null || data[f.key] === '') return null
            return (
              <div key={f.key}>
                {label(f.label)}
                {val(data[f.key])}
              </div>
            )
          })}
        </div>
      )}
      {hasFull && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fullFields.map(f => {
            if (data[f.key] == null || data[f.key] === '') return null
            return (
              <div key={f.key}>
                {label(f.label)}
                <div style={{ fontSize: 13, color: '#1D1D1F', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{String(data[f.key])}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── RequestActions ───────────────────────────────────────────────────────────

type PromptTemplate = { id: string; name: string; niche: string | null; language: string | null }

function RequestActions({ req, onUpdate }: { req: RequestWithRelations; onUpdate: () => void }) {
  const [response,          setResponse]          = useState(req.admin_response ?? '')
  const [selectedTemplateId,setSelectedTemplateId] = useState(req.linked_prompt_id ?? '')
  const [templates,         setTemplates]         = useState<PromptTemplate[]>([])
  const [processing,        setProcessing]        = useState(false)

  useEffect(() => {
    supabase
      .from('prompts')
      .select('id, name, niche, language')
      .eq('is_active', true)
      .order('niche')
      .order('name')
      .then(({ data }) => setTemplates((data ?? []) as PromptTemplate[]))
  }, [])

  async function handleAction(action: 'reviewed' | 'applied' | 'rejected') {
    setProcessing(true)
    const now = new Date().toISOString()

    const updates: Record<string, unknown> = {
      status: action,
      admin_response: response || null,
      updated_at: now,
    }
    if (action === 'reviewed')  updates.reviewed_at = now
    if (action === 'applied')   updates.applied_at = now
    if (action === 'applied' && selectedTemplateId) updates.linked_prompt_id = selectedTemplateId

    await supabase.from('prompt_requests').update(updates).eq('id', req.id)

    // If applied + template selected → upsert client_profiles
    if (action === 'applied' && selectedTemplateId && req.client_id) {
      await supabase
        .from('client_profiles')
        .upsert({ client_id: req.client_id, prompt_id: selectedTemplateId, updated_at: now }, { onConflict: 'client_id' })
    }

    // Send notification to VA (skip for 'reviewed')
    if (action === 'applied' || action === 'rejected') {
      const notifType = action === 'applied' ? 'request_approved' : 'request_rejected'
      const store = req.clients?.store_name ?? 'your client'
      const title = action === 'applied'
        ? `Optimization request approved for ${store}`
        : `Optimization request not applicable for ${store}`
      const message = response || null

      await supabase.from('notifications').insert({
        va_id:   req.va_id,
        type:    notifType,
        title,
        message,
        is_read: false,
      })
    }

    setProcessing(false)
    onUpdate()
  }

  return (
    <div style={{ marginTop: 14, padding: '14px 16px', background: '#FAFAFA', borderRadius: 10, border: '1px solid #EEEEEE' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginBottom: 10 }}>
        Admin response
      </div>

      <textarea
        value={response}
        onChange={e => setResponse(e.target.value)}
        placeholder="Optional note to the VA…"
        rows={3}
        style={{
          width: '100%', resize: 'vertical', fontSize: 13, color: '#1D1D1F',
          background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 8,
          padding: '8px 12px', fontFamily: 'inherit', outline: 'none',
          boxSizing: 'border-box', marginBottom: 10,
        }}
      />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginBottom: 6 }}>
          Link to template
        </div>
        <select
          value={selectedTemplateId}
          onChange={e => setSelectedTemplateId(e.target.value)}
          style={{ fontSize: 13, color: '#1D1D1F', border: '1px solid #EEEEEE', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', outline: 'none', background: '#FFFFFF', width: '100%' }}
        >
          <option value="">— Select template —</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.niche ? ` · ${t.niche}` : ''}{t.language ? ` · ${t.language}` : ''}
            </option>
          ))}
        </select>
        {selectedTemplateId && (
          <a
            href={`/admin/prompts?edit=${selectedTemplateId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: '#86868B', textDecoration: 'none' }}
          >
            Edit this template in a new tab →
          </a>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => handleAction('reviewed')}
          disabled={processing}
          style={{ fontSize: 12, color: '#1D1D1F', background: 'none', border: '1px solid #DDDDDD', borderRadius: 100, padding: '7px 18px', cursor: processing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: processing ? 0.5 : 1, transition: 'all 0.15s' }}
        >
          Mark reviewed
        </button>
        <button
          type="button"
          onClick={() => handleAction('applied')}
          disabled={processing}
          style={{ fontSize: 12, color: '#FFFFFF', background: '#1D1D1F', border: '1px solid #1D1D1F', borderRadius: 100, padding: '7px 18px', cursor: processing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: processing ? 0.5 : 1, transition: 'all 0.15s' }}
        >
          Apply &amp; update template
        </button>
        <button
          type="button"
          onClick={() => handleAction('rejected')}
          disabled={processing}
          style={{ fontSize: 12, color: '#86868B', background: 'none', border: 'none', padding: '7px 4px', cursor: processing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: processing ? 0.5 : 1 }}
        >
          Not applicable
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminRequestsPage() {
  const [filter,   setFilter]   = useState<FilterKey>('submitted')
  const [requests, setRequests] = useState<RequestWithRelations[]>([])
  const [stats,    setStats]    = useState<Stats>({ pending: 0, reviewed: 0, applied: 0, total: 0 })
  const [loading,  setLoading]  = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)

    // Stats query (all statuses)
    const { data: allForStats } = await supabase
      .from('prompt_requests')
      .select('status')

    const s = { pending: 0, reviewed: 0, applied: 0, total: 0 }
    for (const r of (allForStats ?? []) as { status: string }[]) {
      s.total++
      if (r.status === 'submitted') s.pending++
      else if (r.status === 'reviewed') s.reviewed++
      else if (r.status === 'applied') s.applied++
    }
    setStats(s)

    // Filtered query
    let q = supabase
      .from('prompt_requests')
      .select('*, clients(id, store_name, niche, language, market, va_id), vas(id, name)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      q = q.eq('status', filter)
    }

    const { data: filtered } = await q
    setRequests((filtered ?? []) as unknown as RequestWithRelations[])
    setLoading(false)
  }, [filter])

  useEffect(() => { loadAll() }, [loadAll])

  const filterTabs: Array<{ key: FilterKey; label: string; count?: number }> = [
    { key: 'submitted', label: 'Pending',  count: stats.pending },
    { key: 'reviewed',  label: 'Reviewed', count: stats.reviewed },
    { key: 'applied',   label: 'Applied',  count: stats.applied },
    { key: 'all',       label: 'All',      count: stats.total },
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Title */}
      <h1 style={{ fontSize: 28, fontWeight: 400, color: '#1D1D1F', margin: '0 0 28px 0', letterSpacing: '-0.01em' }}>
        Optimization Requests
      </h1>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#92400E', letterSpacing: '-0.02em', lineHeight: 1 }}>{stats.pending}</div>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginTop: 4 }}>Pending</div>
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#1E40AF', letterSpacing: '-0.02em', lineHeight: 1 }}>{stats.reviewed}</div>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginTop: 4 }}>Reviewed</div>
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#065F46', letterSpacing: '-0.02em', lineHeight: 1 }}>{stats.applied}</div>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginTop: 4 }}>Applied</div>
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#86868B', letterSpacing: '-0.02em', lineHeight: 1 }}>{stats.total}</div>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginTop: 4 }}>Total</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {filterTabs.map(t => {
          const active = filter === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              style={{
                padding: '5px 16px', borderRadius: 100, fontSize: 12,
                background: active ? '#1D1D1F' : 'none',
                color:      active ? '#FFFFFF'  : '#999999',
                border:     `1px solid ${active ? '#1D1D1F' : '#EEEEEE'}`,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
            </button>
          )
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ fontSize: 13, color: '#CCCCCC', paddingTop: 40, textAlign: 'center' }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ fontSize: 13, color: '#CCCCCC', paddingTop: 40, textAlign: 'center' }}>
          {filter === 'all' ? 'No requests yet.' : 'All caught up.'}
        </div>
      ) : (
        requests.map(req => (
          <RequestCard key={req.id} req={req} onUpdate={loadAll} />
        ))
      )}
    </div>
  )
}

// ─── RequestCard ──────────────────────────────────────────────────────────────

function RequestCard({ req, onUpdate }: { req: RequestWithRelations; onUpdate: () => void }) {
  const storeName = req.clients?.store_name ?? '—'
  const vaName    = req.vas?.name ?? '—'
  const niche     = req.clients?.niche ?? null
  const language  = req.clients?.language ?? null
  const meta      = [vaName, niche, language].filter(Boolean).join(' · ')

  const canAct = req.status === 'submitted' || req.status === 'reviewed'
  const isDone = req.status === 'applied' || req.status === 'rejected'

  return (
    <div style={{ paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid #F0F0F0' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1D1D1F' }}>{storeName}</span>
          <StatusBadge status={req.status} />
        </div>
        <span style={{ fontSize: 12, color: '#86868B' }}>{formatRelativeTime(req.created_at)}</span>
      </div>

      {/* Sub-label */}
      <div style={{ fontSize: 12, color: '#86868B', marginBottom: 10 }}>via {meta}</div>

      {/* Message */}
      {req.message && (
        <div style={{ fontSize: 13, color: '#1D1D1F', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {req.message}
        </div>
      )}

      {/* Structured data */}
      {req.structured_data && Object.keys(req.structured_data).length > 0 && (
        <StructuredData data={req.structured_data} />
      )}

      {/* Files */}
      {(req.file_names?.length ?? 0) > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginBottom: 4 }}>
            Attachments
          </div>
          {req.file_names.map((name, i) => (
            <RequestFile
              key={i}
              name={name}
              path={req.file_paths?.[i] ?? req.file_urls?.[i] ?? ''}
            />
          ))}
        </div>
      )}

      {/* Actions (for pending / reviewed) */}
      {canAct && <RequestActions req={req} onUpdate={onUpdate} />}

      {/* Admin response block (for resolved) */}
      {isDone && req.admin_response && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#F5F5F7', borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CCCCCC', marginBottom: 4 }}>
            Admin response
          </div>
          <div style={{ fontSize: 13, color: '#1D1D1F', whiteSpace: 'pre-wrap' }}>{req.admin_response}</div>
        </div>
      )}
    </div>
  )
}
